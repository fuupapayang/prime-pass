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
const S = { claims: null, user: null, tab: 'overview', data: {}, propDocs: [], assets: {}, prop: 'all', detail: null, q: '', mfilter: 'all', istatus: 'new' };
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
const NAV = [['overview', 'ホーム', 'M4 11l8-7 8 7v9H4z'], ['members', '登録者', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6'], ['notices', '配信', 'M3 11l18-8-8 18-2-8z'], ['inquiries', '問い合わせ', 'M3 5h18v14H3zM3 7l9 7 9-7'], ['menu', 'メニュー', 'M4 6h16M4 12h16M4 18h16']];
const MENU_TABS = ['reservations', 'events', 'properties', 'staff', 'admin'];
const TAB_LABEL = { reservations: '来場予約', events: '行動ログ', properties: '物件の管理', staff: '担当者アカウント', admin: '操作記録' };
const menuItems = () => [['reservations', '来場予約', '予約の日別一覧'], ['events', '行動ログ', '匿名IDでの行動の記録'], ...(can.manage() ? [['properties', '物件の管理', '登録・編集・掲載の停止'], ['staff', '担当者アカウント', '発行・担当物件の変更・停止'], ['admin', '操作記録', '誰がいつ何をしたか']] : [])];

function shell(inner) {
  const active = MENU_TABS.includes(S.tab) ? 'menu' : S.tab;
  const chart = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
  root.innerHTML = `<div class="admin">
    <div class="admin-head">
      ${scope().length > 1 ? `<label class="selector" style="margin:0">${chart}<select id="propSel" style="border:0;background:none;font-family:inherit;font-size:12px;color:var(--ink)"><option value="all">すべての物件</option>${scope().map((p) => `<option value="${esc(p)}" ${S.prop === p ? 'selected' : ''}>${esc(PNAMES[p] || p)}</option>`).join('')}</select></label>` : `<span class="selector" style="margin:0">${chart}${esc((PNAMES[scope()[0]] || ''))}</span>`}
      <span class="tag soft">${esc(roleName())}</span>
    </div>
    <div id="main">${inner}</div>
    <nav class="bnav">${NAV.map(([k, l, d]) => `<button data-t="${k}" class="${active === k ? 'on' : ''}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="${d}"/></svg><span>${l}</span></button>`).join('')}</nav></div>`;
  const ps = $('#propSel'); if (ps) ps.addEventListener('change', () => { S.prop = ps.value; S.detail = null; render(); });
  $$('[data-gotab]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); S.tab = a.dataset.gotab; S.detail = null; render(); }));
  $$('.bnav button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.t; S.detail = null; render(); }));
}

const pn = (p) => esc(PNAMES[p] || p);
const ago = (ts, days) => (ts?.toMillis?.() || 0) > Date.now() - days * 86400000;

const fd = (arr) => (S.prop === 'all' ? arr : arr.filter((x) => x.property === S.prop));
const initial = (s) => String(s || '?').replace(/\s/g, '').charAt(0);
const avatar = (s) => `<span style="width:38px;height:38px;background:var(--soft);color:var(--green);display:grid;place-items:center;font-family:var(--serif-jp);font-size:15px;flex:none">${esc(initial(s))}</span>`;
const TAGL = { entry: '会員登録', document: '資料請求', visit: '来場予約' };
const hoursAgo = (ts) => { const h = Math.floor((Date.now() - (ts?.toMillis?.() || Date.now())) / 3600000); return h < 1 ? '1時間以内' : h < 24 ? `${h}時間経過` : `${Math.floor(h / 24)}日経過`; };
const stat = (label, n, sub = '', red = false) => `<div class="stat"><div class="l">${label}</div><div class="n" style="${red ? 'color:var(--danger)' : ''}">${n}</div>${sub ? `<div class="xs muted">${sub}</div>` : ''}</div>`;
const goTab = (t, l, sub = '', col = '#d8d1c3') => `<a href="#" data-gotab="${t}" style="display:flex;justify-content:space-between;align-items:center;padding:14px 4px 14px 12px;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;border-left:3px solid ${col}"><span><b style="font-weight:500">${l}</b>${sub ? `<br><span class="xs" style="color:${col}">${sub}</span>` : ''}</span><span class="muted">›</span></a>`;

function tabOverview() {
  const d = S.data; const mem = fd(d.memberships); const ev = fd(d.events); const nt = fd(d.notices); const inq = fd(d.inquiries);
  const uniq = new Set(mem.map((m) => m.anonId)).size;
  const push = mem.filter((m) => m.pushEnabled).length;
  const newInq = inq.filter((i) => i.status === 'new' || !i.status);
  const visits = inq.filter((i) => i.kind === 'visit' && i.status !== 'done');
  const recent = nt.slice().sort((a, b) => (b.publishedAt?.toMillis?.() || 0) - (a.publishedAt?.toMillis?.() || 0)).slice(0, 3);
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:14px">Dashboard</h1>
  <div class="grid4">${stat('登録者', uniq, `物件ごとの登録 ${mem.length}件`)}${can.inquiries() ? stat('未対応の問い合わせ', newInq.length, newInq.length ? '要対応' : '', newInq.length > 0) : ''}${stat('通知オン', push, `登録の ${mem.length ? Math.round((push / mem.length) * 100) : 0}%`)}${stat('直近7日のアクセス', ev.filter((e) => ago(e.ts, 7)).length)}</div>
  <h2 class="h2" style="margin-top:26px">今日やること</h2>
  <div style="border-top:1px solid var(--line)">${can.inquiries() ? goTab('inquiries', `未対応の問い合わせ ${newInq.length}件`, newInq.length ? '早めの対応が必要です' : '', '#b3402f') + goTab('reservations', `来場予約 ${visits.length}件`, '', '#2f6db5') : ''}${goTab('members', `通知オフの登録者 ${mem.length - push}件`, '通知が届かない方です', '#997544')}</div>
  <h2 class="h2" style="margin-top:26px">最近の配信</h2>
  <div>${recent.length ? recent.map((n) => `<div class="nrow" style="cursor:default"><div class="meta"><span class="tag">${pn(n.property)}</span><span>${fmtDate(n.publishedAt)}</span></div><div class="t">${esc(n.title)}</div>${n.stats ? `<div class="xs muted" style="margin-top:4px">対象 ${n.stats.members}人／到達 ${n.stats.success}件（宛先 ${n.stats.pushTargets}）</div>` : ''}</div>`).join('') : '<div class="muted small">まだありません</div>'}</div>
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

/* ---------- 登録者（検索・絞り込み・詳細） ---------- */
function tabMembers() {
  const d = S.data; const showPII = can.contacts();
  const pii = Object.fromEntries(d.contacts.map((c) => [c.id, c]));
  const q = (S.q || '').trim().toLowerCase();
  let rows = fd(d.memberships).slice().sort((a, b) => (b.joinedAt?.toMillis?.() || 0) - (a.joinedAt?.toMillis?.() || 0));
  if (S.mfilter !== 'all') rows = rows.filter((m) => (m.tags || []).includes(S.mfilter));
  if (q) rows = rows.filter((m) => { const c = pii[m.cid + '_' + m.property] || {}; return [m.anonId, c.name, c.email, c.phone].join(' ').toLowerCase().includes(q); });
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:12px">Members</h1>
  ${showPII ? '' : '<div class="banner warn">この役割では、名前・メール・電話は見えません（匿名IDのみ）。</div>'}
  <input class="input" id="mq" placeholder="${showPII ? '名前・メール・電話で探す' : '匿名IDで探す'}" value="${esc(S.q || '')}">
  <div class="chips" id="mf" style="margin:12px 0">${[['all', 'すべて'], ['entry', '会員登録'], ['document', '資料請求'], ['visit', '来場予約']].map(([k, l]) => `<button class="chip ${S.mfilter === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="xs muted" style="margin-bottom:8px">${rows.length}人　／　登録が新しい順</div>
  <div>${rows.map((m) => { const c = pii[m.cid + '_' + m.property]; return `<div class="nrow" data-mid="${esc(m.cid + '_' + m.property)}" style="display:flex;gap:12px;align-items:center">${avatar(showPII ? c?.name : 'M')}<div style="flex:1;min-width:0"><div class="t">${showPII ? esc(c?.name || '—') : `<span class="mono">${esc(m.anonId)}</span>`}</div><div class="xs muted">${pn(m.property)}　${(m.tags || []).map((t) => `<span class="tag">${esc(TAGL[t] || t)}</span>`).join(' ')}</div></div><div class="xs muted" style="text-align:right">${fmtDate(m.joinedAt)}<br>${m.pushEnabled ? '通知オン' : '<span style="color:var(--danger)">通知オフ</span>'}</div></div>`; }).join('') || '<div class="muted small">該当する登録者は、いません</div>'}</div>`;
}
function bindMembers() {
  $('#mq').addEventListener('input', (e) => { S.q = e.target.value; const pos = e.target.selectionStart; render(); const el = $('#mq'); el.focus(); el.setSelectionRange(pos, pos); });
  $$('#mf .chip').forEach((b) => b.addEventListener('click', () => { S.mfilter = b.dataset.v; render(); }));
  $$('[data-mid]').forEach((r) => r.addEventListener('click', () => { S.detail = { type: 'member', id: r.dataset.mid }; render(); window.scrollTo(0, 0); }));
}
function detailMember() {
  const d = S.data; const m = d.memberships.find((x) => x.cid + '_' + x.property === S.detail.id); if (!m) { S.detail = null; return tabMembers(); }
  const c = d.contacts.find((x) => x.id === S.detail.id); const showPII = can.contacts();
  const evs = d.events.filter((e) => e.anonId === m.anonId).sort((a, b) => (b.ts?.toMillis?.() || 0) - (a.ts?.toMillis?.() || 0)).slice(0, 10);
  const lab = { open: 'アプリを開いた', notice_open: 'お知らせを開いた', checkin: 'ホーム画面から起動（チェックイン）' };
  const regs = d.memberships.filter((x) => x.cid === m.cid);
  return `<button class="btn sm ghost" id="back">‹ 登録者の一覧へ</button>
  <p class="eyebrow" style="margin-top:16px">Membership management</p><h1 class="display" style="font-size:32px">Member Profile</h1>
  <div style="display:flex;gap:12px;align-items:center;margin:16px 0">${avatar(showPII ? c?.name : 'M')}<div><div style="font-family:var(--serif-jp);font-size:19px">${showPII ? esc(c?.name || '—') + ' 様' : `<span class="mono">${esc(m.anonId)}</span>`}</div><div>${(m.tags || []).map((t) => `<span class="tag">${esc(TAGL[t] || t)}</span>`).join(' ')} <span class="tag dark">会員</span></div></div></div>
  ${showPII ? `<div class="kv" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">電話</span><a href="tel:${esc(c?.phone)}">${esc(c?.phone)}</a></div><div class="kv" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">メール</span><a href="mailto:${esc(c?.email)}">${esc(c?.email)}</a></div><p class="xs muted" style="margin-top:8px">個人情報の閲覧は、ES CONの担当者・ADEXのみです。</p>` : '<div class="banner warn">個人情報は、この役割では見えません。</div>'}
  <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-soon="個別に送る">個別に送る</button><button class="btn ghost" style="flex:1" data-soon="タグを編集">タグを編集</button></div>
  <h2 class="h2" style="margin-top:24px">登録している物件</h2><div class="chips">${regs.map((x) => `<span class="tag dark">${pn(x.property)}</span>`).join('')}</div>
  <h2 class="h2" style="margin-top:24px">行動の履歴</h2>
  <div class="list">${evs.map((e) => `<div class="list-item" style="cursor:default"><span style="width:7px;height:7px;border-radius:50%;background:var(--gold);margin-top:9px;flex:none"></span><div><div class="t" style="font-size:13px">${esc(lab[e.type] || e.type)}</div><div class="d">${pn(e.property)}　${fmtDate(e.ts)}</div></div></div>`).join('') || '<div class="muted small">まだありません</div>'}</div>`;
}

/* ---------- お知らせ配信（作成・プレビュー・結果） ---------- */
function tabNotices() {
  const d = S.data;
  const list = fd(d.notices).slice().sort((a, b) => (b.publishedAt?.toMillis?.() || 0) - (a.publishedAt?.toMillis?.() || 0));
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:14px">Notifications</h1>
  <div class="seg"><button class="" disabled style="opacity:.45">予約中 0</button><button class="on">配信済み ${list.length}</button><button disabled style="opacity:.45">承認待ち 0</button><button disabled style="opacity:.45">下書き 0</button></div>
  <div>${list.map((n) => `<div class="nrow" style="cursor:default"><div class="meta"><span class="tag soft">配信済み</span><span class="tag">${pn(n.property)}</span><span>${fmtDate(n.publishedAt)}</span></div><div class="t">${esc(n.title)}</div>${n.stats ? `<div class="xs muted" style="margin-top:4px">対象 ${n.stats.members}人／宛先 ${n.stats.pushTargets}件／到達 ${n.stats.success}件${n.stats.failure ? `／失敗 ${n.stats.failure}件` : ''}</div>` : ''}</div>`).join('') || '<div class="muted small">まだありません</div>'}</div>
  <p class="xs muted">※予約配信・承認フロー・下書きは、これから作ります。</p>
  <button class="btn" id="newNotice" style="margin-top:14px">＋ 通知を新しく作る</button>`;
}
function detailCompose() {
  return `<button class="btn sm ghost" id="back">‹ 通知の一覧へ</button>
  <p class="eyebrow" style="margin-top:16px">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:14px">Compose a Letter</h1>
  ${can.send() ? '' : `<div class="banner warn">この役割（${esc(roleName())}）では、通知を配信できません。配信しようとすると、拒否されます（権限のテスト用に、送信ボタンは使えます）。</div>`}
  <div class="field"><label>物件</label><select class="input" id="np">${PROPS.map((p) => `<option value="${esc(p)}" ${S.prop === p ? 'selected' : ''}>${pn(p)}</option>`).join('')}</select>
    <div class="xs muted" style="margin-top:4px">※自分の担当ではない物件を選ぶと、サーバーが拒否します（権限のテスト）</div></div>
  <div class="field"><label>タイトル（30文字まで）　<span id="ntc" class="xs">0/30</span></label><input class="input" id="nt" maxlength="30" value="限定間取りを追加しました"></div>
  <div class="field"><label>本文（80文字まで）　<span id="nbc" class="xs">0/80</span></label><textarea class="input" id="nb" maxlength="80">限定の間取りを公開しました。アプリでご覧ください。</textarea></div>
  <div style="background:var(--soft);padding:12px 14px;display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px"><span class="muted">配信の対象</span><span id="tgt"></span></div>
  <div class="xs muted" style="margin-bottom:10px">通知の文面には、お客様の氏名などの個人情報は入りません。</div>
  <h2 class="h2">端末での見え方</h2>
  <div style="background:var(--green);padding:14px;margin-bottom:14px"><div style="background:#fff;padding:10px 12px;display:flex;gap:10px"><span style="width:30px;height:30px;background:var(--gold);color:#fff;display:grid;place-items:center;font-family:var(--serif-en)">P</span><div><div class="xs muted">PRIME PASS　今</div><div id="pvT" style="font-weight:500;font-size:13px"></div><div id="pvB" class="xs"></div></div></div></div>
  <button class="btn" id="ns">配信する</button><div id="nr" style="margin-top:12px"></div>`;
}
function bindNotices() {
  const nb = $('#newNotice'); if (nb) nb.addEventListener('click', () => { S.detail = { type: 'compose' }; render(); window.scrollTo(0, 0); });
}
function bindCompose() {
  const b = $('#ns'); if (!b) return;
  const sync = () => { $('#ntc').textContent = `${$('#nt').value.length}/30`; $('#nbc').textContent = `${$('#nb').value.length}/80`; $('#pvT').textContent = $('#nt').value; $('#pvB').textContent = $('#nb').value; const ms = S.data.memberships.filter((m) => m.property === $('#np').value); $('#tgt').textContent = `${new Set(ms.map((m) => m.anonId)).size}人（通知オン ${ms.filter((m) => m.pushEnabled).length}人）`; };
  $('#nt').addEventListener('input', sync); $('#nb').addEventListener('input', sync); $('#np').addEventListener('change', sync); sync();
  b.addEventListener('click', async () => {
    b.disabled = true; $('#nr').innerHTML = '';
    try {
      const r = await call('sendNotice')({ property: $('#np').value, title: $('#nt').value, body: $('#nb').value });
      await loadAll(); S.detail = null; S.tab = 'notices'; render();
      $('#main').insertAdjacentHTML('afterbegin', `<div class="banner ok">配信しました。対象の登録者 ${r.data.members}人／通知の宛先 ${r.data.pushTargets}件（成功 ${r.data.success}・失敗 ${r.data.failure}）</div>`);
    } catch (e) { $('#nr').innerHTML = `<div class="banner err">拒否されました／失敗しました：${esc(e.message)}</div>`; b.disabled = false; }
  });
}

/* ---------- 問い合わせ（状況別・詳細・対応メモ） ---------- */
function tabInquiries() {
  if (!can.inquiries()) return '<div class="banner warn">この役割では、問い合わせの内容は見えません（QLEA・ES CON本社は不可）。</div>';
  const d = S.data; const pii = Object.fromEntries(d.contacts.map((c) => [c.cid + '_' + c.property, c]));
  const all = fd(d.inquiries).filter((i) => i.kind !== 'visit').slice().sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const st = (i) => i.status || 'new';
  const cnt = (k) => all.filter((i) => st(i) === k).length;
  const rows = all.filter((i) => st(i) === S.istatus);
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:14px">Inquiries</h1>
  <div class="seg" id="is">${[['new', `未対応 ${cnt('new')}`], ['doing', `対応中 ${cnt('doing')}`], ['done', `完了 ${cnt('done')}`]].map(([k, l]) => `<button data-v="${k}" class="${S.istatus === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div>${rows.map((i) => { const c = pii[i.cid + '_' + i.property]; return `<div class="nrow" data-iid="${esc(i.id)}" style="display:flex;gap:12px;align-items:center">${avatar(c?.name)}<div style="flex:1;min-width:0"><div class="t">${esc(c?.name || '—')}　<span class="xs muted">受付 ${fmtDate(i.createdAt)}</span></div><div class="xs muted">${pn(i.property)}　${i.contactMethod === 'tel' ? '折り返し：電話' : i.contactMethod === 'mail' ? '折り返し：メール' : ''}</div><div class="xs">${esc(i.message || '')}</div></div>${st(i) === 'new' ? `<span class="xs" style="background:#f4dcd7;color:var(--danger);padding:2px 8px;border-radius:99px;white-space:nowrap">${hoursAgo(i.createdAt)}</span>` : ''}</div>`; }).join('') || '<div class="muted small">該当する問い合わせは、ありません</div>'}</div>`;
}
function bindInquiries() {
  $$('#is button').forEach((b) => b.addEventListener('click', () => { S.istatus = b.dataset.v; render(); }));
  $$('[data-iid]').forEach((r) => r.addEventListener('click', () => { S.detail = { type: 'inq', id: r.dataset.iid }; render(); window.scrollTo(0, 0); }));
}
function detailInquiry() {
  const d = S.data; const i = d.inquiries.find((x) => x.id === S.detail.id); if (!i) { S.detail = null; return tabInquiries(); }
  const c = d.contacts.find((x) => x.cid === i.cid && x.property === i.property);
  const st = i.status || 'new';
  return `<button class="btn sm ghost" id="back">‹ 一覧へ</button>
  <p class="eyebrow" style="margin-top:16px">Membership management</p><h1 class="display" style="font-size:32px">Member Support</h1>
  <div class="seg" style="margin:12px 0">${[['new', '未対応'], ['doing', '対応中'], ['done', '完了']].map(([k, l]) => `<button data-setst="${k}" class="${st === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div style="font-family:var(--serif-jp);font-size:19px;margin-bottom:8px">${esc(c?.name || '—')} 様</div>
  <div class="kv" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">電話</span><a href="tel:${esc(c?.phone)}">${esc(c?.phone)}</a></div>
  <div class="kv" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">メール</span><a href="mailto:${esc(c?.email)}">${esc(c?.email)}</a></div>
  <div class="kv" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">相談したい物件</span><span>${pn(i.property)}</span></div>
  <div class="kv" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">折り返しのご希望</span><span>${i.contactMethod === 'tel' ? '電話' : 'メール'}（${esc({ am: '午前', pm: '午後', eve: '夕方', any: 'いつでも' }[i.timeSlot] || i.timeSlot || '')}）</span></div>
  ${i.message ? `<div class="card" style="margin-top:14px">${esc(i.message)}</div>` : ''}
  <div class="field" style="margin-top:16px"><label>対応メモ</label><textarea class="input" id="memo" maxlength="300" placeholder="例：折り返し予定　本日15時ごろ">${esc(i.memo || '')}</textarea></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn ghost" style="width:auto;padding:0 22px" href="tel:${esc(c?.phone)}">電話する</a><button class="btn" style="width:auto;padding:0 22px" id="sdoing">対応中にする</button><button class="btn ghost" style="width:auto;padding:0 22px" id="sdone">完了にする</button></div><div id="sres" style="margin-top:12px"></div>`;
}
function bindInquiryDetail() {
  const set = (status) => async () => { try { await call('setInquiryStatus')({ id: S.detail.id, status, memo: $('#memo').value }); await loadAll(); render(); } catch (e) { $('#sres').innerHTML = `<div class="banner err">${esc(e.message)}</div>`; } };
  $('#sdoing').addEventListener('click', set('doing')); $('#sdone').addEventListener('click', set('done'));
  $$('[data-setst]').forEach((b) => b.addEventListener('click', set(b.dataset.setst)));
}

/* ---------- 来場予約（日別） ---------- */
function tabReservations() {
  if (!can.inquiries()) return '<div class="banner warn">この役割では、来場予約の内容は見えません。</div>';
  const d = S.data; const pii = Object.fromEntries(d.contacts.map((c) => [c.cid + '_' + c.property, c]));
  const vs = fd(d.inquiries).filter((i) => i.kind === 'visit').sort((a, b) => String(a.visitDate + a.timeSlot).localeCompare(String(b.visitDate + b.timeSlot)));
  const dates = [...new Set(vs.map((v) => v.visitDate || '日付未定'))];
  if (!S.rdate || !dates.includes(S.rdate)) S.rdate = dates[0];
  const dow = ['日', '月', '火', '水', '木', '金', '土'];
  const strip = dates.slice(0, 7).map((ds) => { const dt = new Date(ds); const ok = !isNaN(dt); return `<button data-rd="${esc(ds)}" class="${S.rdate === ds ? 'on' : ''}" style="flex:none;width:46px;height:58px;border:1px solid var(--line);background:${S.rdate === ds ? 'var(--green)' : 'var(--white)'};color:${S.rdate === ds ? '#fff' : 'var(--ink)'};font-family:inherit;cursor:pointer"><div class="xs">${ok ? dow[dt.getDay()] : ''}</div><div style="font-size:16px;font-weight:500">${ok ? dt.getDate() : '—'}</div></button>`; }).join('');
  const day = vs.filter((v) => (v.visitDate || '日付未定') === S.rdate);
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:14px">Reservations</h1>
  ${dates.length ? `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px">${strip}</div><h2 class="h2" style="margin-top:14px">${esc(S.rdate)}の予約 ${day.length}件</h2>
  ${day.map((v) => { const c = pii[v.cid + '_' + v.property]; return `<div class="nrow" style="cursor:default;display:flex;gap:14px;align-items:center"><div style="font-weight:700;font-size:18px;color:var(--green);width:62px">${esc(v.timeSlot || '—')}</div><div style="flex:1"><div class="t">${esc(c?.name || '—')}</div><div class="xs muted">経路：来場予約　${pn(v.property)}</div></div><span class="tag soft">${esc(v.guests || 1)}名</span></div>`; }).join('')}` : '<div class="muted small">来場予約は、まだありません</div>'}
  <div style="background:var(--soft);color:#55594e;padding:12px 14px;font-size:11px;margin-top:16px">来場後の操作はありません。予約した方は、タグ「来場予約者」で管理されます。</div>`;
}

function tabMenu() {
  const c = S.claims;
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:14px">Management</h1>
  <div style="background:var(--green);color:#fff;padding:16px;display:flex;gap:14px;align-items:center;margin-bottom:18px"><span style="width:44px;height:44px;background:var(--gold);display:grid;place-items:center;font-family:var(--serif-jp);font-size:18px">${esc(initial(S.user.displayName || roleName()))}</span><div><div>${esc(S.user.displayName || roleName())}</div><div class="xs" style="opacity:.8">${esc(roleName())}</div></div></div>
  <div style="border-top:1px solid var(--line)">${menuItems().map(([k, l, d]) => `<a href="#" data-gotab="${k}" style="display:flex;justify-content:space-between;align-items:center;padding:16px 2px;border-bottom:1px solid var(--line);text-decoration:none;color:inherit"><span><b style="font-weight:500">${l}</b><br><span class="xs muted">${d}</span></span><span class="muted">›</span></a>`).join('')}</div>
  <p class="xs muted" style="margin-top:12px">${esc(roleSummary())}</p>
  <button class="btn ghost" id="lo2" style="margin-top:18px;color:var(--danger);border-color:var(--danger)">ログアウト</button>`;
}

function tabEvents() {
  const rows = fd(S.data.events).slice().sort((a, b) => (b.ts?.toMillis?.() || 0) - (a.ts?.toMillis?.() || 0)).slice(0, 60);
  const lab = { open: 'アプリを開いた', notice_open: 'お知らせを開いた', checkin: 'チェックイン（ホーム画面から起動）' };
  return `<div class="banner">行動ログは、匿名IDで記録されます（個人は特定できません）。直近60件を表示します。</div>
  <div class="scroll-x"><table class="t"><thead><tr><th>日付</th><th>匿名ID</th><th>物件</th><th>行動</th></tr></thead><tbody>
  ${rows.map((e) => `<tr><td>${fmtDate(e.ts)}</td><td class="mono">${esc(e.anonId)}</td><td>${pn(e.property)}</td><td>${esc(lab[e.type] || e.type)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">まだありません</td></tr>'}</tbody></table></div>`;
}

const AUDIT_JA = { sendNotice: ['通知を配信', '配信', '#2e7d5b'], sendNotice_denied: ['通知の配信を拒否', '権限', '#b3402f'], intake: ['登録フォームから登録', '登録', '#2f6db5'], property_create: ['物件を登録', '物件', '#997544'], property_update: ['物件を更新', '物件', '#997544'], property_archive: ['物件の掲載を停止', '物件', '#b3402f'], property_restore: ['物件の掲載を再開', '物件', '#2e7d5b'], staff_create: ['担当者を発行', '権限', '#b3402f'], staff_update: ['担当物件を変更', '権限', '#b3402f'], staff_disable: ['担当者を停止', '権限', '#b3402f'], staff_enable: ['担当者を再開', '権限', '#2e7d5b'], inquiry_status: ['問い合わせの状況を変更', '対応', '#2f6db5'] };
function tabAdmin() {
  const d = S.data;
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:12px">Audit Trail</h1>
  <div style="background:var(--soft);padding:12px 14px;font-size:11px;margin-bottom:14px">いつ・誰が・何をしたかを記録しています。個人情報は、記録に含みません。</div>
  <div>${d.audit.slice(0, 60).map((a) => { const j = AUDIT_JA[a.action] || [a.action, 'その他', '#7d7b6e']; const who = (d.staff || []).find((x) => x.id === a.actor); return `<div class="nrow" style="cursor:default;display:flex;gap:10px;align-items:center"><div style="flex:1"><div class="t" style="font-size:13px">${esc(j[0])}</div><div class="xs muted">${fmtDate(a.at)}　${esc(who ? who.displayName : a.actor === 'system' ? 'システム' : String(a.actor).slice(0, 8))}</div></div><span class="xs" style="background:${j[2]}22;color:${j[2]};padding:2px 8px;border-radius:2px">${j[1]}</span></div>`; }).join('') || '<div class="muted small">まだありません</div>'}</div>`;
}

/* ---------- ADEX専用：物件の登録・編集・掲載停止 ---------- */
function thumb(id) { return `<div style="width:64px;height:64px;background:#cfc8b8 center/cover no-repeat;${imgOf(id) ? `background-image:url('${esc(imgOf(id))}')` : ''}"></div>`; }
function tabProperties() {
  const counts = {}; S.data.memberships.forEach((m) => { counts[m.property] = (counts[m.property] || 0) + 1; });
  const act = S.propFilter === 'archived' ? S.propDocs.filter((p) => p.status === 'archived') : S.propDocs.filter((p) => p.status !== 'archived');
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:12px">Residences</h1>
  <div class="seg" id="pfTabs"><button data-v="active" class="${S.propFilter !== 'archived' ? 'on' : ''}">公開中 ${S.propDocs.filter((p) => p.status !== 'archived').length}</button><button data-v="archived" class="${S.propFilter === 'archived' ? 'on' : ''}">掲載停止 ${S.propDocs.filter((p) => p.status === 'archived').length}</button></div>
  <div>${act.map((p) => `<div class="nrow" style="cursor:default;display:flex;gap:12px;align-items:center">${thumb(p.id).replace('width:64px;height:64px', 'width:44px;height:44px')}<div style="flex:1;min-width:0"><div class="t">${esc(p.name)}</div><div class="xs muted">${esc(p.kind || '')}　${esc(p.region || '')}　登録者${counts[p.id] || 0}人</div><div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm ghost" data-edit="${esc(p.id)}">編集</button>${p.status === 'archived' ? `<button class="btn sm ghost" data-restore="${esc(p.id)}">掲載を再開</button>` : `<button class="btn sm danger" data-archive="${esc(p.id)}">掲載を停止</button>`}</div></div><span class="tag soft">${p.status === 'archived' ? '停止' : '公開中'}</span></div>`).join('') || '<div class="muted small">該当する物件は、ありません</div>'}</div>
  <p class="xs muted">「掲載を停止」しても、登録者・問い合わせ・ログなどのデータは、削除されません（保管期間のルールに従います）。</p>
  <button class="btn" id="newProp" style="margin-top:14px">＋ 物件を登録する</button>`;
}
function detailProperty() {
  const p = S.detail.edit ? S.propDocs.find((x) => x.id === S.detail.edit) : null;
  return `<button class="btn sm ghost" id="back">‹ 物件の一覧へ</button>
  <p class="eyebrow" style="margin-top:16px">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:14px">${p ? 'Edit Residence' : 'New Residence'}</h1>
    <div class="field"><label>物件ID（半角英数・ハイフン。登録後は変更できません）</label><input class="input" id="pfId" placeholder="例：hakone-101" maxlength="31" value="${esc(p?.id || '')}" ${p ? 'disabled' : ''}></div>
    <div class="field"><label>物件名</label><input class="input" id="pfName" maxlength="60" placeholder="例：レ・ジェイド箱根" value="${esc(p?.name || '')}"></div>
    <div class="field"><label>地域</label><select class="input" id="pfRegion">${REGIONS.map((r) => `<option ${p?.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <div class="field"><label>エリア</label><input class="input" id="pfArea" maxlength="60" placeholder="例：神奈川県 箱根町" value="${esc(p?.area || '')}"></div>
    <div class="field"><label>種別</label><select class="input" id="pfKind"><option ${p?.kind !== '中古' ? 'selected' : ''}>新築</option><option ${p?.kind === '中古' ? 'selected' : ''}>中古</option></select></div>
    <div class="field"><label>公式サイトURL（https://）</label><input class="input" id="pfUrl" maxlength="300" placeholder="https://" value="${esc(p?.url || '')}"></div>
    <div class="field"><label>アプリ内の表示名（任意）</label><input class="input" id="pfApp" maxlength="60" value="${esc(p?.appName || '')}"></div>
    <button class="btn" id="pfSave">${p ? '保存する' : 'この内容で登録する'}</button><div id="pfRes" style="margin-top:12px"></div>`;
}
function bindProperties() {
  const f = (id) => $('#' + id);
  $$('#pfTabs button').forEach((b) => b.addEventListener('click', () => { S.propFilter = b.dataset.v; render(); }));
  const np = $('#newProp'); if (np) np.addEventListener('click', () => { S.detail = { type: 'property' }; render(); window.scrollTo(0, 0); });
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => { S.detail = { type: 'property', edit: b.dataset.edit }; render(); window.scrollTo(0, 0); }));
  if (f('pfSave')) f('pfSave').addEventListener('click', async (e) => {
    e.target.disabled = true; f('pfRes').innerHTML = '';
    try {
      const r = await call('adminSaveProperty')({ id: f('pfId').value.trim(), name: f('pfName').value, region: f('pfRegion').value, area: f('pfArea').value, kind: f('pfKind').value, url: f('pfUrl').value, appName: f('pfApp').value });
      await loadAll(); S.detail = null; render(); $('#main').insertAdjacentHTML('afterbegin', `<div class="banner ok">${r.data.created ? '物件を登録しました' : '物件を更新しました'}</div>`);
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
  const grp = S.staffGroup || 'staff';
  const show = rows.filter((s) => (grp === 'staff' ? s.role === 'staff' : s.role !== 'staff'));
  return `<p class="eyebrow">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:12px">Staff Accounts</h1>
  <div class="seg" id="sgTabs"><button data-v="staff" class="${grp === 'staff' ? 'on' : ''}">物件担当者 ${rows.filter((s) => s.role === 'staff').length}</button><button data-v="other" class="${grp === 'other' ? 'on' : ''}">ADEX・QLEA・本社 ${rows.filter((s) => s.role !== 'staff').length}</button></div>
  <div>${show.map((s) => `<div class="nrow" style="cursor:default;display:flex;gap:12px;align-items:center">${avatar(s.displayName)}<div style="flex:1;min-width:0"><div class="t">${esc(s.displayName)}</div><div class="xs muted">${esc(s.email)}<br>${(s.properties || []).map((p) => esc(PNAMES[p] || p)).join('・') || '全物件'}</div>${s.role === 'staff' ? `<div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm ghost" data-sedit="${esc(s.id)}">担当物件を変更</button>${s.disabled ? `<button class="btn sm ghost" data-son="${esc(s.id)}">再開</button>` : `<button class="btn sm danger" data-soff="${esc(s.id)}">停止</button>`}</div>` : ''}</div><span class="tag ${s.disabled ? 'red' : 'soft'}">${s.disabled ? '停止中' : '有効'}</span></div>`).join('')}</div>
  <p class="xs muted" style="margin-top:8px">担当者のアカウントは、ADEXだけが発行・停止できます。異動・退職のときは、すぐに「停止」してください。権限を変更すると、その担当者は、いったんログアウトされます。</p>
  <button class="btn" id="newStaff" style="margin-top:14px">＋ 担当者を追加する</button>`;
}
function detailStaff() {
  return `<button class="btn sm ghost" id="back">‹ 担当者の一覧へ</button>
  <p class="eyebrow" style="margin-top:16px">Membership management</p><h1 class="display" style="font-size:32px;margin-bottom:14px">New Staff</h1>
    <div class="field"><label>ID（メールアドレス）</label><input class="input" id="sfEmail" type="email" placeholder="例：tantou@example.com"></div>
    <div class="field"><label>お名前</label><input class="input" id="sfName" maxlength="60"></div>
    <div class="field"><label>担当する物件（複数選べます）</label>${propChecks('sfProp')}</div>
    <button class="btn" id="sfCreate">発行する</button><div id="sfRes" style="margin-top:12px"></div>`;
}

function bindStaff() {
  const picked = (name, root = document) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
  $$('#sgTabs button').forEach((b) => b.addEventListener('click', () => { S.staffGroup = b.dataset.v; render(); }));
  const ns = $('#newStaff'); if (ns) ns.addEventListener('click', () => { S.detail = { type: 'newstaff' }; render(); window.scrollTo(0, 0); });
  if ($('#sfCreate')) $('#sfCreate').addEventListener('click', async (e) => {
    e.target.disabled = true; $('#sfRes').innerHTML = '';
    try {
      const r = await call('adminCreateStaff')({ email: $('#sfEmail').value, name: $('#sfName').value, properties: picked('sfProp') });
      await loadAll();
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
  const views = { overview: tabOverview, members: tabMembers, notices: tabNotices, inquiries: tabInquiries, reservations: tabReservations, events: tabEvents, admin: tabAdmin, properties: tabProperties, staff: tabStaff, menu: tabMenu };
  const dv = { member: detailMember, inq: detailInquiry, compose: detailCompose, property: detailProperty, newstaff: detailStaff };
  const inner = S.detail ? dv[S.detail.type]() : views[S.tab]();
  shell(inner);
  const back = $('#back'); if (back) back.addEventListener('click', () => { S.detail = null; render(); });
  $$('[data-soon]').forEach((b) => b.addEventListener('click', () => alert(`「${b.dataset.soon}」は、これから作ります。`)));
  const lo = $('#lo2'); if (lo) lo.addEventListener('click', () => signOut(auth));
  if (S.detail) {
    if (S.detail.type === 'inq') bindInquiryDetail();
    if (S.detail.type === 'compose') bindCompose();
    if (S.detail.type === 'property') bindProperties();
    if (S.detail.type === 'newstaff') bindStaff();
    return;
  }
  if (S.tab === 'members') bindMembers();
  if (S.tab === 'inquiries') bindInquiries();
  if (S.tab === 'notices') bindNotices();
  if (S.tab === 'properties') bindProperties();
  if (S.tab === 'staff') bindStaff();
  $$('[data-rd]').forEach((b) => b.addEventListener('click', () => { S.rdate = b.dataset.rd; render(); }));
  if (MENU_TABS.includes(S.tab)) { const mb = document.createElement('div'); mb.style.cssText = 'margin-bottom:10px'; mb.innerHTML = '<button class="btn sm ghost" id="toMenu">‹ メニュー</button>'; $('#main').prepend(mb); $('#toMenu').addEventListener('click', () => { S.tab = 'menu'; render(); }); }
}

onAuthStateChanged(auth, async (u) => {
  if (!u) { S.user = null; return viewLogin(); }
  const t = await u.getIdTokenResult(true);
  if (!t.claims.role || t.claims.role === 'member') { await signOut(auth); return viewLogin('<div class="banner err">この画面は、担当者のみご利用いただけます</div>'); }
  S.user = u; S.claims = t.claims; S.tab = 'overview';
  root.innerHTML = '<div class="section center muted" style="padding-top:30vh">読み込み中…</div>';
  try { await loadAll(); render(); } catch (e) { root.innerHTML = `<div class="section"><div class="banner err">データを読み込めませんでした：${esc(e.message)}</div><button class="btn sm" onclick="location.reload()">再読み込み</button></div>`; }
});
