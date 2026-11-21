// PRIME PASS 管理画面（6つの役割：ADEX / QLEA / ES CON本社 / 物件担当者1〜3）
import {
  auth, db, authReady, call, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  collection, query, where, getDocs, $, $$, esc, fmtDate,
} from './fb.js';
import { PROPERTY_NAMES, ENV_LABEL } from './config.js';

const root = $('#root');
const PROPS = ['a', 'b', 'c'];
const ROLE_LABEL = { adex: 'ADEX', qlea: 'QLEA', escon: 'ES CON本社', staff: '物件担当者' };
const S = { claims: null, user: null, tab: 'overview', data: {} };

const roleName = () => {
  const c = S.claims; if (!c) return '';
  if (c.role === 'staff') return `物件担当者（${(c.properties || []).map((p) => PROPERTY_NAMES[p] || p).join('・')}）`;
  return ROLE_LABEL[c.role] || c.role;
};
const scope = () => { const c = S.claims; return c.role === 'staff' ? c.properties || [] : PROPS; };
const can = {
  contacts: () => ['adex', 'staff'].includes(S.claims.role),
  inquiries: () => ['adex', 'staff'].includes(S.claims.role),
  send: () => ['adex', 'staff'].includes(S.claims.role),
  audit: () => S.claims.role === 'adex',
};

/* ---------- ログイン ---------- */
function viewLogin(msg = '') {
  root.innerHTML = `<div class="login-box">
    <div class="brand" style="margin-bottom:6px"><span class="mark">P</span>PRIME PASS</div>
    <p class="eyebrow" style="margin-top:14px">Membership management</p>
    <h1 class="display" style="font-size:30px">Sign in</h1>
    <div class="banner warn" style="margin-top:14px">${ENV_LABEL}。テスト用のID・パスワードで、ログインしてください。</div>
    <form id="lf" style="margin-top:6px">
      <div class="field"><label>ID（メールアドレス形式）</label><input class="input" id="em" type="email" autocomplete="username" required></div>
      <div class="field"><label>パスワード</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn" id="lb" type="submit">ログイン</button>
    </form>
    <div id="lerr" style="margin-top:14px">${msg}</div>
  </div>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#lb').disabled = true;
    try { await signInWithEmailAndPassword(auth, $('#em').value.trim(), $('#pw').value); }
    catch (err) { $('#lerr').innerHTML = '<div class="banner err">IDまたはパスワードが、違います</div>'; $('#lb').disabled = false; }
  });
}

/* ---------- データ取得（役割に応じて、許される範囲だけ） ---------- */
async function fetchScoped(col) {
  const out = [];
  if (['adex', 'qlea', 'escon'].includes(S.claims.role) && col !== 'inquiries' && col !== 'contacts') {
    (await getDocs(collection(db, col))).forEach((d) => out.push({ id: d.id, ...d.data() }));
    return out;
  }
  if (S.claims.role === 'adex') { (await getDocs(collection(db, col))).forEach((d) => out.push({ id: d.id, ...d.data() })); return out; }
  for (const p of scope()) (await getDocs(query(collection(db, col), where('property', '==', p)))).forEach((d) => out.push({ id: d.id, ...d.data() }));
  return out;
}
async function loadAll() {
  const d = S.data = {};
  d.memberships = await fetchScoped('memberships');
  d.notices = await fetchScoped('notices');
  d.events = await fetchScoped('events');
  d.contacts = can.contacts() ? await fetchScoped('contacts') : [];
  d.inquiries = can.inquiries() ? await fetchScoped('inquiries') : [];
  if (can.audit()) {
    d.audit = []; (await getDocs(collection(db, 'auditLogs'))).forEach((x) => d.audit.push({ id: x.id, ...x.data() }));
    d.audit.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
    d.staff = []; (await getDocs(collection(db, 'staff'))).forEach((x) => d.staff.push({ id: x.id, ...x.data() }));
  }
}

/* ---------- 画面 ---------- */
const TABS = () => [
  ['overview', 'ダッシュボード'], ['members', '登録者'], ['notices', 'お知らせ配信'], ['inquiries', '問い合わせ'], ['events', '行動ログ'],
  ...(can.audit() ? [['admin', '担当者・操作記録']] : []),
];
function shell(inner) {
  root.innerHTML = `<div class="admin">
    <div class="admin-head">
      <div><div class="brand"><span class="mark">P</span>PRIME PASS <span class="xs muted" style="letter-spacing:.04em;font-family:var(--sans)">管理画面</span></div>
        <div class="pill-row"><span class="role-pill">ログイン中：<b>${esc(roleName())}</b></span><span class="tag gold" style="align-self:center">${ENV_LABEL}</span></div></div>
      <button class="btn sm ghost" id="lo">ログアウト</button>
    </div>
    <div class="navtabs">${TABS().map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="main">${inner}</div></div>`;
  $('#lo').addEventListener('click', () => signOut(auth));
  $$('.navtabs button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.t; render(); }));
}
const pn = (p) => esc(PROPERTY_NAMES[p] || p);
const ago = (ts, days) => (ts?.toMillis?.() || 0) > Date.now() - days * 86400000;

function tabOverview() {
  const d = S.data;
  const uniq = new Set(d.memberships.map((m) => m.anonId)).size;
  const push = d.memberships.filter((m) => m.pushEnabled).length;
  const ev7 = d.events.filter((e) => ago(e.ts, 7)).length;
  return `<div class="grid4">
    <div class="stat"><div class="l">登録者（人）</div><div class="n">${uniq}</div></div>
    <div class="stat"><div class="l">物件ごとの登録（件）</div><div class="n">${d.memberships.length}</div></div>
    <div class="stat"><div class="l">通知オン（件）</div><div class="n">${push}</div></div>
    <div class="stat"><div class="l">直近7日のアクセス</div><div class="n">${ev7}</div></div>
    ${can.inquiries() ? `<div class="stat"><div class="l">未対応の問い合わせ</div><div class="n">${d.inquiries.filter((i) => i.status === 'new').length}</div></div>` : ''}
    <div class="stat"><div class="l">配信したお知らせ</div><div class="n">${d.notices.length}</div></div>
  </div>
  <h2 class="h2" style="margin-top:26px">あなたの権限（${esc(roleName())}）</h2>
  <div class="card small">${roleSummary()}</div>`;
}
function roleSummary() {
  const r = S.claims.role;
  const m = {
    adex: '全物件の管理。担当者の発行・停止。登録者の個人情報も、すべて見られます。通知は、依頼があったときの代行です。',
    qlea: '保守を行う制作側です。匿名ID・匿名の集計だけが見えます。個人情報は見えません。通知は、ADEXの依頼による期間つきの代行権限があるときだけです。',
    escon: '閲覧のみ（集計まで）です。通知の配信・編集はできません。個人情報は、標準では見えません。',
    staff: `自分の物件（${scope().map((p) => PROPERTY_NAMES[p]).join('・')}）だけを運用します。通知の配信、問い合わせ対応、登録者の個人情報の閲覧ができます。他の物件は、見えません。`,
  };
  return m[r];
}

function tabMembers() {
  const d = S.data; const showPII = can.contacts();
  const pii = Object.fromEntries(d.contacts.map((c) => [c.id, c]));
  const rows = d.memberships.slice().sort((a, b) => (b.joinedAt?.toMillis?.() || 0) - (a.joinedAt?.toMillis?.() || 0));
  return `${showPII ? '' : '<div class="banner warn">この役割では、名前・メール・電話は見えません（匿名IDのみ）。</div>'}
  <div class="scroll-x"><table class="t"><thead><tr><th>匿名ID</th><th>物件</th>${showPII ? '<th>お名前</th><th>メール</th><th>電話</th>' : ''}<th>登録日</th><th>通知</th><th>最終アクセス</th></tr></thead><tbody>
  ${rows.map((m) => { const c = pii[m.cid + '_' + m.property]; return `<tr><td class="mono">${esc(m.anonId)}</td><td>${pn(m.property)}</td>${showPII ? `<td>${esc(c?.name)}</td><td>${esc(c?.email)}</td><td>${esc(c?.phone)}</td>` : ''}<td>${fmtDate(m.joinedAt)}</td><td>${m.pushEnabled ? '<span class="tag">オン</span>' : '<span class="tag red">オフ</span>'}</td><td>${fmtDate(m.lastSeenAt)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">登録者は、まだいません</td></tr>'}
  </tbody></table></div>`;
}

function tabNotices() {
  const d = S.data;
  const list = d.notices.slice().sort((a, b) => (b.publishedAt?.toMillis?.() || 0) - (a.publishedAt?.toMillis?.() || 0));
  return `<div class="card" style="margin-bottom:22px"><h2 class="h2">お知らせを作成して、配信する</h2>
    ${can.send() ? '' : `<div class="banner warn">この役割（${esc(roleName())}）では、通知を配信できません。配信しようとすると、拒否されます（権限のテスト用に、送信ボタンは使えます）。</div>`}
    <div class="field"><label>物件</label><select class="input" id="np">${PROPS.map((p) => `<option value="${p}">${pn(p)}</option>`).join('')}</select>
      <div class="xs muted" style="margin-top:4px">※自分の担当ではない物件を選ぶと、サーバーが拒否します（権限のテスト）</div></div>
    <div class="field"><label>タイトル</label><input class="input" id="nt" maxlength="80" value="限定間取りを追加しました（テスト）"></div>
    <div class="field"><label>本文</label><textarea class="input" id="nb" maxlength="300">テスト配信です。会員限定の最新情報を、ご確認ください。</textarea></div>
    <button class="btn" id="ns" style="max-width:280px">配信する</button><div id="nr" style="margin-top:12px"></div></div>
    <h2 class="h2">配信したお知らせ</h2>
    <div class="scroll-x"><table class="t"><thead><tr><th>日付</th><th>物件</th><th>タイトル</th><th>配信した役割</th></tr></thead><tbody>
    ${list.map((n) => `<tr><td>${fmtDate(n.publishedAt)}</td><td>${pn(n.property)}</td><td>${esc(n.title)}</td><td>${esc(n.createdByRole)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">まだありません</td></tr>'}</tbody></table></div>`;
}
function bindNotices() {
  const b = $('#ns'); if (!b) return;
  b.addEventListener('click', async () => {
    b.disabled = true; $('#nr').innerHTML = '';
    try {
      const r = await call('sendNotice')({ property: $('#np').value, title: $('#nt').value, body: $('#nb').value });
      $('#nr').innerHTML = `<div class="banner ok">配信しました。対象の登録者 ${r.data.members}人／通知の宛先 ${r.data.pushTargets}件（成功 ${r.data.success}・失敗 ${r.data.failure}）</div>`;
      await loadAll(); render(false);
    } catch (e) { $('#nr').innerHTML = `<div class="banner err">拒否されました／失敗しました：${esc(e.message)}</div>`; }
    b.disabled = false;
  });
}

function tabInquiries() {
  if (!can.inquiries()) return '<div class="banner warn">この役割では、問い合わせの内容は見えません（QLEA・ES CON本社は不可）。</div>';
  const d = S.data; const pii = Object.fromEntries(d.contacts.map((c) => [c.cid + '_' + c.property, c]));
  const rows = d.inquiries.slice().sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return `<div class="scroll-x"><table class="t"><thead><tr><th>受付日</th><th>物件</th><th>種類</th><th>お名前</th><th>内容</th><th>希望</th></tr></thead><tbody>
  ${rows.map((q) => { const c = pii[q.cid + '_' + q.property]; return `<tr><td>${fmtDate(q.createdAt)}</td><td>${pn(q.property)}</td><td>${q.kind === 'visit' ? '<span class="tag gold">来場予約</span>' : '<span class="tag">相談</span>'}</td><td>${esc(c?.name || '—')}</td><td>${esc(q.message || (q.kind === 'visit' ? `${q.visitDate} ${q.timeSlot}（${q.guests}名）` : ''))}</td><td>${esc(q.contactMethod === 'tel' ? '電話' : q.contactMethod === 'mail' ? 'メール' : '')}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">まだありません</td></tr>'}</tbody></table></div>`;
}

function tabEvents() {
  const rows = S.data.events.slice().sort((a, b) => (b.ts?.toMillis?.() || 0) - (a.ts?.toMillis?.() || 0)).slice(0, 60);
  const lab = { open: 'アプリを開いた', notice_open: 'お知らせを開いた', checkin: 'チェックイン（ホーム画面から起動）' };
  return `<div class="banner">行動ログは、匿名IDで記録されます（個人は特定できません）。直近60件を表示します。</div>
  <div class="scroll-x"><table class="t"><thead><tr><th>日付</th><th>匿名ID</th><th>物件</th><th>行動</th></tr></thead><tbody>
  ${rows.map((e) => `<tr><td>${fmtDate(e.ts)}</td><td class="mono">${esc(e.anonId)}</td><td>${pn(e.property)}</td><td>${esc(lab[e.type] || e.type)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">まだありません</td></tr>'}</tbody></table></div>`;
}

function tabAdmin() {
  const d = S.data;
  return `<h2 class="h2">担当者アカウント</h2><div class="scroll-x"><table class="t"><thead><tr><th>ID</th><th>名前</th><th>役割</th><th>担当物件</th></tr></thead><tbody>
  ${d.staff.map((s) => `<tr><td>${esc(s.email)}</td><td>${esc(s.displayName)}</td><td>${esc(ROLE_LABEL[s.role] || s.role)}</td><td>${(s.properties || []).map(pn).join('・') || '全物件'}</td></tr>`).join('')}</tbody></table></div>
  <h2 class="h2" style="margin-top:26px">操作記録（監査ログ）</h2><div class="scroll-x"><table class="t"><thead><tr><th>日時</th><th>操作</th><th>実行者</th><th>内容</th></tr></thead><tbody>
  ${d.audit.slice(0, 40).map((a) => `<tr><td>${fmtDate(a.at)}</td><td>${esc(a.action)}</td><td class="mono">${esc(String(a.actor).slice(0, 10))}</td><td class="mono">${esc(JSON.stringify(a.detail || {}))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">まだありません</td></tr>'}</tbody></table></div>`;
}

function render(full = true) {
  const views = { overview: tabOverview, members: tabMembers, notices: tabNotices, inquiries: tabInquiries, events: tabEvents, admin: tabAdmin };
  shell(views[S.tab]());
  if (S.tab === 'notices') bindNotices();
}

onAuthStateChanged(auth, async (u) => {
  if (!u) { S.user = null; return viewLogin(); }
  const t = await u.getIdTokenResult(true);
  if (!t.claims.role || t.claims.role === 'member') { await signOut(auth); return viewLogin('<div class="banner err">この画面は、担当者のみご利用いただけます</div>'); }
  S.user = u; S.claims = t.claims; S.tab = 'overview';
  root.innerHTML = '<div class="section center muted" style="padding-top:30vh">読み込み中…</div>';
  try { await loadAll(); render(); } catch (e) { root.innerHTML = `<div class="section"><div class="banner err">データを読み込めませんでした：${esc(e.message)}</div><button class="btn sm" onclick="location.reload()">再読み込み</button></div>`; }
});
