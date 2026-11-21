// PRIME PASS お客様アプリ（登録の引き継ぎ → ホーム → 物件 → クラフトマン → お知らせ → お問い合わせ・来場予約）
// 画像・動画は、ES CON プライムメンバーシップ サイトの素材。ログインした方だけが読める場所（Firebase Storage）から読み込む。
import {
  auth, db, authReady, call, signInWithCustomToken, collection, query, where, getDocs, doc, getDoc, $, $$, esc, fmtDate,
} from './fb.js';
import { assetKey, ENV_LABEL } from './config.js';

const app = $('#app');
const tabbar = $('#tabbar');
const S = { user: null, name: '', contact: null, memberships: [], notices: [], properties: [], assets: {}, selected: new Set(), tab: 'new', loaded: false, curProp: null, noticeFilter: 'all', last: null, deferred: null };
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.deferred = e; });
const seenKey = 'pp.seenNotices';
const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch { return new Set(); } };
const markSeen = (ids) => { const s = seen(); ids.forEach((i) => s.add(i)); localStorage.setItem(seenKey, JSON.stringify([...s])); };
const A = (k) => S.assets[k] || '';
const bg = (k) => (A(k) ? `style="background-image:url('${esc(A(k))}')"` : '');

/* ---- サイトの内容（ES CON プライムメンバーシップ サイトより） ---- */
const RELEASES = [
  { k: 'rel_ashiya', rg: '関西', nm: '（仮称）芦屋市松ノ内町プロジェクト' },
  { k: 'rel_tojinmachi', rg: '九州', nm: '（仮称）福岡市中央区唐人町プロジェクト' },
  { k: 'rel_minamiazabu', rg: '首都圏', nm: '（仮称）港区南麻布４丁目プロジェクト' },
  { k: 'rel_nishiazabu2', rg: '首都圏', nm: '(仮称)港区西麻布2丁目プロジェクト' },
  { k: 'rel_kudanminami', rg: '首都圏', nm: '(仮称)千代田区九段南１丁目プロジェクト' },
];
const CONCIERGE = [
  { k: 'pc_hayama', rg: '神奈川・葉山', nm: '葉山町堀内 海を望む邸宅', note: '非公開物件' },
  { k: 'pc_shirokane', rg: '港区・白金台', nm: 'ザ・パークハウス白金二丁目タワー', note: '非公開物件' },
  { k: 'pc_kagurazaka', rg: '新宿区・神楽坂', nm: 'ラ・トゥール神楽坂', note: '' },
];
const CRAFT = {
  mekiki: { jp: 'めきき', en: 'MEKIKI', tag: '本物を見抜く批評眼', who: ['軽井沢安東美術館　代表理事', '安東 泰志', 'ANDO YASUSHI'], copy: '芸術を通じて魂の救済を願う場所「軽井沢安東美術館」。藤田嗣治の美術館で得る癒しと力' },
  takumi: { jp: 'たくみ', en: 'TAKUMI', tag: 'ものづくりの精巧な技術', who: ['一彫堂　四代目', '堀川 正久', 'HORIKAWA MASAHISA'], copy: '西洋家具の形式に日本古来の技法を融和した軽井沢彫の匠' },
  kiwame: { jp: 'きわめ', en: 'KIWAME', tag: '極限までに研ぎ澄ますこと', who: ['ガラス工芸士', '兼次 直樹', 'KANESHI NAOKI'], copy: 'さらに進化させた創作をしていきたい' },
  kokoromi: { jp: 'こころみ', en: 'KOKOROMI', tag: '冒険的な進取の精神', who: ['首里琉染　代表', '大城 裕美', 'OOSHIRO HIROMI'], copy: '紅型の復興とサンゴ染めを併せた伝統承継への試み' },
  omotenashi: { jp: 'おもてなし', en: 'OMOTENASHI', tag: 'あたたかく迎える心', who: ['モリアソビ　代表　プランニングディレクター', '船倉 裕作', 'FUNAKURA YUSAKU'], copy: '森でのおもてなしと軽井沢暮らしのお手伝い' },
};
const CRAFT_ORDER = ['mekiki', 'takumi', 'omotenashi', 'kiwame', 'kokoromi'];
const GALLERY = [{ k: 'gal_1', t: '［中部］オストガーデン軽井沢' }, { k: 'gal_2', t: '［首都圏］グラン レ・ジェイド三宿通り' }, { k: 'gal_3', t: '［首都圏］DIAMAS 葉山' }];

const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="3" width="14" height="18"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15zM10 21h4"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14"/><path d="M3 7l9 7 9-7"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 5l7 7-7 7"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"/></svg>',
  share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16"/><path d="M12 8v8M8 12h8"/></svg>',
  dots: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  globe: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9l6 6 6-6"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3"/></svg>',
  tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/></svg>',
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
const pname = (id) => (S.properties.find((p) => p.id === id) || {}).name || id;

/* ---------- 画面の部品 ---------- */
const unreadCount = () => { const s = seen(); return S.notices.filter((n) => !s.has(n.id)).length; };
const topbar = (right = true) => `
  <div class="topbar">
    <div class="brand"><span class="mark">P</span>PRIME PASS</div>
    ${right ? `<button class="icon-btn" data-go="#/notices" aria-label="お知らせ">${ICON.bell}${unreadCount() ? '<span class="dot"></span>' : ''}</button>` : ''}
  </div>`;
const subHeader = (title, back = '#/home') => `
  <div class="topbar"><button class="icon-btn" data-go="${back}" aria-label="戻る" style="margin-left:-10px">${ICON.back}</button>
  <div style="font-family:var(--serif-jp);font-size:15px;color:var(--green)">${esc(title)}</div><div style="width:40px"></div></div>`;
const disclaimer = () => { const d = new Date(); return `<div class="notice-note">掲載内容は${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日時点の情報です。内容は予告なく変更となる場合があります。最新の情報は、公式サイトまたは販売担当者にご確認ください。<br>※${ENV_LABEL}。画像・映像は、ES CON プライムメンバーシップ サイトの素材をテストのために使用しています。</div>`; };
const secTitle = (en, jp, more = '') => `<div class="sec-title"><div><div class="en">${en}</div><div class="jp">${jp}</div></div>${more}</div>`;

function setTabs(active) {
  const items = [['#/home', 'home', 'ホーム'], ['#/collection', 'building', '物件'], ['#/notices', 'bell', 'お知らせ'], ['#/contact', 'mail', 'お問い合わせ']];
  tabbar.innerHTML = items.map(([h, i, l]) => `<a href="${h}" class="${active === h ? 'on' : ''}">${ICON[i]}<span>${l}</span></a>`).join('');
  tabbar.classList.toggle('hidden', !active);
}

/* ---------- データ ---------- */
async function loadData() {
  const uid = auth.currentUser.uid;
  const [cs, ms, as, ps] = await Promise.all([
    getDocs(query(collection(db, 'contacts'), where('cid', '==', uid))),
    getDocs(query(collection(db, 'memberships'), where('cid', '==', uid))),
    getDoc(doc(db, 'config', 'assets')).catch(() => null),
    getDocs(collection(db, 'properties')),
  ]);
  S.properties = ps.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.status !== 'archived').sort((a, b) => (a.order || 0) - (b.order || 0));
  S.name = cs.docs.length ? cs.docs[0].data().name : '';
  S.contact = cs.docs.length ? cs.docs[0].data() : null;
  S.memberships = ms.docs.map((d) => d.data());
  S.assets = {};
  if (as && as.exists()) Object.assign(S.assets, as.data().urls || {});
  const lists = await Promise.all(S.memberships.map((m) => getDocs(query(collection(db, 'notices'), where('property', '==', m.property)))));
  S.notices = lists.flatMap((l) => l.docs.map((d) => ({ id: d.id, ...d.data() })))
    .sort((a, b) => (b.publishedAt?.toMillis?.() || 0) - (a.publishedAt?.toMillis?.() || 0));
  S.loaded = true;
}

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

const copyUrl = async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('URLをコピーしました'); } catch { toast('コピーできませんでした'); } };
const stepLine = (n, t, sm, ic) => `<div class="stepline"><span class="no">${n}</span><div class="tx">${t}${sm ? `<small>${sm}</small>` : ''}</div><span class="ic">${ic}</span></div>`;

function viewInstall() {
  setTabs(null);
  const head = (en, chip) => `${topbar(false)}<div class="section" style="padding-top:20px"><p class="eyebrow">Members exclusive</p><h1 class="display">${en}</h1>${chip || ''}`;
  let html;
  if (inApp) {
    html = `${head('Getting Started')}
      <div class="banner warn" style="margin-top:16px"><b>このままでは追加できません</b><br>LINEやInstagramの中で開いているため、ホーム画面に追加できません。Safari（またはブラウザ）で開き直してください。</div>
      <h2 class="display-jp" style="margin:18px 0 6px">Safariで開き直す</h2>
      ${stepLine(1, '右下（または右上）の「…」をタップ', '表示は、アプリによって異なります', ICON.dots)}
      ${stepLine(2, '「Safariで開く」を選ぶ', 'もう一度、案内の画面が表示されます', ICON.globe)}
      <div class="stack" style="margin-top:24px"><button class="btn" id="copyBtn">このページのURLをコピー</button><button class="btn ghost" data-go="#/push">あとで追加する</button></div></div>`;
  } else if (isIOS) {
    html = `${head('Welcome Home', '<div class="timechip"><b>約30秒で完了</b>iPhone（Safari）の手順です</div>')}
      <h2 class="display-jp" style="margin:6px 0 8px">${esc(S.name)} 様、<br>ご登録ありがとうございます</h2>
      <p class="muted small">ホーム画面に追加すると、最新の情報を通知でお届けします。次の3ステップで完了します。<br>※iPhoneでは、追加したあとでないと、通知が届きません（iOS 16.4以上）。</p>
      <div style="margin-top:10px">${stepLine(1, '画面下の「共有」ボタンをタップ', '四角から上向きの矢印のボタンです', ICON.share)}${stepLine(2, '「ホーム画面に追加」を選ぶ', 'メニューを上にスクロールして探します', ICON.plus)}${stepLine(3, '右上の「追加」をタップ', 'ホーム画面にアイコンができます', ICON.check)}</div>
      <div class="stack" style="margin-top:24px"><button class="btn" data-go="#/push">追加できたら、次へ</button><button class="btn ghost" data-go="#/push">あとで追加する</button></div></div>`;
  } else if (isAndroid) {
    html = `${head('Welcome Home', '<div class="timechip"><b>約10秒で完了</b>Android（Chrome）の手順です</div>')}
      <h2 class="display-jp" style="margin:6px 0 8px">${esc(S.name)} 様、<br>ご登録ありがとうございます</h2>
      <p class="muted small">ボタンを押すだけで、ホーム画面に追加できます。</p>
      <div class="center" style="margin:22px 0"><div style="width:64px;height:64px;background:var(--gold);color:#fff;display:grid;place-items:center;margin:0 auto 8px;font-family:var(--serif-en);font-size:30px">P</div><div style="font-family:var(--serif-jp)">PRIME PASS</div><div class="xs muted">最新の情報を通知でお届けします</div></div>
      <button class="btn" id="installBtn">ホーム画面に追加</button>
      <div style="margin-top:6px">${stepLine(1, '「ホーム画面に追加」を押す', '画面の案内が表示されます', ICON.plus)}${stepLine(2, '確認の画面で「インストール」', 'これで完了です', ICON.check)}</div>
      <div class="stack" style="margin-top:20px"><button class="btn ghost" data-go="#/push">あとで追加する</button></div></div>`;
  } else {
    html = `${head('On Your Phone')}
      <h2 class="display-jp" style="margin:18px 0 8px">スマートフォンで開いてください</h2>
      <p class="muted small">PRIME PASS は、スマートフォンのホーム画面に追加してご利用いただくアプリです。</p>
      <div class="center" style="margin:20px 0"><div class="qrbox" id="qr">読み込み中…</div><div class="xs muted" style="margin-top:8px">カメラで読み取ってください</div></div>
      <div class="stack"><button class="btn" id="copyBtn">案内のURLをコピー</button><button class="btn ghost" data-go="#/push">このまま続ける</button></div></div>`;
  }
  app.innerHTML = html;
  const cb = $('#copyBtn'); if (cb) cb.addEventListener('click', copyUrl);
  const ib = $('#installBtn'); if (ib) ib.addEventListener('click', async () => { if (S.deferred) { S.deferred.prompt(); await S.deferred.userChoice.catch(() => {}); S.deferred = null; location.hash = '#/push'; } else toast('右上の「︙」メニューから「ホーム画面に追加」を選んでください'); });
  const qr = $('#qr');
  if (qr) {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    sc.onload = () => { const q = window.qrcode(0, 'M'); q.addData(location.origin + location.pathname); q.make(); qr.innerHTML = q.createSvgTag(5); };
    sc.onerror = () => { qr.textContent = location.origin + location.pathname; };
    document.head.appendChild(sc);
  }
}

function viewPush() {
  setTabs(null);
  const granted = 'Notification' in window && Notification.permission === 'granted';
  app.innerHTML = `${topbar(false)}
  <div class="section" style="padding-top:20px"><p class="eyebrow">Members exclusive</p><h1 class="display">Stay in the Know</h1>
    <div style="color:var(--gold);margin:22px 0 6px"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15zM10 21h4"/></svg></div>
    <h2 class="display-jp" style="margin-bottom:14px">新着情報を通知でお知らせします</h2>
    <div class="benefit"><span class="ic">${ICON.building}</span><div><b>新しい物件・限定情報</b><span>公開されたばかりの情報をお知らせ</span></div></div>
    <div class="benefit"><span class="ic">${ICON.tag}</span><div><b>販売状況の更新</b><span>最新の状況をお伝えします</span></div></div>
    <div class="benefit"><span class="ic">${ICON.mail}</span><div><b>担当者からのご案内</b><span>お客様宛の資料やご連絡</span></div></div>
    <hr class="hr"><p class="xs muted">通知はいつでも設定から変更できます。iPhoneでは、ホーム画面から開いたときに受け取れます。</p>
    <div class="stack" style="margin-top:22px"><button class="btn" id="pushOk">${granted ? 'ホームへ進む' : '通知を受け取る'}</button>${granted ? '' : '<button class="btn ghost" data-go="#/home">あとで</button>'}</div></div>`;
  $('#pushOk').addEventListener('click', async () => { if (!granted) await enablePush(true); location.hash = '#/home'; });
}

function noticeRow(n, s) {
  return `<a class="nrow" href="#/notice/${esc(n.id)}"><div class="meta"><span class="tag">${esc(pname(n.property))}</span><span>${fmtDate(n.publishedAt)}</span>${s.has(n.id) ? '' : '<span class="reddot"></span>'}</div><div class="t">${esc(n.title)}</div></a>`;
}
const selectorBtn = (label) => `<button class="selector" id="pageSel">${esc(label)}<span style="width:12px;display:inline-block">${ICON.down}</span></button>`;
function openSheet(cur) {
  const reg = new Set(S.memberships.map((m) => m.property));
  const el = document.createElement('div'); el.className = 'sheet-bg';
  el.innerHTML = `<div class="sheet"><div class="grab"></div><div class="h2 center" style="margin-bottom:2px">表示するページを選ぶ</div><p class="xs muted center" style="margin:0">同じご登録で、複数のページを切り替えて見られます。</p>
    <a class="opt ${cur === 'prime' ? 'on' : ''}" href="#/prime"><div style="flex:1"><div style="font-weight:500">エスコン プライム　<span class="tag dark">会員</span></div><div class="xs muted">会員向けページ</div></div>${cur === 'prime' ? ICON.check : ''}</a>
    ${S.properties.map((p) => reg.has(p.id) ? `<a class="opt ${cur === p.id ? 'on' : ''}" href="#/p/${esc(p.id)}"><div style="flex:1"><div style="font-weight:500">${esc(p.name)}　<span class="tag gold">エントリー済み</span></div><div class="xs muted">この物件の限定ページ</div></div>${cur === p.id ? ICON.check : ''}</a>` : `<div class="opt" style="opacity:.55"><div style="flex:1"><div style="font-weight:500">${esc(p.name)}　<span class="tag">未登録</span></div><div class="xs muted">登録フォームからご登録いただくと、見られます</div></div></div>`).join('')}</div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('a')) el.remove(); });
}

function viewHome() {
  setTabs('#/home'); S.curProp = null;
  const s = seen();
  const latest = S.notices.slice(0, 2);
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:0">
    <p class="eyebrow">Members exclusive</p>
    <h1 class="display">Members’ Journal</h1>
    ${selectorBtn('エスコン プライム')}
  </div>
  <div class="frame-hero" ${bg('hero')}>
    <div class="k">MEMBERS EXCLUSIVE</div>
    <div class="name">${esc(S.name || 'お客様')} 様</div>
    <div class="sub">ご登録ありがとうございます。会員さま向けの最新情報を、お届けします。</div>
  </div>
  <div class="section">
    ${secTitle('News', '新着のお知らせ', '<a href="#/notices" class="xs muted" style="text-decoration:none">すべて見る</a>')}
    ${latest.length ? latest.map((n) => noticeRow(n, s)).join('') : '<div class="muted small">お知らせは、まだありません</div>'}
    <h2 class="h2" style="margin-top:26px">プライムサイト</h2>
    <div class="quick">
      <a href="#/collection">${ICON.building}物件情報</a>
      <a href="#/prime">${ICON.home}プライム</a>
      <a href="#/collection" data-used="1">${ICON.key}中古</a>
      <a href="#/contact">${ICON.mail}ご相談</a>
    </div>
    <div id="pushbox" style="margin-top:26px"></div>
    <div style="margin-top:18px"><a class="xs muted" href="#/settings">設定（ご登録情報・通知）</a></div>
    ${disclaimer()}
  </div>`;
  $('#pageSel').addEventListener('click', () => openSheet('prime'));
  $$('[data-used]').forEach((a) => a.addEventListener('click', () => { S.tab = 'used'; }));
  $$('.quick a:not([data-used])').forEach((a) => a.addEventListener('click', () => { S.tab = 'new'; }));
  renderPushBox();
}

function viewPrime() {
  setTabs('#/home'); S.curProp = null;
  app.innerHTML = `${subHeader('エスコン プライム', '#/home')}
  <div class="pagenote">掲載内容は、ES CON プライムメンバーシップ サイトに準じています（テスト用の表示）</div>
  <div class="frame-hero" style="height:340px" ${bg('hero')}><div class="k">IDEAL to REAL</div><div class="name">暮らしの、その先へ。</div></div>
  <div class="slogan"><p class="jp">この国の技術を未来へ継承し、<br>次世代の暮らしに新たな価値を。</p><p class="en">Heritage and the spirit of Craftsmanship</p></div>
  <div class="section">
    <p class="eyebrow" style="margin-top:6px">Brand story</p>
    <h2 class="display-jp" style="font-size:19px">私たちが大切にしていること</h2>
    <p class="muted small" style="margin-top:10px">私たちのつくるものに、ひとつとして、同じ家はない。住まう人の幸せを思い描き、その歓びが、次代まで輝き続けるために。私たちは、挑戦する。一人ひとりの個性でつくる、本物のプレステージへ。</p>
    ${secTitle('Craftsmanship', '継承される5つの真髄')}
    <div class="hscroll">${CRAFT_ORDER.map((k) => `<a class="craft-tile" href="#/craft/${k}"><div class="im" ${bg('slide_' + k)}></div><div class="bd"><div class="en">${CRAFT[k].en}</div><div class="jp">${CRAFT[k].jp}</div><div class="tg">${CRAFT[k].tag}</div></div></a>`).join('')}</div>
    ${secTitle('New Releases', '新規取得事業用地の情報')}
    <div class="hscroll">${RELEASES.map((r) => `<div class="tile"><div class="im tall" ${bg(r.k)}></div><div class="rg">${r.rg}</div><div class="nm">${esc(r.nm)}</div></div>`).join('')}</div>
    ${secTitle('Exclusive Residences', '次代まで輝き続けるために', '<a href="#/collection" class="xs muted" style="text-decoration:none">すべて見る</a>')}
    <div class="hscroll">${S.properties.map((p) => `<a class="tile" href="#/collection"><div class="im" ${bg(assetKey(p.id))}>${S.memberships.some((m) => m.property === p.id) ? '<span class="tag gold nw">ご登録済み</span>' : ''}</div><div class="rg">${esc(p.region || '')}</div><div class="nm">${esc(p.name)}</div></a>`).join('')}</div>
    ${secTitle('Prime Concierge', '中古物件のご紹介')}
    <div class="hscroll">${CONCIERGE.map((r) => `<div class="tile"><div class="im" ${bg(r.k)}></div><div class="rg">［${r.rg}］${r.note ? '　' + r.note : ''}</div><div class="nm">${esc(r.nm)}</div></div>`).join('')}</div>
    <div style="margin-top:14px"><button class="btn ghost" data-go="#/contact">プライムコンシェルジュに相談する</button></div>
    ${secTitle('Gallery', 'ギャラリー')}
    <div class="gal">${GALLERY.map((g) => `<div><div class="im" ${bg(g.k)}></div><div class="cap">${esc(g.t)}</div></div>`).join('')}</div>
    ${disclaimer()}
  </div>`;
}

function viewProperty(id, sub) {
  const p = S.properties.find((x) => x.id === id);
  const reg = S.memberships.some((m) => m.property === id);
  if (!p || !reg) { setTabs('#/home'); app.innerHTML = `${subHeader('限定ページ', '#/home')}<div class="section"><div class="banner">この物件は、まだご登録がありません。登録フォームからご登録いただくと、限定ページをご覧いただけます。</div><a class="btn" href="form/">登録フォームへ</a></div>`; return; }
  S.curProp = id;
  tabbar.innerHTML = `<a href="${esc(p.url || '#')}" target="_blank" rel="noopener">${ICON.globe}<span>公式HP</span></a><a href="#/p/${esc(id)}" class="on">${ICON.building}<span>概要</span></a><a href="#/contact">${ICON.mail}<span>お問い合わせ</span></a><a href="#/visit">${ICON.bell}<span>来場予約</span></a>`;
  tabbar.classList.remove('hidden');
  const s = seen(); const mine = S.notices.filter((n) => n.property === id);
  const chips = `<div class="tabchips"><a href="#/p/${esc(id)}" class="${!sub ? 'on' : ''}">インフォメーション</a><a href="#/p/${esc(id)}/plans" class="${sub === 'plans' ? 'on' : ''}">限定間取り</a><a href="#/p/${esc(id)}/gallery" class="${sub === 'gallery' ? 'on' : ''}">CG・ムービー</a></div>`;
  let body;
  if (sub === 'plans') {
    body = `<p class="eyebrow">Members exclusive</p><h1 class="display">Plans for Living</h1>
      <div class="note-info" style="margin-top:14px">販売状況は、${new Date().getFullYear()}年${new Date().getMonth() + 1}月${new Date().getDate()}日時点の情報です（公式サイトに準じて自動更新）。<br>※この画面の間取り・販売状況は、サンプル表示です。</div>
      ${[['Aタイプ', '72.5㎡　3LDK', '販売中', 'ok'], ['Bタイプ', '85.2㎡　3LDK+S', '商談中', 'hold'], ['Cタイプ', '98.0㎡　4LDK', '契約済', 'done']].map(([n, sp, st, c]) => `<div class="plan"><div class="ph">PLAN</div><div><div class="nm">${n}</div><div class="sp">${sp}</div></div><div class="st ${c}">${st}</div></div>`).join('')}
      <div class="note-info" style="margin-top:18px">間取り図は、計画段階のものです。家具・設備は、販売価格に含まれない場合があります。</div>`;
  } else if (sub === 'gallery') {
    body = `<p class="eyebrow">Members exclusive</p><h1 class="display">A Closer Look</h1>
      <div style="margin:16px -22px 0;height:240px;background:#cfc8b8 center/cover no-repeat;${A(assetKey(id)) ? `background-image:url('${esc(A(assetKey(id)))}')` : ''}"></div>
      <h2 class="h2" style="margin-top:16px">外観・エントランス CG</h2>
      <div class="gal">${GALLERY.map((g) => `<div class="im" ${bg(g.k)}></div>`).join('')}</div>
      <div class="note-info">掲載のCG・映像は、計画段階の図面等に基づいて描いたもので、実際とは異なります。<br>※この画面の画像は、サンプル表示です。</div>`;
  } else {
    body = `<p class="eyebrow">Members exclusive</p><h1 class="display">Private Residence</h1>
      <div class="frame-hero" style="margin:16px 0 0;height:300px;background-image:url('${esc(A(assetKey(id)))}')"><div class="k">会員限定</div><div class="name" style="font-size:20px">${esc(mine[0] ? mine[0].title : p.name)}</div><div class="sub">${mine[0] ? fmtDate(mine[0].publishedAt) + ' 時点' : ''}</div></div>
      <h2 class="h2" style="margin-top:24px">お知らせ</h2>
      ${mine.length ? mine.map((n) => noticeRow(n, s)).join('') : '<div class="muted small">お知らせは、まだありません</div>'}
      ${disclaimer()}`;
  }
  app.innerHTML = `<div class="topbar"><div><div style="font-family:var(--serif-jp);font-size:16px;color:var(--green);line-height:1.3">${esc(p.name)}</div><div class="xs" style="color:var(--gold)">限定ページ</div></div><button class="icon-btn" data-go="#/notices" aria-label="お知らせ">${ICON.bell}</button></div>
  <div class="section" style="padding-top:4px">${chips}${body}<div style="margin-top:14px"><button class="selector" id="pageSel2">他のページへ切り替える</button></div></div>`;
  $('#pageSel2').addEventListener('click', () => openSheet(id));
}

function viewCollection() {
  setTabs('#/collection');
  const isNew = S.tab === 'new';
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:6px">
    <p class="eyebrow">Members exclusive</p>
    <h1 class="display">The Collection</h1>
    <div class="seg"><button data-tab="new" class="${isNew ? 'on' : ''}">新築</button><button data-tab="used" class="${isNew ? '' : 'on'}">中古</button></div>
    <p class="muted small" style="margin:0 0 14px">${isNew ? '気になる物件を選んで、まとめてご相談いただけます。' : 'ES CON Prime Concierge が、ご要望に沿った中古物件をご紹介します。未公開物件も多数ございます。'}</p>
  </div>
  <div class="section">
    ${isNew ? S.properties.map((p) => `<div class="prop">
      <div class="art" style="${A(assetKey(p.id)) ? `background-image:url('${esc(A(assetKey(p.id)))}')` : ''}"><span class="rgn">${p.region}</span><div class="check ${S.selected.has(p.id) ? 'on' : ''}" data-check="${p.id}">${S.selected.has(p.id) ? ICON.check : ''}</div></div>
      <div class="ttl">${esc(p.name)}</div>
      <div class="xs muted">${esc(p.area)}</div>
      <div class="linkrow">${S.memberships.some((m) => m.property === p.id) ? '<span class="tag gold">ご登録済み</span>' : ''}<a href="${esc(p.url)}" target="_blank" rel="noopener">公式サイトを見る ↗</a></div>
    </div>`).join('') + `<div class="xs muted" style="margin-bottom:10px">${S.selected.size}件を選択中　名前・電話は、登録済みのため、入力不要です</div><button class="btn" id="consultBtn" ${S.selected.size ? '' : 'disabled'}>まとめて相談する</button>`
      : CONCIERGE.map((r) => `<div class="prop"><div class="art" style="background-image:url('${esc(A(r.k))}')"><span class="rgn">${esc(r.rg)}</span></div><div class="ttl">${esc(r.nm)}</div><div class="xs muted">${esc(r.note || '')}</div></div>`).join('') + '<button class="btn" data-go="#/contact">プライムコンシェルジュに相談する</button>'}
    ${disclaimer()}
  </div>`;
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; viewCollection(); }));
  $$('[data-check]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation(); const p = el.dataset.check; S.selected.has(p) ? S.selected.delete(p) : S.selected.add(p); viewCollection();
  }));
  const cb = $('#consultBtn'); if (cb) cb.addEventListener('click', () => { location.hash = '#/contact'; });
}

function viewCraft(k) {
  const c = CRAFT[k]; if (!c) return viewHome();
  setTabs('#/home');
  app.innerHTML = `${subHeader('Craftsmanship', '#/prime')}
  <div class="section" style="padding-top:0">
    <p class="eyebrow">${c.en}</p>
    <h1 class="display-jp">${c.jp}　<span style="font-size:14px;color:var(--muted)">${c.tag}</span></h1>
    <div style="margin:16px -22px 0">${A('video_' + k) ? `<video class="vid" src="${esc(A('video_' + k))}" poster="${esc(A('poster_' + k))}" controls playsinline preload="metadata"></video>` : `<div class="vid" ${bg('poster_' + k)}></div>`}</div>
    <div class="person"><div class="ph" ${bg('poster_' + k)}></div><div><div class="xs muted">${esc(c.who[0])}</div><div style="font-family:var(--serif-jp);font-size:18px;color:var(--green)">${esc(c.who[1])}</div><div class="xs" style="letter-spacing:.1em;color:var(--gold)">${esc(c.who[2])}</div></div></div>
    <p style="font-family:var(--serif-jp);font-size:16px;line-height:1.9;color:var(--green)">${esc(c.copy)}</p>
    <p class="xs muted" style="margin-top:14px">※掲載のクラフトマンの映像は、2024年8月に撮影したものです。</p>
    <div style="margin-top:20px"><button class="btn ghost" data-go="#/prime">エスコン プライムへ戻る</button></div>
    ${disclaimer()}
  </div>`;
}

function viewNotices() {
  setTabs('#/notices'); S.curProp = null;
  const s = seen();
  const regs = S.memberships.map((m) => m.property);
  const list = S.noticeFilter === 'all' ? S.notices : S.notices.filter((n) => n.property === S.noticeFilter);
  app.innerHTML = `<div class="topbar"><div class="brand" style="font-family:var(--serif-jp);letter-spacing:.04em;font-size:15px">お知らせ</div><button class="icon-btn" data-go="#/settings" aria-label="設定">${ICON.gear}</button></div>
  <div class="section" style="padding-bottom:6px"><p class="eyebrow">Members exclusive</p><h1 class="display">Letters to Members</h1>
    <div class="chips" id="nf" style="margin-top:14px"><button class="chip ${S.noticeFilter === 'all' ? 'on' : ''}" data-v="all">すべて</button>${regs.map((p) => `<button class="chip ${S.noticeFilter === p ? 'on' : ''}" data-v="${esc(p)}">${esc(pname(p))}</button>`).join('')}</div>
  </div>
  <div class="section">${list.length ? list.map((n) => noticeRow(n, s)).join('') : '<div class="muted small">お知らせは、まだありません</div>'}${disclaimer()}</div>`;
  $$('#nf .chip').forEach((b) => b.addEventListener('click', () => { S.noticeFilter = b.dataset.v; viewNotices(); }));
}

function viewNotice(id) {
  setTabs('#/notices');
  const n = S.notices.find((x) => x.id === id);
  if (!n) { location.hash = '#/notices'; return; }
  markSeen([id]); call('logEvent')({ type: 'notice_open' }).catch(() => {});
  const d = n.publishedAt && n.publishedAt.toDate ? n.publishedAt.toDate() : new Date();
  app.innerHTML = `${subHeader('お知らせ', '#/notices')}
  <div class="section" style="padding-top:0"><p class="eyebrow">Members exclusive</p><h1 class="display">Member Letter</h1>
    <div class="meta" style="display:flex;gap:8px;align-items:center;margin:16px 0 10px"><span class="tag">${esc(pname(n.property))}</span><span class="xs muted">${fmtDate(n.publishedAt)}</span></div>
    <h2 class="display-jp" style="font-size:19px;line-height:1.6">${esc(n.title)}</h2>
    <div style="margin:16px 0;height:200px;background:#cfc8b8 center/cover no-repeat;${A(assetKey(n.property)) ? `background-image:url('${esc(A(assetKey(n.property)))}')` : ''}"></div>
    <p style="font-size:13px;line-height:1.9">${esc(n.body)}</p>
    <div class="note-info">この内容は${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日時点の情報です。販売状況は変更となる場合があります。最新は公式サイトでご確認ください。</div>
    <button class="btn" id="askBtn">この件について相談する</button>
    <div style="margin-top:12px"><button class="btn ghost" data-go="#/notices">一覧へ戻る</button></div>
  </div>`;
  $('#askBtn').addEventListener('click', () => { S.selected = new Set([n.property]); location.hash = '#/contact'; });
}

function viewThanks() {
  setTabs(null);
  const L = S.last || { props: [], method: '', slot: '', at: new Date(), kind: 'inquiry' };
  const mm = { tel: '電話', mail: 'メール' }; const ss = { am: '午前', pm: '午後', eve: '夕方', any: 'いつでも' };
  const fmt = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  app.innerHTML = `${topbar(false)}<div class="section" style="padding-top:20px"><p class="eyebrow">Members exclusive</p><h1 class="display">Thank You</h1>
    <div class="thanks-box">${ICON.check.replace('width="14" height="14"', 'width="26" height="26"')}</div>
    <h2 class="display-jp" style="margin-bottom:8px">${L.kind === 'visit' ? '来場予約を受け付けました' : 'お問い合わせを受け付けました'}</h2>
    <p class="muted small">担当者から、ご希望の方法でご連絡いたします。</p>
    <div style="margin:18px 0">${L.props.length ? `<div class="kv"><span>${L.kind === 'visit' ? '予約した物件' : '相談した物件'}</span><span style="text-align:right">${L.props.map(esc).join(' / ')}</span></div>` : ''}${L.kind === 'visit' ? `<div class="kv"><span>ご希望の日時</span><span>${esc(L.date || '')}　${esc(L.slot || '')}</span></div>` : `<div class="kv"><span>折り返し</span><span>${esc(mm[L.method] || '')}（${esc(ss[L.slot] || '')}）</span></div>`}<div class="kv"><span>受付日時</span><span>${fmt(L.at)}</span></div></div>
    <button class="btn" data-go="#/home">ホームへ戻る</button></div>`;
}

const mask = {
  email: (e) => { const [a, b] = String(e || '').split('@'); return b ? `${a.slice(0, 2)}****@${b}` : '—'; },
  phone: (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : '—'; },
};
function viewSettings() {
  setTabs('#/home');
  const c = S.contact || {};
  const supported = 'Notification' in window;
  const on = supported && Notification.permission === 'granted';
  app.innerHTML = `${subHeader('設定', '#/home')}<div class="section" style="padding-top:0"><p class="eyebrow">Members exclusive</p><h1 class="display">Your Membership</h1>
    <h2 class="h2" style="margin-top:20px">ご登録情報</h2>
    <div class="kv"><span>お名前</span><span>${esc(c.name || '')}</span></div><div class="kv"><span>メールアドレス</span><span>${esc(mask.email(c.email))}</span></div><div class="kv"><span>電話番号</span><span>${esc(mask.phone(c.phone))}</span></div>
    <p class="xs muted" style="margin-top:8px">変更は、担当者へのご連絡で承ります。</p>
    <h2 class="h2" style="margin-top:24px">通知</h2>
    <div class="setrow" id="pushRow"><div class="tx">プッシュ通知<small>新着・販売状況・ご案内</small></div><button class="switch ${on ? 'on' : ''}" id="pushSw" aria-label="プッシュ通知"></button></div>
    <div id="pushBox2"></div>
    <h2 class="h2" style="margin-top:24px">その他</h2>
    <div class="setrow" data-todo="利用規約">${'<div class="tx">利用規約</div>'}<span class="muted">${ICON.chev}</span></div>
    <div class="setrow" data-todo="プライバシーポリシー"><div class="tx">プライバシーポリシー</div><span class="muted">${ICON.chev}</span></div>
    <div class="setrow" id="delReq"><div class="tx" style="color:var(--danger)">登録情報の削除を依頼する</div><span class="muted">${ICON.chev}</span></div>
    <div id="setRes" style="margin-top:12px"></div>
    ${disclaimer()}</div>`;
  $('#pushSw').addEventListener('click', async () => {
    if (!supported || (isIOS && !isStandalone())) { $('#pushBox2').innerHTML = `<div class="banner warn">${isIOS ? 'iPhoneでは、ホーム画面に追加したあとに、オンにできます。' : 'このブラウザでは、通知を利用できません。'}</div>`; return; }
    if (Notification.permission === 'denied') { $('#pushBox2').innerHTML = '<div class="banner warn">通知がブロックされています。端末の設定から、許可してください。</div>'; return; }
    if (on) { $('#pushBox2').innerHTML = '<div class="banner">通知をオフにするには、端末の設定（通知）から変更してください。</div>'; return; }
    await enablePush(false); viewSettings();
  });
  $$('[data-todo]').forEach((r) => r.addEventListener('click', () => toast(`${r.dataset.todo}は、テスト環境のため、準備中です`)));
  $('#delReq').addEventListener('click', async () => {
    if (!confirm('登録情報の削除を依頼します。担当者が確認のうえ、ご連絡します。よろしいですか？')) return;
    try { await call('submitInquiry')({ properties: [S.memberships[0]?.property], kind: 'inquiry', message: '登録情報の削除を依頼します。', contactMethod: 'mail', timeSlot: 'any' }); $('#setRes').innerHTML = '<div class="banner ok">削除の依頼を受け付けました。担当者から、ご連絡します。</div>'; }
    catch (e) { $('#setRes').innerHTML = `<div class="banner err">送信できませんでした：${esc(e.message)}</div>`; }
  });
}

function viewContact() {
  setTabs('#/contact');
  const sel = new Set(S.selected.size ? S.selected : (S.curProp ? [S.curProp] : S.memberships.slice(0, 1).map((m) => m.property)));
  let method = 'tel'; let slot = 'pm';
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:6px"><p class="eyebrow">Members exclusive</p><h1 class="display">At Your Service</h1></div>
  <div class="section">
    <div class="banner">${esc(S.name)} 様<br><span class="muted xs">ご登録の電話・メールを使います（再入力は不要です）</span></div>
    <h2 class="h2">相談したい物件（複数選べます）</h2>
    <div class="list" id="propList">${S.properties.map((p) => `<div class="list-item" data-p="${p.id}"><span class="tag ${sel.has(p.id) ? 'dark' : ''}" data-mark style="min-width:22px;text-align:center">${sel.has(p.id) ? '✓' : '　'}</span><div class="t">${esc(p.name)}</div><span class="tag" style="margin-left:auto">新築</span></div>`).join('')}</div>
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
      S.last = { kind: 'inquiry', props: [...sel].map(pname), method, slot, at: new Date() };
      S.selected.clear(); location.hash = '#/thanks';
    } catch (err) { $('#res').innerHTML = `<div class="banner err">送信できませんでした：${esc(err.message)}</div>`; e.target.disabled = false; }
  });
}

function viewVisit() {
  setTabs('#/contact');
  const mine = S.memberships.map((m) => m.property);
  const prop = S.curProp || mine[0] || (S.properties[0] || {}).id; let date = ''; let slot = '11:30';
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + 1);
  const y = base.getFullYear(); const m = base.getMonth();
  const first = new Date(y, m, 1).getDay(); const days = new Date(y, m + 1, 0).getDate();
  app.innerHTML = `${subHeader('来場予約', '#/home')}
  <div class="section" style="padding-top:0"><p class="eyebrow">Members exclusive</p><h1 class="display">Your Invitation</h1>
    <div class="field" style="margin-top:18px"><label>会場・物件</label><select class="input" id="vp">${S.properties.map((p) => `<option value="${p.id}" ${p.id === prop ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="card"><div class="center" style="font-weight:500;margin-bottom:8px">${y}年${m + 1}月</div>
      <div class="calendar">${['日', '月', '火', '水', '木', '金', '土'].map((d) => `<div class="dow">${d}</div>`).join('')}${'<div></div>'.repeat(first)}${Array.from({ length: days }, (_, i) => { const d = i + 1; const dw = new Date(y, m, d).getDay(); return `<button data-d="${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}" ${dw === 3 ? 'disabled' : ''}>${d}</button>`; }).join('')}</div></div>
    <h2 class="h2" style="margin-top:20px">ご希望の時間</h2>
    <div class="chips" id="vs">${['10:00', '11:30', '14:00', '15:30'].map((t) => `<button class="chip ${t === slot ? 'on' : ''}" data-v="${t}">${t}</button>`).join('')}</div>
    <div class="field" style="margin-top:18px"><label>ご来場人数</label><select class="input" id="vg">${[1, 2, 3, 4, 5].map((n) => `<option ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <button class="btn" id="vsend" disabled>この内容で予約する</button><div id="vres" style="margin-top:14px"></div>
  </div>`;
  $$('.calendar button').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; $$('.calendar button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); date = b.dataset.d; $('#vsend').disabled = false; }));
  $$('#vs .chip').forEach((b) => b.addEventListener('click', () => { $$('#vs .chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); slot = b.dataset.v; }));
  $('#vsend').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await call('submitInquiry')({ properties: [$('#vp').value], kind: 'visit', visitDate: date, timeSlot: slot, guests: Number($('#vg').value), contactMethod: 'tel' });
      S.last = { kind: 'visit', props: [pname($('#vp').value)], date, slot, at: new Date() }; location.hash = '#/thanks';
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
  let m;
  if ((m = r.match(/^#\/craft\/(\w+)$/))) viewCraft(m[1]);
  else if ((m = r.match(/^#\/notice\/([\w-]+)$/))) viewNotice(m[1]);
  else if ((m = r.match(/^#\/p\/([\w-]+)(?:\/(plans|gallery))?$/))) viewProperty(m[1], m[2]);
  else ({ '#/home': viewHome, '#/prime': viewPrime, '#/collection': viewCollection, '#/notices': viewNotices, '#/contact': viewContact, '#/visit': viewVisit, '#/install': viewInstall, '#/push': viewPush, '#/thanks': viewThanks, '#/settings': viewSettings }[r] || viewHome)();
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
