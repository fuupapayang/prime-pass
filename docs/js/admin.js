// PRIME PASS 管理画面（6つの役割：ADEX / QLEA / ES CON本社 / 物件担当者1〜3）
import {
  auth, db, authReady, call, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  collection, query, where, getDocs, doc, getDoc, $, $$, esc, fmtDate,
} from './fb.js';
import { ENV_LABEL, assetKey } from './config.js';

const root = $('#root');
let PROPS = [];
let PNAMES = {};
const REGIONS = ['首都圏', '関西', '西日本', '九州・沖縄', '北海道', '中部', '海外'];
const ROLE_LABEL = { adex: 'ADEX', qlea: 'QLEA', escon: 'ES CON本社', staff: '物件担当者' };
const S = { claims: null, user: null, tab: 'overview', data: {}, propDocs: [], assets: {} };
const imgOf = (id) => S.assets[assetKey(id)] || '';

const roleName = () => {
  const c = S.claims; if (!c) return '';
  if (c.role === 'staff') return `物件担当者（${(c.properties || []).map((p) => PNAMES[p] || p).join('・')}）`;
  return ROLE_LABEL[c.role] || c.role;
};
const scope = () => { const c = S.claims; return c.role === 'staff' ? c.properties || [] : PROPS; };
const can = {
  contacts: () => ['adex', 'staff'].includes(S.claims.role),
  inquiries: () => ['adex', 'staff'].includes(S.claims.role),
  send: () => ['adex', 'staff'].includes(S.claims.role),
  audit: () => S.claims.role === 'adex',
  manage: () => S.claims.role === 'adex',
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
  const ps = await getDocs(collection(db, 'properties'));
  S.propDocs = ps.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  PROPS = S.propDocs.filter((x) => x.status !== 'archived').map((x) => x.id);
  PNAMES = Object.fromEntries(S.propDocs.map((x) => [x.id, x.name]));
  try { const as = await getDoc(doc(db, 'config', 'assets')); S.assets = as.exists() ? as.data().urls || {} : {}; } catch { S.assets = {}; }
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
  ...(can.manage() ? [['properties', '物件'], ['staff', '担当者'], ['admin', '操作記録']] : []),
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
const pn = (p) => esc(PNAMES[p] || p);
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
  <h2 class="h2" style="margin-top:26px">物件ごとの登録者</h2>
  <div class="grid4" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${S.propDocs.filter((p) => p.status !== 'archived' && scope().includes(p.id)).map((p) => `<div class="stat" style="padding:0"><div style="height:90px;background:#cfc8b8 center/cover no-repeat;${imgOf(p.id) ? `background-image:url('${esc(imgOf(p.id))}')` : ''}"></div><div style="padding:10px 12px"><div class="xs">${esc(p.name)}</div><div class="n" style="font-size:28px">${d.memberships.filter((m) => m.property === p.id).length}</div></div></div>`).join('')}</div>
  <h2 class="h2" style="margin-top:26px">あなたの権限（${esc(roleName())}）</h2>
  <div class="card small">${roleSummary()}</div>`;
}
function roleSummary() {
  const r = S.claims.role;
  const m = {
    adex: '全物件の管理。担当者の発行・停止。登録者の個人情報も、すべて見られます。通知は、依頼があったときの代行です。',
    qlea: '保守を行う制作側です。匿名ID・匿名の集計だけが見えます。個人情報は見えません。通知は、ADEXの依頼による期間つきの代行権限があるときだけです。',
    escon: '閲覧のみ（集計まで）です。通知の配信・編集はできません。個人情報は、標準では見えません。',
    staff: `自分の物件（${scope().map((p) => PNAMES[p]).join('・')}）だけを運用します。通知の配信、問い合わせ対応、登録者の個人情報の閲覧ができます。他の物件は、見えません。`,
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
  return `<h2 class="h2">操作記録（監査ログ）</h2><div class="scroll-x"><table class="t"><thead><tr><th>日時</th><th>操作</th><th>実行者</th><th>内容</th></tr></thead><tbody>
  ${d.audit.slice(0, 60).map((a) => `<tr><td>${fmtDate(a.at)}</td><td>${esc(a.action)}</td><td class="mono">${esc(String(a.actor).slice(0, 10))}</td><td class="mono">${esc(JSON.stringify(a.detail || {}))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">まだありません</td></tr>'}</tbody></table></div>`;
}

/* ---------- ADEX専用：物件の登録・編集・掲載停止 ---------- */
function thumb(id) { return `<div style="width:64px;height:64px;background:#cfc8b8 center/cover no-repeat;${imgOf(id) ? `background-image:url('${esc(imgOf(id))}')` : ''}"></div>`; }
function tabProperties() {
  const counts = {}; S.data.memberships.forEach((m) => { counts[m.property] = (counts[m.property] || 0) + 1; });
  return `<div class="card" style="margin-bottom:22px"><h2 class="h2" id="pfTitle">物件を登録する</h2>
    <div class="grid4" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      <div class="field"><label>物件ID（半角英数・ハイフン。登録後は変更できません）</label><input class="input" id="pfId" placeholder="例：hakone-101" maxlength="31"></div>
      <div class="field"><label>物件名</label><input class="input" id="pfName" maxlength="60" placeholder="例：レ・ジェイド箱根"></div>
      <div class="field"><label>地域</label><select class="input" id="pfRegion">${REGIONS.map((r) => `<option>${r}</option>`).join('')}</select></div>
      <div class="field"><label>エリア</label><input class="input" id="pfArea" maxlength="60" placeholder="例：神奈川県 箱根町"></div>
      <div class="field"><label>種別</label><select class="input" id="pfKind"><option>新築</option><option>中古</option></select></div>
      <div class="field"><label>公式サイトURL（https://）</label><input class="input" id="pfUrl" maxlength="300" placeholder="https://"></div>
      <div class="field"><label>アプリ内の表示名（任意）</label><input class="input" id="pfApp" maxlength="60"></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sm" id="pfSave">登録する</button><button class="btn sm ghost hidden" id="pfCancel">編集をやめる</button></div>
    <div id="pfRes" style="margin-top:12px"></div></div>
  <div class="scroll-x"><table class="t"><thead><tr><th></th><th>物件名</th><th>地域・エリア</th><th>登録者</th><th>状態</th><th>操作</th></tr></thead><tbody>
  ${S.propDocs.map((p) => `<tr><td>${thumb(p.id)}</td><td><b>${esc(p.name)}</b><div class="mono muted">${esc(p.id)}</div></td><td>${esc(p.region || '')}<div class="xs muted">${esc(p.area || '')}</div></td><td>${counts[p.id] || 0}</td><td>${p.status === 'archived' ? '<span class="tag red">掲載停止</span>' : '<span class="tag">掲載中</span>'}</td>
  <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm ghost" data-edit="${esc(p.id)}">編集</button>${p.status === 'archived' ? `<button class="btn sm ghost" data-restore="${esc(p.id)}">掲載を再開</button>` : `<button class="btn sm danger" data-archive="${esc(p.id)}">掲載を停止</button>`}</div></td></tr>`).join('')}</tbody></table></div>
  <p class="xs muted" style="margin-top:8px">「掲載を停止」しても、登録者・問い合わせ・ログなどのデータは、削除されません（保管期間のルールに従います）。</p>`;
}
function bindProperties() {
  const f = (id) => $('#' + id);
  const reset = () => { f('pfTitle').textContent = '物件を登録する'; f('pfId').disabled = false; ['pfId', 'pfName', 'pfArea', 'pfUrl', 'pfApp'].forEach((i) => { f(i).value = ''; }); f('pfSave').textContent = '登録する'; f('pfCancel').classList.add('hidden'); };
  f('pfCancel').addEventListener('click', reset);
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const p = S.propDocs.find((x) => x.id === b.dataset.edit);
    f('pfTitle').textContent = `物件を編集する（${p.name}）`; f('pfId').value = p.id; f('pfId').disabled = true; f('pfName').value = p.name || '';
    f('pfRegion').value = p.region || REGIONS[0]; f('pfArea').value = p.area || ''; f('pfKind').value = p.kind || '新築'; f('pfUrl').value = p.url || ''; f('pfApp').value = p.appName || '';
    f('pfSave').textContent = '保存する'; f('pfCancel').classList.remove('hidden'); window.scrollTo(0, 0);
  }));
  f('pfSave').addEventListener('click', async (e) => {
    e.target.disabled = true; f('pfRes').innerHTML = '';
    try {
      const r = await call('adminSaveProperty')({ id: f('pfId').value.trim(), name: f('pfName').value, region: f('pfRegion').value, area: f('pfArea').value, kind: f('pfKind').value, url: f('pfUrl').value, appName: f('pfApp').value });
      await loadAll(); render(); $('#pfRes').innerHTML = `<div class="banner ok">${r.data.created ? '物件を登録しました' : '物件を更新しました'}</div>`;
    } catch (err) { f('pfRes').innerHTML = `<div class="banner err">${esc(err.message)}</div>`; e.target.disabled = false; }
  });
  const setStatus = (attr, status, msg) => $$(`[${attr}]`).forEach((b) => b.addEventListener('click', async () => {
    const p = S.propDocs.find((x) => x.id === b.getAttribute(attr));
    if (!confirm(msg(p.name))) return;
    try { await call('adminSetPropertyStatus')({ id: p.id, status }); await loadAll(); render(); } catch (err) { alert('できませんでした：' + err.message); }
  }));
  setStatus('data-archive', 'archived', (n) => `「${n}」の掲載を停止します。\n登録者・問い合わせ・ログなどのデータは、削除されません。\nよろしいですか？`);
  setStatus('data-restore', 'active', (n) => `「${n}」の掲載を再開します。よろしいですか？`);
}

/* ---------- ADEX専用：物件担当者アカウントの発行・変更・停止 ---------- */
const propChecks = (name, sel = []) => `<div style="display:flex;flex-wrap:wrap;gap:6px 14px">${PROPS.map((p) => `<label style="font-size:12px;display:flex;gap:6px;align-items:center"><input type="checkbox" name="${name}" value="${esc(p)}" ${sel.includes(p) ? 'checked' : ''}>${esc(PNAMES[p] || p)}</label>`).join('')}</div>`;
function tabStaff() {
  const rows = (S.data.staff || []).slice().sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return `<div class="card" style="margin-bottom:22px"><h2 class="h2">物件担当者のアカウントを発行する</h2>
    <div class="grid4" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
      <div class="field"><label>ID（メールアドレス）</label><input class="input" id="sfEmail" type="email" placeholder="例：tantou@example.com"></div>
      <div class="field"><label>お名前</label><input class="input" id="sfName" maxlength="60"></div>
    </div>
    <div class="field"><label>担当する物件（複数選べます）</label>${propChecks('sfProp')}</div>
    <button class="btn sm" id="sfCreate">発行する</button><div id="sfRes" style="margin-top:12px"></div></div>
  <div class="scroll-x"><table class="t"><thead><tr><th>ID</th><th>お名前</th><th>役割</th><th>担当物件</th><th>状態</th><th>操作</th></tr></thead><tbody>
  ${rows.map((s) => `<tr><td>${esc(s.email)}</td><td>${esc(s.displayName)}</td><td>${esc(ROLE_LABEL[s.role] || s.role)}</td><td>${(s.properties || []).map((p) => esc(PNAMES[p] || p)).join('・') || '全物件'}</td><td>${s.disabled ? '<span class="tag red">停止中</span>' : '<span class="tag">有効</span>'}</td>
  <td>${s.role === 'staff' ? `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm ghost" data-sedit="${esc(s.id)}">担当物件を変更</button>${s.disabled ? `<button class="btn sm ghost" data-son="${esc(s.id)}">再開</button>` : `<button class="btn sm danger" data-soff="${esc(s.id)}">停止</button>`}</div>` : '<span class="xs muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>
  <p class="xs muted" style="margin-top:8px">担当者のアカウントは、ADEXだけが発行・停止できます（担当者自身では作れません）。異動・退職のときは、すぐに「停止」してください。権限を変更すると、その担当者は、いったんログアウトされます。</p>`;
}
function bindStaff() {
  const picked = (name, root = document) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
  $('#sfCreate').addEventListener('click', async (e) => {
    e.target.disabled = true; $('#sfRes').innerHTML = '';
    try {
      const r = await call('adminCreateStaff')({ email: $('#sfEmail').value, name: $('#sfName').value, properties: picked('sfProp') });
      await loadAll(); render();
      $('#sfRes').innerHTML = `<div class="banner ok"><b>発行しました。</b>この画面を閉じると、パスワードは、二度と表示されません。<br>ID：<span class="mono">${esc(r.data.email)}</span>　パスワード：<span class="mono">${esc(r.data.password)}</span><br><span class="xs">安全な方法（直接・パスワード管理ツールなど）で、本人にお伝えください。</span></div>`;
    } catch (err) { $('#sfRes').innerHTML = `<div class="banner err">${esc(err.message)}</div>`; e.target.disabled = false; }
  });
  $$('[data-sedit]').forEach((b) => b.addEventListener('click', () => {
    const st = S.data.staff.find((x) => x.id === b.dataset.sedit);
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(20,28,22,.5);display:grid;place-items:center;z-index:50;padding:20px';
    ov.innerHTML = `<div class="card" style="max-width:460px;width:100%"><h2 class="h2">担当物件を変更（${esc(st.displayName)}）</h2>${propChecks('seProp', st.properties || [])}<div style="display:flex;gap:10px;margin-top:16px"><button class="btn sm" id="seOk">保存する</button><button class="btn sm ghost" id="seNo">キャンセル</button></div><div id="seRes" style="margin-top:10px"></div></div>`;
    document.body.appendChild(ov);
    $('#seNo', ov).addEventListener('click', () => ov.remove());
    $('#seOk', ov).addEventListener('click', async () => {
      try { await call('adminUpdateStaff')({ uid: st.id, properties: picked('seProp', ov) }); ov.remove(); await loadAll(); render(); } catch (err) { $('#seRes', ov).innerHTML = `<div class="banner err">${esc(err.message)}</div>`; }
    });
  }));
  const toggle = (attr, disabled, msg) => $$(`[${attr}]`).forEach((b) => b.addEventListener('click', async () => {
    const st = S.data.staff.find((x) => x.id === b.getAttribute(attr));
    if (!confirm(msg(st.displayName))) return;
    try { await call('adminSetStaffDisabled')({ uid: st.id, disabled }); await loadAll(); render(); } catch (err) { alert('できませんでした：' + err.message); }
  }));
  toggle('data-soff', true, (n) => `「${n}」のアカウントを停止します。すぐにログインできなくなります。よろしいですか？`);
  toggle('data-son', false, (n) => `「${n}」のアカウントを再開します。よろしいですか？`);
}

function render(full = true) {
  const views = { overview: tabOverview, members: tabMembers, notices: tabNotices, inquiries: tabInquiries, events: tabEvents, admin: tabAdmin, properties: tabProperties, staff: tabStaff };
  shell(views[S.tab]());
  if (S.tab === 'notices') bindNotices();
  if (S.tab === 'properties') bindProperties();
  if (S.tab === 'staff') bindStaff();
}

onAuthStateChanged(auth, async (u) => {
  if (!u) { S.user = null; return viewLogin(); }
  const t = await u.getIdTokenResult(true);
  if (!t.claims.role || t.claims.role === 'member') { await signOut(auth); return viewLogin('<div class="banner err">この画面は、担当者のみご利用いただけます</div>'); }
  S.user = u; S.claims = t.claims; S.tab = 'overview';
  root.innerHTML = '<div class="section center muted" style="padding-top:30vh">読み込み中…</div>';
  try { await loadAll(); render(); } catch (e) { root.innerHTML = `<div class="section"><div class="banner err">データを読み込めませんでした：${esc(e.message)}</div><button class="btn sm" onclick="location.reload()">再読み込み</button></div>`; }
});
