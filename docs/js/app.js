// PRIME PASS お客様アプリ（登録の引き継ぎ → ホーム → 物件 → お知らせ → お問い合わせ・来場予約）
import {
  auth, db, authReady, call, signInWithCustomToken, collection, query, where, getDocs, $, $$, esc, fmtDate,
} from './fb.js';
import { PROPERTY_NAMES, ENV_LABEL } from './config.js';

const app = $('#app');
const tabbar = $('#tabbar');
const S = { user: null, name: '', memberships: [], props: {}, notices: [], selected: new Set(), loaded: false };
const seenKey = 'pp.seenNotices';
const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch { return new Set(); } };
const markSeen = (ids) => { const s = seen(); ids.forEach((i) => s.add(i)); localStorage.setItem(seenKey, JSON.stringify([...s])); };

const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="3" width="14" height="18"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15zM10 21h4"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14"/><path d="M3 7l9 7 9-7"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 5l7 7-7 7"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l5 5 9-10"/></svg>',
};

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua);
const isAndroid = /Android/.test(ua);
const inApp = /Line\/|FBAN|FBAV|Instagram|MicroMessenger|Twitter/.test(ua);

/* ---------- 画面の部品 ---------- */
const topbar = (right = true) => `
  <div class="topbar">
    <div class="brand"><span class="mark">P</span>PRIME PASS</div>
    ${right ? `<button class="icon-btn" data-go="#/notices" aria-label="お知らせ">${ICON.bell}${unreadCount() ? '<span class="dot"></span>' : ''}</button>` : ''}
  </div>`;
const subHeader = (title, back = '#/home') => `
  <div class="topbar"><button class="icon-btn" data-go="${back}" aria-label="戻る" style="margin-left:-10px">${ICON.back}</button>
  <div style="font-family:var(--serif-jp);font-size:15px;color:var(--green)">${esc(title)}</div><div style="width:40px"></div></div>`;
const unreadCount = () => { const s = seen(); return S.notices.filter((n) => !s.has(n.id)).length; };
const disclaimer = () => `<div class="notice-note">掲載内容は${new Date().getFullYear()}年${new Date().getMonth() + 1}月${new Date().getDate()}日時点の情報です。内容は予告なく変更となる場合があります。最新の情報は、公式サイトまたは販売担当者にご確認ください。<br>※${ENV_LABEL}。表示はすべて架空の内容です。</div>`;

function setTabs(active) {
  const items = [['#/home', 'home', 'ホーム'], ['#/collection', 'building', '物件'], ['#/notices', 'bell', 'お知らせ'], ['#/contact', 'mail', 'お問い合わせ']];
  tabbar.innerHTML = items.map(([h, i, l]) => `<a href="${h}" class="${active === h ? 'on' : ''}">${ICON[i]}<span>${l}</span></a>`).join('');
  tabbar.classList.toggle('hidden', !active);
}

/* ---------- データ ---------- */
async function loadData() {
  const uid = auth.currentUser.uid;
  const [cs, ms, ps] = await Promise.all([
    getDocs(query(collection(db, 'contacts'), where('cid', '==', uid))),
    getDocs(query(collection(db, 'memberships'), where('cid', '==', uid))),
    getDocs(collection(db, 'properties')),
  ]);
  S.name = cs.docs.length ? cs.docs[0].data().name : '';
  S.memberships = ms.docs.map((d) => d.data());
  S.props = {}; ps.forEach((d) => { S.props[d.id] = d.data(); });
  const mine = S.memberships.map((m) => m.property);
  const lists = await Promise.all(mine.map((p) => getDocs(query(collection(db, 'notices'), where('property', '==', p)))));
  S.notices = lists.flatMap((l) => l.docs.map((d) => ({ id: d.id, ...d.data() })))
    .sort((a, b) => (b.publishedAt?.toMillis?.() || 0) - (a.publishedAt?.toMillis?.() || 0));
  S.loaded = true;
}
const propName = (p) => (S.props[p] && S.props[p].name) || PROPERTY_NAMES[p] || p;

/* ---------- 画面 ---------- */
function viewWelcome() {
  setTabs(null);
  app.innerHTML = `${topbar(false)}
  <div class="section" style="padding-top:28px">
    <p class="eyebrow">Members exclusive</p>
    <h1 class="display">Welcome</h1>
    <p class="muted" style="margin:14px 0 22px">PRIME PASS は、会員のお客様だけにお届けする、物件情報アプリです。ご利用には、エントリーフォームからのご登録が必要です。</p>
    <a class="btn" href="form/">登録フォームへ（サンプル）</a>
    <p class="xs muted" style="margin-top:14px">※${ENV_LABEL}。サンプルフォームは、ES CON様のエントリーフォームの代わりです。</p>
  </div>`;
}

function viewInstall() {
  setTabs(null);
  const steps = isIOS
    ? ['画面の下（または上）にある「共有」ボタン <span class="muted">（□から↑が出ているマーク）</span> を押します。', '「ホーム画面に追加」を選びます。', '右上の「追加」を押します。ホーム画面に、PRIME PASS のアイコンができます。']
    : isAndroid
      ? ['右上の「︙」メニューを開きます。', '「アプリをインストール」または「ホーム画面に追加」を選びます。', 'ホーム画面の PRIME PASS のアイコンから、開いてください。']
      : ['ブラウザのアドレス欄の右にある「インストール」のマークを押します。', 'またはスマホで、このページのQRコードを読み取ってください。'];
  app.innerHTML = `${topbar(false)}
  <div class="section" style="padding-top:20px">
    <p class="eyebrow">Step 2 of 2</p>
    <h1 class="display">Add to Home</h1>
    <div class="banner ok" style="margin-top:16px">${esc(S.name)} 様、ご登録ありがとうございます。<br>ホーム画面に追加すると、最新のお知らせが、通知で届きます。</div>
    ${inApp ? '<div class="banner warn">LINEなどのアプリの中では、追加できません。右上のメニューから「Safariで開く」または「ブラウザで開く」を選んでください。</div>' : ''}
    ${isIOS ? '<div class="banner">iPhoneでは、ホーム画面に追加したあとでないと、通知が届きません（iOS 16.4以上）。</div>' : ''}
    <ol class="steps">${steps.map((s) => `<li><div>${s}</div></li>`).join('')}</ol>
    <div style="margin-top:22px" class="stack">
      <button class="btn" data-go="#/home">ホームへ進む</button>
      <p class="xs muted center">あとで追加する場合も、このまま、ご利用いただけます。</p>
    </div>
  </div>`;
}

function viewHome() {
  setTabs('#/home');
  const s = seen();
  const latest = S.notices.slice(0, 3);
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:0">
    <p class="eyebrow">Members exclusive</p>
    <h1 class="display">Members’ Journal</h1>
  </div>
  <div class="hero">
    <div class="k">MEMBERS EXCLUSIVE</div>
    <div class="name">${esc(S.name || 'お客様')} 様</div>
    <div class="sub">ご登録ありがとうございます。会員さま向けの最新情報を、お届けします。</div>
  </div>
  <div class="section">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="h2">新着のお知らせ</h2><a href="#/notices" class="xs muted" style="text-decoration:none">すべて見る</a></div>
    <div class="list">${latest.length ? latest.map((n) => noticeRow(n, s)).join('') : '<div class="list-item"><div class="d">お知らせは、まだありません</div></div>'}</div>
    <h2 class="h2" style="margin-top:26px">ご登録の物件</h2>
    <div class="chips">${S.memberships.map((m) => `<span class="tag dark">${esc(propName(m.property))}</span>`).join('')}</div>
    <div id="pushbox" style="margin-top:24px"></div>
    <div class="stack" style="margin-top:22px">
      <button class="btn" data-go="#/visit">来場を予約する</button>
      <button class="btn ghost" data-go="#/contact">担当者に相談する</button>
    </div>
    ${disclaimer()}
  </div>`;
  renderPushBox();
}
function noticeRow(n, s) {
  return `<div class="list-item" data-go="#/notices">
    ${s.has(n.id) ? '<span style="width:7px;flex:none"></span>' : '<span class="reddot"></span>'}
    <div><div class="t">${esc(n.title)}</div><div class="d">${esc(propName(n.property))}　${fmtDate(n.publishedAt)}</div></div>
    <span class="chev">${ICON.chev}</span></div>`;
}

function viewCollection() {
  setTabs('#/collection');
  const ids = Object.keys(S.props).sort();
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:6px">
    <p class="eyebrow">Members exclusive</p>
    <h1 class="display">The Collection</h1>
    <p class="muted small" style="margin-top:10px">気になる物件を選んで、まとめてご相談いただけます。</p>
  </div>
  <div class="section">
    ${ids.map((p) => `<div class="prop" data-prop="${p}">
      <div class="art ${p}">PHOTO<div class="check ${S.selected.has(p) ? 'on' : ''}" data-check="${p}">${S.selected.has(p) ? ICON.check : ''}</div></div>
      <div class="ttl">${esc(propName(p))}</div>
      <div class="xs muted">${esc(S.props[p].area || '')}　／　${esc(S.props[p].kind || '')}</div>
      ${S.memberships.some((m) => m.property === p) ? '<div style="margin-top:6px"><span class="tag gold">ご登録済み</span></div>' : ''}
    </div>`).join('')}
    <div class="xs muted" style="margin-bottom:10px">${S.selected.size}件を選択中　名前・電話は、登録済みのため、入力不要です</div>
    <button class="btn" id="consultBtn" ${S.selected.size ? '' : 'disabled'}>まとめて相談する</button>
    ${disclaimer()}
  </div>`;
  $$('[data-check]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation(); const p = el.dataset.check; S.selected.has(p) ? S.selected.delete(p) : S.selected.add(p); viewCollection();
  }));
  $('#consultBtn').addEventListener('click', () => { location.hash = '#/contact'; });
}

function viewNotices() {
  setTabs('#/notices');
  const s = seen();
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:6px"><p class="eyebrow">Members exclusive</p><h1 class="display">Notices</h1></div>
  <div class="section"><div class="list">
    ${S.notices.length ? S.notices.map((n) => `<div class="list-item" data-nid="${n.id}" style="flex-wrap:wrap">
      ${s.has(n.id) ? '<span style="width:7px;flex:none"></span>' : '<span class="reddot"></span>'}
      <div style="flex:1"><div class="t">${esc(n.title)}</div><div class="d">${esc(propName(n.property))}　${fmtDate(n.publishedAt)}</div>
      <div class="body hidden" style="margin-top:10px;font-size:13px">${esc(n.body)}</div></div></div>`).join('') : '<div class="list-item"><div class="d">お知らせは、まだありません</div></div>'}
  </div>${disclaimer()}</div>`;
  $$('[data-nid]').forEach((el) => el.addEventListener('click', () => {
    el.querySelector('.body').classList.toggle('hidden');
    const dot = el.querySelector('.reddot'); if (dot) dot.remove();
    markSeen([el.dataset.nid]);
    call('logEvent')({ type: 'notice_open' }).catch(() => {});
  }));
}

function viewContact() {
  setTabs('#/contact');
  const all = Object.keys(S.props).sort();
  const sel = new Set(S.selected.size ? S.selected : S.memberships.slice(0, 1).map((m) => m.property));
  let method = 'tel'; let slot = 'pm';
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:6px"><p class="eyebrow">Members exclusive</p><h1 class="display">At Your Service</h1></div>
  <div class="section">
    <div class="banner">${esc(S.name)} 様<br><span class="muted xs">ご登録の電話・メールを使います（再入力は不要です）</span></div>
    <h2 class="h2">相談したい物件（複数選べます）</h2>
    <div class="list" id="propList">${all.map((p) => `<div class="list-item" data-p="${p}"><span class="tag ${sel.has(p) ? 'dark' : ''}" data-mark style="min-width:22px;text-align:center">${sel.has(p) ? '✓' : '　'}</span><div class="t">${esc(propName(p))}</div><span class="tag" style="margin-left:auto">新築</span></div>`).join('')}</div>
    <h2 class="h2" style="margin-top:22px">折り返しのご希望</h2>
    <div class="chips" id="method"><button class="chip on" data-v="tel">電話</button><button class="chip" data-v="mail">メール</button></div>
    <div class="chips" id="slot" style="margin-top:10px"><button class="chip" data-v="am">午前</button><button class="chip on" data-v="pm">午後</button><button class="chip" data-v="eve">夕方</button><button class="chip" data-v="any">いつでも</button></div>
    <div class="field" style="margin-top:18px"><label>ご相談の内容（任意）</label><textarea class="input" id="msg" maxlength="500" placeholder="気になる点を、ご記入ください"></textarea></div>
    <div class="xs muted" style="margin-bottom:12px">営業時間 10:00〜18:00（水曜定休）。時間外は、翌営業日にご連絡します。</div>
    <button class="btn" id="send">この内容で相談する</button>
    <div id="res" style="margin-top:14px"></div>
  </div>`;
  $$('#propList [data-p]').forEach((el) => el.addEventListener('click', () => {
    const p = el.dataset.p; sel.has(p) ? sel.delete(p) : sel.add(p);
    const m = el.querySelector('[data-mark]'); m.textContent = sel.has(p) ? '✓' : '　'; m.classList.toggle('dark', sel.has(p));
  }));
  const bind = (id, set) => $$(`#${id} .chip`).forEach((b) => b.addEventListener('click', () => { $$(`#${id} .chip`).forEach((x) => x.classList.remove('on')); b.classList.add('on'); set(b.dataset.v); }));
  bind('method', (v) => { method = v; }); bind('slot', (v) => { slot = v; });
  $('#send').addEventListener('click', async (e) => {
    if (!sel.size) { $('#res').innerHTML = '<div class="banner err">相談したい物件を選んでください</div>'; return; }
    e.target.disabled = true;
    try {
      const r = await call('submitInquiry')({ properties: [...sel], kind: 'inquiry', message: $('#msg').value, contactMethod: method, timeSlot: slot });
      $('#res').innerHTML = `<div class="banner ok">送信しました（${r.data.count}件）。担当者から、ご連絡します。</div>`;
      S.selected.clear();
    } catch (err) { $('#res').innerHTML = `<div class="banner err">送信できませんでした：${esc(err.message)}</div>`; e.target.disabled = false; }
  });
}

function viewVisit() {
  setTabs('#/contact');
  const mine = S.memberships.map((m) => m.property);
  let prop = mine[0] || 'a'; let date = ''; let slot = '11:30'; let guests = 2;
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + 1);
  const y = base.getFullYear(); const m = base.getMonth();
  const first = new Date(y, m, 1).getDay(); const days = new Date(y, m + 1, 0).getDate();
  app.innerHTML = `${subHeader('来場予約', '#/home')}
  <div class="section" style="padding-top:0"><p class="eyebrow">Members exclusive</p><h1 class="display">Your Invitation</h1>
    <div class="field" style="margin-top:18px"><label>物件</label><select class="input" id="vp">${Object.keys(S.props).sort().map((p) => `<option value="${p}" ${p === prop ? 'selected' : ''}>${esc(propName(p))}</option>`).join('')}</select></div>
    <div class="card"><div class="center" style="font-weight:500;margin-bottom:8px">${y}年${m + 1}月</div>
      <div class="calendar">${['日', '月', '火', '水', '木', '金', '土'].map((d) => `<div class="dow">${d}</div>`).join('')}${'<div></div>'.repeat(first)}${Array.from({ length: days }, (_, i) => { const d = i + 1; const dw = new Date(y, m, d).getDay(); return `<button data-d="${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}" ${dw === 3 ? 'disabled' : ''}>${d}</button>`; }).join('')}</div></div>
    <h2 class="h2" style="margin-top:20px">ご希望の時間</h2>
    <div class="chips" id="vs">${['10:00', '11:30', '14:00', '15:30'].map((t) => `<button class="chip ${t === slot ? 'on' : ''}" data-v="${t}">${t}</button>`).join('')}</div>
    <div class="field" style="margin-top:18px"><label>ご来場人数</label><select class="input" id="vg">${[1, 2, 3, 4, 5].map((n) => `<option ${n === guests ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <button class="btn" id="vsend" disabled>この内容で予約する</button><div id="vres" style="margin-top:14px"></div>
  </div>`;
  $$('.calendar button').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; $$('.calendar button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); date = b.dataset.d; $('#vsend').disabled = false; }));
  $$('#vs .chip').forEach((b) => b.addEventListener('click', () => { $$('#vs .chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); slot = b.dataset.v; }));
  $('#vsend').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await call('submitInquiry')({ properties: [$('#vp').value], kind: 'visit', visitDate: date, timeSlot: slot, guests: Number($('#vg').value), contactMethod: 'tel' });
      $('#vres').innerHTML = `<div class="banner ok">来場予約を受け付けました（${esc(date)}　${esc(slot)}）。担当者から、確認のご連絡をします。</div>`;
    } catch (err) { $('#vres').innerHTML = `<div class="banner err">予約できませんでした：${esc(err.message)}</div>`; e.target.disabled = false; }
  });
}

/* ---------- プッシュ通知 ---------- */
async function renderPushBox() {
  const box = $('#pushbox'); if (!box) return;
  const supported = 'Notification' in window && 'serviceWorker' in navigator;
  if (!supported || (isIOS && !isStandalone())) {
    box.innerHTML = `<div class="banner warn">${isIOS ? 'iPhoneでは、ホーム画面に追加したあとに、お知らせ通知をオンにできます。<br><a href="#/install" style="color:inherit">追加の手順を見る</a>' : 'このブラウザでは、通知を利用できません。'}</div>`;
    return;
  }
  if (Notification.permission === 'granted') { box.innerHTML = '<div class="banner ok">お知らせ通知は、オンです</div>'; if (!S.pushSaved) enablePush(true); return; }
  if (Notification.permission === 'denied') { box.innerHTML = '<div class="banner warn">通知がブロックされています。端末の設定から、許可してください。</div>'; return; }
  box.innerHTML = '<button class="btn ghost" id="pushBtn">お知らせ通知をオンにする</button><p class="xs muted" style="margin-top:8px">新しい物件情報や、限定の情報を、通知でお知らせします。</p>';
  $('#pushBtn').addEventListener('click', () => enablePush(false));
}
async function enablePush(silent) {
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') { renderPushBox(); return; }
    const { getMessaging, getToken, onMessage, isSupported } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');
    if (!(await isSupported())) { toast('このブラウザは、通知に対応していません'); return; }
    const { app: fbApp } = await import('./fb.js');
    const reg = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    const messaging = getMessaging(fbApp);
    const token = await getToken(messaging, { serviceWorkerRegistration: reg });
    if (!token) throw new Error('通知の宛先を取得できませんでした');
    await call('savePushToken')({ token });
    S.pushSaved = true;
    onMessage(messaging, (p) => { toast((p.notification && p.notification.title) || '新しいお知らせがあります'); refreshNotices(); });
    if (!silent) toast('お知らせ通知をオンにしました');
    renderPushBox();
  } catch (e) { toast('通知を設定できませんでした：' + e.message); }
}
async function refreshNotices() { try { await loadData(); const r = currentRoute(); if (r === '#/home') viewHome(); if (r === '#/notices') viewNotices(); } catch { /* noop */ } }

/* ---------- 起動・ルーティング ---------- */
const currentRoute = () => location.hash || '#/home';
function route() {
  if (!S.user) return viewWelcome();
  const r = currentRoute();
  const map = { '#/home': viewHome, '#/collection': viewCollection, '#/notices': viewNotices, '#/contact': viewContact, '#/visit': viewVisit, '#/install': viewInstall };
  (map[r] || viewHome)();
  window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]'); if (g) { location.hash = g.dataset.go; }
});
window.addEventListener('hashchange', route);

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./firebase-messaging-sw.js').catch(() => {});
  const u0 = await authReady;
  const t = new URLSearchParams(location.search).get('t');
  if (t) {
    app.innerHTML = '<div class="section center" style="padding-top:36vh"><p class="eyebrow">PRIME PASS</p><p class="h2">ご登録を確認しています…</p></div>';
    try {
      const r = await call('redeemToken')({ token: t });
      await signInWithCustomToken(auth, r.data.customToken);
      history.replaceState(null, '', location.pathname + '#/install'); // URLから一時番号を消す
    } catch (e) {
      app.innerHTML = `<div class="section" style="padding-top:20vh"><p class="eyebrow">PRIME PASS</p><h1 class="display-jp">ご登録の確認が、できませんでした</h1><div class="banner err" style="margin-top:16px">${esc(e.message)}</div><a class="btn" href="form/">登録フォームへ戻る</a></div>`;
      return;
    }
  }
  S.user = auth.currentUser || u0;
  if (S.user) {
    try {
      await loadData();
      call('logEvent')({ type: isStandalone() ? 'checkin' : 'open' }).catch(() => {});
    } catch (e) { toast('データを読み込めませんでした：' + e.message); }
  }
  if (S.user && !location.hash) location.hash = '#/home';
  route();
}
boot();
