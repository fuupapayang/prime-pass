'use strict';
/**
 * PRIME PASS (staging) Cloud Functions
 *  - intake        : 登録フォーム → 名前・メール・電話を受け取り、使い捨ての「一時番号」を返す（個人情報はURLに載せない）
 *  - redeemToken   : アプリが一時番号を渡して、ログイン用の鍵に交換（交換後は無効）
 *  - savePushToken : プッシュ通知の宛先を保存
 *  - sendNotice    : 物件担当者などが、お知らせを作成して配信
 *  - submitInquiry : 問い合わせ・来場予約
 *  - logEvent      : 行動ログ（匿名IDで記録）
 * 個人情報は contacts のみ。QLEA・ES CON本社は読めない（firestore.rules）。
 */
const { setGlobalOptions } = require('firebase-functions/v2');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const BUCKET = 'smipocket-stg.firebasestorage.app';

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

setGlobalOptions({ region: 'asia-northeast1', maxInstances: 5, memory: '256MiB' });

const SITE = 'https://fuupapayang.github.io/prime-pass/';
const ALLOWED_ORIGINS = [
  'https://fuupapayang.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5000',
];
// 物件の一覧は、Firestore の properties（掲載停止した物件は除く）。20秒だけ覚えておく
let propCache = { at: 0, ids: [] };
async function activeProps() {
  if (Date.now() - propCache.at < 20000) return propCache.ids;
  const snap = await db.collection('properties').get();
  propCache = { at: Date.now(), ids: snap.docs.filter((d) => d.data().status !== 'archived').map((d) => d.id) };
  return propCache.ids;
}
const invalidateProps = () => { propCache = { at: 0, ids: [] }; };
const TOKEN_TTL_SEC = 15 * 60;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

async function audit(actor, action, detail) {
  await db.collection('auditLogs').add({ actor, action, detail: detail || {}, at: FieldValue.serverTimestamp() });
}

// 担当者（ADEX・QLEA・ES CON本社・物件担当者）は、二段階認証（認証アプリ）でログインした場合だけ、操作できる
const hasMfa = (auth) => !!(auth.token.firebase && auth.token.firebase.sign_in_second_factor === 'totp');
function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
  const r = req.auth.token.role;
  if (r && r !== 'member' && !hasMfa(req.auth)) throw new HttpsError('permission-denied', '二段階認証が必要です。認証アプリのコードで、ログインし直してください');
  return req.auth;
}

/* ---------- 1. 登録フォームからの受け取り ---------- */
// 「ご関心あるプロジェクト」の文字を、物件に結びつける（空白・記号・括弧を除いて、物件名と部分一致）
const normName = (s) => String(s || '').replace(/[\s\u3000\[\]［］()（）「」・\/／\-–—,，、]/g, '').toLowerCase();
async function matchProjects(list) {
  const snap = await db.collection('properties').get();
  const props = snap.docs.filter((d) => d.data().status !== 'archived' && d.id !== 'prime').map((d) => ({ id: d.id, n: normName(d.data().name) }));
  const hit = new Set();
  for (const raw of list) {
    const x = normName(raw);
    if (!x) continue;
    for (const p of props) if (p.n && (x.includes(p.n) || p.n.includes(x))) hit.add(p.id);
  }
  return [...hit];
}

exports.intake = onRequest({ cors: ALLOWED_ORIGINS }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const b = req.body || {};
  const name = clean(b.name, 60);
  const email = clean(b.email, 120).toLowerCase();
  const phone = clean(b.phone, 30);
  const formType = clean(b.formType || 'entry', 20);
  const ap = await activeProps();
  let targets = [];
  if (b.property) {
    const one = clean(b.property, 20);
    if (ap.includes(one)) targets = [one];
  } else if (Array.isArray(b.projects)) {
    targets = (await matchProjects(b.projects.slice(0, 30).map((x) => clean(x, 120)))).filter((id) => ap.includes(id));
    if (!targets.length && ap.includes('prime')) targets = ['prime']; // 物件が選ばれていない場合は、会員向けページのみ
  }
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !phone || !targets.length || b.consent !== true) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const emailHash = sha256(email);
  const idxRef = db.collection('intakeIndex').doc(emailHash);
  const idx = await idxRef.get();
  let cid;
  let anonId;
  if (idx.exists) {
    cid = idx.data().cid;
    anonId = idx.data().anonId;
  } else {
    cid = db.collection('contacts').doc().id;
    anonId = 'm_' + crypto.randomBytes(4).toString('hex');
    await idxRef.set({ cid, anonId, createdAt: FieldValue.serverTimestamp() });
  }

  const batch = db.batch();
  for (const property of targets) {
    const mid = `${cid}_${property}`;
    batch.set(
      db.collection('contacts').doc(mid),
      { cid, property, name, email, phone, consentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    const msRef = db.collection('memberships').doc(mid);
    const msSnap = await msRef.get();
    if (msSnap.exists) batch.update(msRef, { tags: FieldValue.arrayUnion(formType) });
    else batch.set(msRef, { cid, anonId, property, tags: [formType], joinedAt: FieldValue.serverTimestamp(), lastSeenAt: null, pushEnabled: false });
  }
  const token = crypto.randomBytes(24).toString('base64url');
  batch.set(db.collection('tokens').doc(sha256(token)), {
    cid,
    exp: Timestamp.fromMillis(Date.now() + TOKEN_TTL_SEC * 1000),
    used: false,
  });
  await batch.commit();
  await audit('system', 'intake', { anonId, properties: targets, formType });
  return res.json({ token, expiresInSec: TOKEN_TTL_SEC, properties: targets });
});

/* ---------- 2. 一時番号 → ログイン ---------- */
exports.redeemToken = onCall(async (req) => {
  const token = clean(req.data && req.data.token, 80);
  if (!token) throw new HttpsError('invalid-argument', 'token required');
  const ref = db.collection('tokens').doc(sha256(token));
  const cid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', '一時番号が見つかりません');
    const d = snap.data();
    if (d.used) throw new HttpsError('failed-precondition', 'この一時番号は、すでに使われています');
    if (d.exp.toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', '一時番号の有効期限が切れています');
    tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
    return d.cid;
  });
  const customToken = await admin.auth().createCustomToken(cid, { role: 'member' });
  return { customToken };
});

/* ---------- 3. プッシュ通知の宛先 ---------- */
exports.savePushToken = onCall(async (req) => {
  const auth = requireAuth(req);
  if (auth.token.role !== 'member') throw new HttpsError('permission-denied', 'お客様のみ');
  const token = clean(req.data && req.data.token, 400);
  if (!token) throw new HttpsError('invalid-argument', 'token required');
  const cid = auth.uid;
  await db.collection('pushTokens').doc(cid).set({ tokens: FieldValue.arrayUnion(token), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const ms = await db.collection('memberships').where('cid', '==', cid).get();
  const batch = db.batch();
  ms.forEach((d) => batch.update(d.ref, { pushEnabled: true }));
  await batch.commit();
  return { ok: true };
});

/* ---------- 4. お知らせの作成・承認・配信・予約 ---------- */
// 権限: ADEXは全物件（依頼時の代行）。物件担当者は自物件のみ。QLEAは、期間つきの代行権限がある場合のみ。ES CON本社は不可
function canSendTo(auth, property) {
  const role = auth.token.role;
  if (role === 'adex') return true;
  if (role === 'staff') return Array.isArray(auth.token.properties) && auth.token.properties.includes(property);
  if (role === 'qlea') return Number(auth.token.delegateUntil || 0) > Date.now();
  return false;
}
async function needsApproval(property, role) {
  if (role === 'adex') return false; // 承認者は、ADEX
  const p = await db.collection('properties').doc(property).get();
  return !!(p.exists && p.data().approvalRequired);
}
const { onSchedule } = require('firebase-functions/v2/scheduler');

// 実際の配信（お知らせの保存 → プッシュ通知 → 結果の記録）
async function deliver({ property, title, body, actor, role }) {
  const noticeRef = await db.collection('notices').add({
    property, title, body, createdBy: actor, createdByRole: role, publishedAt: FieldValue.serverTimestamp(),
  });
  const ms = await db.collection('memberships').where('property', '==', property).get();
  const cids = [...new Set(ms.docs.map((d) => d.data().cid))];
  const tokenDocs = await Promise.all(cids.map((c) => db.collection('pushTokens').doc(c).get()));
  const tokens = [];
  const owner = {};
  tokenDocs.forEach((snap, i) => {
    if (snap.exists) (snap.data().tokens || []).forEach((t) => { tokens.push(t); owner[t] = cids[i]; });
  });
  let success = 0;
  let failure = 0;
  const bad = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const r = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title, body },
      webpush: { fcmOptions: { link: SITE + '#/notices' } },
      data: { property, noticeId: noticeRef.id },
    });
    success += r.successCount;
    failure += r.failureCount;
    r.responses.forEach((x, j) => {
      if (!x.success && x.error && /registration-token-not-registered|invalid-argument/.test(x.error.code || '')) bad.push(chunk[j]);
    });
  }
  for (const t of bad) {
    await db.collection('pushTokens').doc(owner[t]).update({ tokens: FieldValue.arrayRemove(t) }).catch(() => {});
  }
  const stats = { members: cids.length, pushTargets: tokens.length, success, failure };
  await noticeRef.update({ stats });
  await audit(actor, 'sendNotice', { role, property, ...stats });
  return { noticeId: noticeRef.id, ...stats };
}

// いますぐ配信（承認が必要な物件では、担当者は使えない）
exports.sendNotice = onCall(async (req) => {
  const auth = requireAuth(req);
  const role = auth.token.role;
  const property = clean(req.data && req.data.property, 20);
  const title = clean(req.data && req.data.title, 80);
  const body = clean(req.data && req.data.body, 300);
  if (!(await activeProps()).includes(property) || !title || !body) throw new HttpsError('invalid-argument', '物件・タイトル・本文が必要です');
  if (!canSendTo(auth, property)) {
    await audit(auth.uid, 'sendNotice_denied', { role, property });
    throw new HttpsError('permission-denied', 'この役割では、この物件の通知を配信できません');
  }
  if (await needsApproval(property, role)) throw new HttpsError('failed-precondition', 'この物件の通知は、承認が必要です。承認を依頼してください');
  return deliver({ property, title, body, actor: auth.uid, role });
});

// 下書き保存／承認の依頼／予約／いますぐ配信
exports.saveNotice = onCall(async (req) => {
  const auth = requireAuth(req);
  const role = auth.token.role;
  const d = req.data || {};
  const property = clean(d.property, 20);
  const title = clean(d.title, 30);
  const body = clean(d.body, 80);
  if (!(await activeProps()).includes(property) || !title || !body) throw new HttpsError('invalid-argument', '物件・タイトル（30文字まで）・本文（80文字まで）が必要です');
  if (!canSendTo(auth, property)) {
    await audit(auth.uid, 'saveNotice_denied', { role, property });
    throw new HttpsError('permission-denied', 'この役割では、この物件の通知を作成できません');
  }
  const action = d.action === 'draft' ? 'draft' : 'submit';
  const at = d.scheduleAt ? Number(d.scheduleAt) : null;
  if (at && at < Date.now() + 30000) throw new HttpsError('invalid-argument', '予約の日時は、いまより先にしてください');
  const base = { property, title, body, scheduledAt: at ? Timestamp.fromMillis(at) : null, updatedAt: FieldValue.serverTimestamp() };
  let ref;
  if (d.id) {
    ref = db.collection('outbox').doc(clean(d.id, 60));
    const cur = await ref.get();
    if (!cur.exists) throw new HttpsError('not-found', '通知が見つかりません');
    if (cur.data().createdBy !== auth.uid && role !== 'adex') throw new HttpsError('permission-denied', '他の方が作成した通知は、編集できません');
  } else {
    ref = db.collection('outbox').doc();
    base.createdBy = auth.uid;
    base.createdByRole = role;
    base.createdAt = FieldValue.serverTimestamp();
  }
  if (action === 'draft') { await ref.set({ ...base, status: 'draft' }, { merge: true }); return { id: ref.id, status: 'draft' }; }
  if (await needsApproval(property, role)) {
    await ref.set({ ...base, status: 'pending', submittedAt: FieldValue.serverTimestamp(), rejectNote: '' }, { merge: true });
    await audit(auth.uid, 'notice_submit', { role, property, id: ref.id });
    return { id: ref.id, status: 'pending' };
  }
  if (at) {
    await ref.set({ ...base, status: 'scheduled' }, { merge: true });
    await audit(auth.uid, 'notice_schedule', { role, property, id: ref.id, at });
    return { id: ref.id, status: 'scheduled' };
  }
  const r = await deliver({ property, title, body, actor: auth.uid, role });
  await ref.delete().catch(() => {});
  return { id: ref.id, status: 'sent', stats: r };
});

// 承認・差し戻し（承認者＝ADEX）
exports.reviewNotice = onCall(async (req) => {
  const auth = requireRole(req, ['adex']);
  const id = clean(req.data && req.data.id, 60);
  const decision = req.data && req.data.decision === 'reject' ? 'reject' : 'approve';
  const ref = db.collection('outbox').doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== 'pending') throw new HttpsError('failed-precondition', '承認待ちの通知ではありません');
  const n = snap.data();
  if (decision === 'reject') {
    await ref.update({ status: 'draft', rejectNote: clean(req.data.note, 200), updatedAt: FieldValue.serverTimestamp() });
    await audit(auth.uid, 'notice_reject', { id, property: n.property });
    return { status: 'draft' };
  }
  await audit(auth.uid, 'notice_approve', { id, property: n.property });
  if (n.scheduledAt && n.scheduledAt.toMillis() > Date.now() + 30000) {
    await ref.update({ status: 'scheduled', approvedBy: auth.uid, updatedAt: FieldValue.serverTimestamp() });
    return { status: 'scheduled' };
  }
  const r = await deliver({ property: n.property, title: n.title, body: n.body, actor: n.createdBy, role: n.createdByRole });
  await ref.delete().catch(() => {});
  return { status: 'sent', stats: r };
});

// 下書き・承認待ち・予約の取り下げ
exports.deleteOutbox = onCall(async (req) => {
  const auth = requireAuth(req);
  const ref = db.collection('outbox').doc(clean(req.data && req.data.id, 60));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', '通知が見つかりません');
  if (snap.data().createdBy !== auth.uid && auth.token.role !== 'adex') throw new HttpsError('permission-denied', '他の方が作成した通知は、取り下げられません');
  await ref.delete();
  await audit(auth.uid, 'notice_withdraw', { id: ref.id, property: snap.data().property });
  return { ok: true };
});

// 予約した通知を、時刻になったら配信する（1分ごとに確認）
exports.dispatchScheduled = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Asia/Tokyo', region: 'asia-northeast1' }, async () => {
  const snap = await db.collection('outbox').where('status', '==', 'scheduled').get();
  for (const doc of snap.docs) {
    const n = doc.data();
    if (!n.scheduledAt || n.scheduledAt.toMillis() > Date.now()) continue;
    const claimed = await db.runTransaction(async (tx) => {
      const cur = await tx.get(doc.ref);
      if (!cur.exists || cur.data().status !== 'scheduled') return false;
      tx.update(doc.ref, { status: 'sending' });
      return true;
    });
    if (!claimed) continue;
    try {
      await deliver({ property: n.property, title: n.title, body: n.body, actor: n.createdBy, role: n.createdByRole });
      await doc.ref.delete();
    } catch (e) {
      await doc.ref.update({ status: 'scheduled' }).catch(() => {});
    }
  }
});

/* ---------- 5. 問い合わせ・来場予約 ---------- */
exports.submitInquiry = onCall(async (req) => {
  const auth = requireAuth(req);
  if (auth.token.role !== 'member') throw new HttpsError('permission-denied', 'お客様のみ');
  const ap = await activeProps();
  const props = (Array.isArray(req.data && req.data.properties) ? req.data.properties : []).filter((p) => ap.includes(p));
  if (!props.length) throw new HttpsError('invalid-argument', '物件を選んでください');
  const kind = req.data.kind === 'visit' ? 'visit' : 'inquiry';
  const base = {
    cid: auth.uid,
    kind,
    message: clean(req.data.message, 500),
    contactMethod: clean(req.data.contactMethod, 10),
    timeSlot: clean(req.data.timeSlot, 20),
    visitDate: clean(req.data.visitDate, 20),
    guests: Math.min(10, Math.max(1, Number(req.data.guests) || 1)),
    status: 'new',
    createdAt: FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  props.forEach((p) => batch.set(db.collection('inquiries').doc(), { ...base, property: p }));
  await batch.commit();
  return { ok: true, count: props.length };
});

/* ---------- 6. 行動ログ（匿名） ---------- */
exports.logEvent = onCall(async (req) => {
  const auth = requireAuth(req);
  if (auth.token.role !== 'member') return { ok: false };
  const type = clean(req.data && req.data.type, 20);
  if (!['open', 'notice_open', 'checkin'].includes(type)) throw new HttpsError('invalid-argument', 'type');
  const ms = await db.collection('memberships').where('cid', '==', auth.uid).get();
  const batch = db.batch();
  ms.forEach((d) => {
    batch.set(db.collection('events').doc(), { anonId: d.data().anonId, property: d.data().property, type, ts: FieldValue.serverTimestamp() });
    batch.update(d.ref, { lastSeenAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();
  return { ok: true };
});

/* ---------- 7. 物件の一覧（登録フォーム用。ログイン不要・公開してよい情報だけ） ---------- */
exports.listProperties = onRequest({ cors: ALLOWED_ORIGINS }, async (req, res) => {
  const snap = await db.collection('properties').get();
  const list = snap.docs.filter((d) => d.data().status !== 'archived')
    .map((d) => ({ id: d.id, name: d.data().name, order: d.data().order || 0 }))
    .sort((a, b) => a.order - b.order);
  res.set('Cache-Control', 'public, max-age=60').json({ properties: list });
});

/* ---------- 8. ADEX専用：物件と担当者の管理 ---------- */
function requireRole(req, roles) {
  const auth = requireAuth(req);
  if (!roles.includes(auth.token.role)) throw new HttpsError('permission-denied', 'この操作は、ADEXのみ行えます');
  return auth;
}
const ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

exports.adminSaveProperty = onCall(async (req) => {
  const a = requireRole(req, ['adex']);
  const d = req.data || {};
  const id = clean(d.id, 32);
  if (!ID_RE.test(id)) throw new HttpsError('invalid-argument', 'IDは、半角の英小文字・数字・ハイフンで、2〜31文字にしてください');
  const name = clean(d.name, 60);
  if (!name) throw new HttpsError('invalid-argument', '物件名が必要です');
  const ref = db.collection('properties').doc(id);
  const exists = (await ref.get()).exists;
  const data = {
    name, region: clean(d.region, 20), area: clean(d.area, 60), kind: ['新築', '中古'].includes(d.kind) ? d.kind : '新築',
    url: /^https:\/\//.test(clean(d.url, 300)) ? clean(d.url, 300) : '', appName: clean(d.appName, 60), approvalRequired: !!d.approvalRequired, status: 'active', updatedAt: FieldValue.serverTimestamp(),
  };
  if (!exists) data.order = Date.now();
  await ref.set(data, { merge: true });
  invalidateProps();
  await audit(a.uid, exists ? 'property_update' : 'property_create', { id, name });
  return { ok: true, created: !exists };
});

exports.adminSetPropertyStatus = onCall(async (req) => {
  const a = requireRole(req, ['adex']);
  const id = clean(req.data && req.data.id, 32);
  const status = req.data && req.data.status === 'archived' ? 'archived' : 'active';
  const ref = db.collection('properties').doc(id);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', '物件が見つかりません');
  // 掲載を停止しても、登録者・ログなどのデータは削除しない（保管期間のルールに従う）
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  invalidateProps();
  await audit(a.uid, status === 'archived' ? 'property_archive' : 'property_restore', { id });
  return { ok: true };
});

exports.adminCreateStaff = onCall(async (req) => {
  const a = requireRole(req, ['adex']);
  const email = clean(req.data && req.data.email, 120).toLowerCase();
  const name = clean(req.data && req.data.name, 60);
  const ap = await activeProps();
  const props = (Array.isArray(req.data && req.data.properties) ? req.data.properties : []).filter((p) => ap.includes(p));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !props.length) throw new HttpsError('invalid-argument', 'メールアドレス・お名前・担当物件が必要です');
  const password = 'pp-' + crypto.randomBytes(9).toString('base64url');
  let user;
  try { user = await admin.auth().createUser({ email, password, displayName: name, emailVerified: true }); }
  catch (e) { if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'このメールアドレスは、すでに使われています'); throw e; }
  await admin.auth().setCustomUserClaims(user.uid, { role: 'staff', properties: props });
  await db.collection('staff').doc(user.uid).set({ email, displayName: name, role: 'staff', properties: props, disabled: false, createdAt: FieldValue.serverTimestamp() });
  await audit(a.uid, 'staff_create', { email, properties: props });
  return { uid: user.uid, email, password }; // パスワードは、この1回だけ表示する
});

async function staffOf(uid) {
  const s = await db.collection('staff').doc(String(uid)).get();
  if (!s.exists || s.data().role !== 'staff') throw new HttpsError('failed-precondition', '物件担当者のアカウントではありません');
  return s;
}
exports.adminUpdateStaff = onCall(async (req) => {
  const a = requireRole(req, ['adex']);
  const uid = clean(req.data && req.data.uid, 60);
  await staffOf(uid);
  const ap = await activeProps();
  const props = (Array.isArray(req.data && req.data.properties) ? req.data.properties : []).filter((p) => ap.includes(p));
  if (!props.length) throw new HttpsError('invalid-argument', '担当物件が必要です');
  await admin.auth().setCustomUserClaims(uid, { role: 'staff', properties: props });
  await admin.auth().revokeRefreshTokens(uid); // 権限の変更を、すぐに反映するため、いったんログアウトさせる
  await db.collection('staff').doc(uid).update({ properties: props });
  await audit(a.uid, 'staff_update', { uid, properties: props });
  return { ok: true };
});
exports.adminSetStaffDisabled = onCall(async (req) => {
  const a = requireRole(req, ['adex']);
  const uid = clean(req.data && req.data.uid, 60);
  const disabled = !!(req.data && req.data.disabled);
  await staffOf(uid);
  await admin.auth().updateUser(uid, { disabled });
  if (disabled) await admin.auth().revokeRefreshTokens(uid);
  await db.collection('staff').doc(uid).update({ disabled });
  await audit(a.uid, disabled ? 'staff_disable' : 'staff_enable', { uid });
  return { ok: true };
});

/* ---------- 9. 問い合わせの対応状況・対応メモ（ADEXと、自物件の担当者） ---------- */
exports.setInquiryStatus = onCall(async (req) => {
  const auth = requireAuth(req);
  const id = clean(req.data && req.data.id, 60);
  const status = ['new', 'doing', 'done'].includes(req.data && req.data.status) ? req.data.status : null;
  if (!id || !status) throw new HttpsError('invalid-argument', 'id・status が必要です');
  const ref = db.collection('inquiries').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', '問い合わせが見つかりません');
  const prop = snap.data().property;
  const ok = auth.token.role === 'adex' || (auth.token.role === 'staff' && Array.isArray(auth.token.properties) && auth.token.properties.includes(prop));
  if (!ok) throw new HttpsError('permission-denied', 'この問い合わせは、操作できません');
  await ref.update({ status, memo: clean(req.data.memo, 300), handledBy: auth.uid, updatedAt: FieldValue.serverTimestamp() });
  await audit(auth.uid, 'inquiry_status', { id, status, property: prop });
  return { ok: true };
});

/* ---------- 10. 物件画像のアップロード・削除（ADEX専用） ---------- */
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
exports.adminSetPropertyImage = onCall({ memory: '512MiB' }, async (req) => {
  const a = requireRole(req, ['adex']);
  const id = clean(req.data && req.data.id, 32);
  const ref = db.collection('properties').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', '物件が見つかりません');
  const bucket = admin.storage().bucket(BUCKET);
  const old = snap.data().imagePath;
  if (req.data.remove === true) {
    if (old) await bucket.file(old).delete().catch(() => {});
    await ref.update({ imageUrl: '', imagePath: '', updatedAt: FieldValue.serverTimestamp() });
    await audit(a.uid, 'property_image_remove', { id });
    return { ok: true, imageUrl: '' };
  }
  const ext = IMG_TYPES[req.data.contentType];
  if (!ext) throw new HttpsError('invalid-argument', '画像は、JPEG・PNG・WebPのいずれかにしてください');
  const buf = Buffer.from(String(req.data.data || ''), 'base64');
  if (!buf.length || buf.length > 3 * 1024 * 1024) throw new HttpsError('invalid-argument', '画像は、3MB以下にしてください');
  const path = `site/property/${id}-${Date.now()}.${ext}`;
  const token = crypto.randomUUID();
  await bucket.file(path).save(buf, { contentType: req.data.contentType, metadata: { cacheControl: 'private, max-age=3600', metadata: { firebaseStorageDownloadTokens: token } } });
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  await ref.update({ imageUrl, imagePath: path, updatedAt: FieldValue.serverTimestamp() });
  if (old) await bucket.file(old).delete().catch(() => {});
  await audit(a.uid, 'property_image_set', { id, bytes: buf.length });
  return { ok: true, imageUrl };
});

/* ---------- 11. 担当者からのご案内（お客様ごとの、資料・リンク・メッセージ） ---------- */
const GUIDE_FILE_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
exports.sendGuide = onCall({ memory: '512MiB' }, async (req) => {
  const auth = requireAuth(req);
  const role = auth.token.role;
  const d = req.data || {};
  const cid = clean(d.cid, 60);
  const property = clean(d.property, 20);
  if (!['adex', 'staff'].includes(role) || !canSendTo(auth, property)) {
    await audit(auth.uid, 'sendGuide_denied', { role, property });
    throw new HttpsError('permission-denied', 'この方へのご案内は、送れません');
  }
  const ms = await db.collection('memberships').doc(`${cid}_${property}`).get();
  if (!ms.exists) throw new HttpsError('not-found', 'この物件に登録している方では、ありません');
  const kind = ['file', 'link', 'message'].includes(d.kind) ? d.kind : 'message';
  const title = clean(d.title, 60);
  if (!title) throw new HttpsError('invalid-argument', 'タイトルが必要です');
  const doc = { cid, property, kind, title, message: clean(d.message, 500), staffName: clean(auth.token.name || (role === 'adex' ? 'ADEX' : '担当者'), 40), createdBy: auth.uid, createdByRole: role, createdAt: FieldValue.serverTimestamp(), readAt: null };
  const ref = db.collection('guides').doc();
  if (kind === 'link') {
    const url = clean(d.url, 500);
    if (!/^https:\/\//.test(url)) throw new HttpsError('invalid-argument', 'リンクは、https:// で始まるものにしてください');
    doc.url = url;
  } else if (kind === 'file') {
    const f = d.file || {};
    const ext = GUIDE_FILE_TYPES[f.contentType];
    if (!ext) throw new HttpsError('invalid-argument', 'ファイルは、PDF・JPEG・PNGのいずれかにしてください');
    const buf = Buffer.from(String(f.data || ''), 'base64');
    if (!buf.length || buf.length > 4 * 1024 * 1024) throw new HttpsError('invalid-argument', 'ファイルは、4MB以下にしてください');
    const safe = clean(f.name, 80).replace(/[^\w.\-ぁ-んァ-ヶ一-龠]/g, '_') || `file.${ext}`;
    const path = `guides/${cid}/${ref.id}-${safe}`;
    const token = crypto.randomUUID();
    await admin.storage().bucket(BUCKET).file(path).save(buf, { contentType: f.contentType, metadata: { cacheControl: 'private, max-age=3600', metadata: { firebaseStorageDownloadTokens: token } } });
    doc.fileName = safe; doc.fileSize = buf.length; doc.filePath = path;
    doc.fileUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } else if (!doc.message) throw new HttpsError('invalid-argument', 'メッセージが必要です');
  await ref.set(doc);
  // 通知（文面には、個人情報を入れない）
  let pushed = 0;
  if (d.push !== false) {
    const t = await db.collection('pushTokens').doc(cid).get();
    const tokens = t.exists ? t.data().tokens || [] : [];
    if (tokens.length) {
      const r = await admin.messaging().sendEachForMulticast({ tokens, notification: { title: '担当者からのご案内が届きました', body: 'アプリでご確認ください' }, webpush: { fcmOptions: { link: SITE + '#/notices' } }, data: { guideId: ref.id } });
      pushed = r.successCount;
    }
  }
  await audit(auth.uid, 'guide_send', { role, property, kind, pushed });
  return { id: ref.id, pushed };
});

exports.markGuideRead = onCall(async (req) => {
  const auth = requireAuth(req);
  if (auth.token.role !== 'member') throw new HttpsError('permission-denied', 'お客様のみ');
  const ref = db.collection('guides').doc(clean(req.data && req.data.id, 60));
  const snap = await ref.get();
  if (!snap.exists || snap.data().cid !== auth.uid) throw new HttpsError('not-found', 'ご案内が見つかりません');
  if (!snap.data().readAt) await ref.update({ readAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

/* ---------- 12. 二段階認証のリセット（端末をなくしたとき。ADEXが、物件担当者に対して行う） ---------- */
exports.adminResetMfa = onCall(async (req) => {
  const a = requireRole(req, ['adex']);
  const uid = clean(req.data && req.data.uid, 60);
  await staffOf(uid);
  await admin.auth().updateUser(uid, { multiFactor: { enrolledFactors: null } });
  await admin.auth().revokeRefreshTokens(uid);
  await audit(a.uid, 'staff_mfa_reset', { uid });
  return { ok: true };
});

/* ---------- 13. コンテンツ管理（限定間取り・CG／ムービー） ---------- */
const SALES = ['on', 'hold', 'sold', 'hidden']; // 販売中／商談中／契約済／期限切れ・非表示
async function contentImage(bucket, id, img, oldPath) {
  const ext = IMG_TYPES[img.contentType];
  if (!ext) throw new HttpsError('invalid-argument', '画像は、JPEG・PNG・WebPのいずれかにしてください');
  const buf = Buffer.from(String(img.data || ''), 'base64');
  if (!buf.length || buf.length > 3 * 1024 * 1024) throw new HttpsError('invalid-argument', '画像は、3MB以下にしてください');
  const path = `site/content/${id}-${Date.now()}.${ext}`;
  const token = crypto.randomUUID();
  await bucket.file(path).save(buf, { contentType: img.contentType, metadata: { cacheControl: 'private, max-age=3600', metadata: { firebaseStorageDownloadTokens: token } } });
  if (oldPath) await bucket.file(oldPath).delete().catch(() => {});
  return { imagePath: path, imageUrl: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}` };
}
const histItem = (actor, action) => ({ at: Date.now(), by: actor, action });

exports.saveContent = onCall({ memory: '512MiB' }, async (req) => {
  const auth = requireAuth(req);
  const role = auth.token.role;
  const d = req.data || {};
  const property = clean(d.property, 20);
  if (!['adex', 'staff'].includes(role) || !canSendTo(auth, property)) {
    await audit(auth.uid, 'saveContent_denied', { role, property });
    throw new HttpsError('permission-denied', 'この物件のコンテンツは、編集できません');
  }
  if (!(await activeProps()).includes(property)) throw new HttpsError('invalid-argument', '物件が見つかりません');
  const kind = d.kind === 'gallery' ? 'gallery' : 'plan';
  const title = clean(d.title, 40);
  if (!title) throw new HttpsError('invalid-argument', '名称が必要です');
  const from = d.publishFrom ? Number(d.publishFrom) : null;
  const until = d.publishUntil ? Number(d.publishUntil) : null;
  if (from && until && until <= from) throw new HttpsError('invalid-argument', '公開終了は、公開開始より後にしてください');
  const sale = SALES.includes(d.sale) ? d.sale : 'on';
  const action = d.action === 'draft' ? 'draft' : 'submit';
  const bucket = admin.storage().bucket(BUCKET);
  let ref; let cur = null;
  if (d.id) {
    ref = db.collection('contents').doc(clean(d.id, 60));
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'コンテンツが見つかりません');
    cur = snap.data();
    if (cur.property !== property) throw new HttpsError('invalid-argument', '物件は、変更できません');
    if (cur.createdBy !== auth.uid && role !== 'adex') throw new HttpsError('permission-denied', '他の方が作成したものは、編集できません');
  } else ref = db.collection('contents').doc();
  const data = {
    property, kind, title, spec: clean(d.spec, 40), sale,
    publishFrom: from ? Timestamp.fromMillis(from) : null, publishUntil: until ? Timestamp.fromMillis(until) : null,
    autoDate: d.autoDate !== false, fixNote: d.fixNote !== false, updatedAt: FieldValue.serverTimestamp(),
  };
  if (!cur) { data.createdBy = auth.uid; data.createdByRole = role; data.createdAt = FieldValue.serverTimestamp(); }
  if (d.image && d.image.data) Object.assign(data, await contentImage(bucket, ref.id, d.image, cur && cur.imagePath));
  if (d.removeImage && cur && cur.imagePath) { await bucket.file(cur.imagePath).delete().catch(() => {}); data.imageUrl = ''; data.imagePath = ''; }
  let status = 'draft';
  if (action === 'submit') status = (await needsApproval(property, role)) ? 'pending' : 'published';
  data.status = status;
  data.rejectNote = '';
  data.history = FieldValue.arrayUnion(histItem(auth.uid, status === 'draft' ? '下書きを保存' : status === 'pending' ? '承認を依頼' : '公開'));
  await ref.set(data, { merge: true });
  await audit(auth.uid, status === 'published' ? 'content_publish' : status === 'pending' ? 'content_submit' : 'content_draft', { role, property, id: ref.id, kind });
  return { id: ref.id, status };
});

exports.reviewContent = onCall(async (req) => {
  const auth = requireRole(req, ['adex']);
  const ref = db.collection('contents').doc(clean(req.data && req.data.id, 60));
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== 'pending') throw new HttpsError('failed-precondition', '承認待ちのコンテンツではありません');
  const ok = !(req.data && req.data.decision === 'reject');
  await ref.update({
    status: ok ? 'published' : 'draft', rejectNote: ok ? '' : clean(req.data.note, 200), updatedAt: FieldValue.serverTimestamp(),
    history: FieldValue.arrayUnion(histItem(auth.uid, ok ? '承認して公開' : '差し戻し')),
  });
  await audit(auth.uid, ok ? 'content_approve' : 'content_reject', { id: ref.id, property: snap.data().property });
  return { status: ok ? 'published' : 'draft' };
});

exports.deleteContent = onCall(async (req) => {
  const auth = requireAuth(req);
  const ref = db.collection('contents').doc(clean(req.data && req.data.id, 60));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'コンテンツが見つかりません');
  const c = snap.data();
  const ok = auth.token.role === 'adex' || (auth.token.role === 'staff' && canSendTo(auth, c.property) && c.createdBy === auth.uid);
  if (!ok) throw new HttpsError('permission-denied', 'このコンテンツは、削除できません');
  if (c.imagePath) await admin.storage().bucket(BUCKET).file(c.imagePath).delete().catch(() => {});
  await ref.delete();
  await audit(auth.uid, 'content_delete', { id: ref.id, property: c.property });
  return { ok: true };
});
