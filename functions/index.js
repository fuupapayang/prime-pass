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
const PROPERTIES = ['a', 'b', 'c'];
const TOKEN_TTL_SEC = 15 * 60;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

async function audit(actor, action, detail) {
  await db.collection('auditLogs').add({ actor, action, detail: detail || {}, at: FieldValue.serverTimestamp() });
}

function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
  return req.auth;
}

/* ---------- 1. 登録フォームからの受け取り ---------- */
exports.intake = onRequest({ cors: ALLOWED_ORIGINS }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const b = req.body || {};
  const name = clean(b.name, 60);
  const email = clean(b.email, 120).toLowerCase();
  const phone = clean(b.phone, 30);
  const property = clean(b.property, 10);
  const formType = clean(b.formType || 'entry', 20);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !phone || !PROPERTIES.includes(property) || b.consent !== true) {
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

  const mid = `${cid}_${property}`;
  const batch = db.batch();
  batch.set(
    db.collection('contacts').doc(mid),
    { cid, property, name, email, phone, consentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  const msRef = db.collection('memberships').doc(mid);
  const msSnap = await msRef.get();
  if (msSnap.exists) batch.update(msRef, { tags: FieldValue.arrayUnion(formType) });
  else batch.set(msRef, { cid, anonId, property, tags: [formType], joinedAt: FieldValue.serverTimestamp(), lastSeenAt: null, pushEnabled: false });
  const token = crypto.randomBytes(24).toString('base64url');
  batch.set(db.collection('tokens').doc(sha256(token)), {
    cid,
    exp: Timestamp.fromMillis(Date.now() + TOKEN_TTL_SEC * 1000),
    used: false,
  });
  await batch.commit();
  await audit('system', 'intake', { anonId, property, formType });
  return res.json({ token, expiresInSec: TOKEN_TTL_SEC });
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

/* ---------- 4. お知らせの作成・配信 ---------- */
exports.sendNotice = onCall(async (req) => {
  const auth = requireAuth(req);
  const role = auth.token.role;
  const property = clean(req.data && req.data.property, 10);
  const title = clean(req.data && req.data.title, 80);
  const body = clean(req.data && req.data.body, 300);
  if (!PROPERTIES.includes(property) || !title || !body) throw new HttpsError('invalid-argument', '物件・タイトル・本文が必要です');

  // 権限: ADEXは全物件（依頼時の代行）。物件担当者は自物件のみ。QLEAは、期間つきの代行権限がある場合のみ。ES CON本社は不可
  let allowed = false;
  if (role === 'adex') allowed = true;
  else if (role === 'staff') allowed = Array.isArray(auth.token.properties) && auth.token.properties.includes(property);
  else if (role === 'qlea') allowed = Number(auth.token.delegateUntil || 0) > Date.now();
  if (!allowed) {
    await audit(auth.uid, 'sendNotice_denied', { role, property });
    throw new HttpsError('permission-denied', 'この役割では、この物件の通知を配信できません');
  }

  const noticeRef = await db.collection('notices').add({
    property, title, body, createdBy: auth.uid, createdByRole: role, publishedAt: FieldValue.serverTimestamp(),
  });

  const ms = await db.collection('memberships').where('property', '==', property).get();
  const cids = [...new Set(ms.docs.map((d) => d.data().cid))];
  const tokenDocs = await Promise.all(cids.map((c) => db.collection('pushTokens').doc(c).get()));
  const tokens = [];
  const owner = {};
  tokenDocs.forEach((s, i) => {
    if (s.exists) (s.data().tokens || []).forEach((t) => { tokens.push(t); owner[t] = cids[i]; });
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
  await audit(auth.uid, 'sendNotice', { role, property, members: cids.length, pushTargets: tokens.length, success, failure });
  return { noticeId: noticeRef.id, members: cids.length, pushTargets: tokens.length, success, failure };
});

/* ---------- 5. 問い合わせ・来場予約 ---------- */
exports.submitInquiry = onCall(async (req) => {
  const auth = requireAuth(req);
  if (auth.token.role !== 'member') throw new HttpsError('permission-denied', 'お客様のみ');
  const props = (Array.isArray(req.data && req.data.properties) ? req.data.properties : []).filter((p) => PROPERTIES.includes(p));
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
