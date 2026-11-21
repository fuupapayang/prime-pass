// PRIME PASS お客様アプリ（登録の引き継ぎ → ホーム → 物件 → クラフトマン → お知らせ → お問い合わせ・来場予約）
// 画像・動画は、ES CON プライムメンバーシップ サイトの素材。ログインした方だけが読める場所（Firebase Storage）から読み込む。
import {
  auth, db, authReady, call, signInWithCustomToken, collection, query, where, getDocs, doc, getDoc, $, $$, esc, fmtDate,
} from './fb.js';
import { PROPERTIES, PROPERTY_NAMES, assetKey, ENV_LABEL } from './config.js';

const app = $('#app');
const tabbar = $('#tabbar');
const S = { user: null, name: '', memberships: [], notices: [], assets: {}, selected: new Set(), tab: 'new', loaded: false };
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
const pname = (id) => PROPERTY_NAMES[id] || id;

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
  const [cs, ms, as] = await Promise.all([
    getDocs(query(collection(db, 'contacts'), where('cid', '==', uid))),
    getDocs(query(collection(db, 'memberships'), where('cid', '==', uid))),
    getDoc(doc(db, 'config', 'assets')).catch(() => null),
  ]);
  S.name = cs.docs.length ? cs.docs[0].data().name : '';
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

function noticeRow(n, s) {
  return `<div class="list-item" data-go="#/notices">
    ${s.has(n.id) ? '<span style="width:7px;flex:none"></span>' : '<span class="reddot"></span>'}
    <div><div class="t">${esc(n.title)}</div><div class="d">${esc(pname(n.property))}　${fmtDate(n.publishedAt)}</div></div>
    <span class="chev">${ICON.chev}</span></div>`;
}

function viewHome() {
  setTabs('#/home');
  const s = seen();
  const latest = S.notices.slice(0, 3);
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:12px">
    <p class="eyebrow">Members exclusive</p>
    <h1 class="display">Members’ Journal</h1>
  </div>
  <div class="hero-img" ${bg('hero')}>
    <div class="k">MEMBERS EXCLUSIVE</div>
    <div class="name">${esc(S.name || 'お客様')} 様</div>
    <div class="sub">ご登録ありがとうございます。会員さま向けの最新情報を、お届けします。</div>
  </div>
  <div class="slogan">
    <p class="jp">この国の技術を未来へ継承し、<br>次世代の暮らしに新たな価値を。</p>
    <p class="en">Heritage and the spirit of Craftsmanship</p>
  </div>
  <div class="section">
    ${secTitle('News', '新着のお知らせ', '<a href="#/notices" class="xs muted" style="text-decoration:none">すべて見る</a>')}
    <div class="list">${latest.length ? latest.map((n) => noticeRow(n, s)).join('') : '<div class="list-item"><div class="d">お知らせは、まだありません</div></div>'}</div>
    <div class="chips" style="margin-top:12px">${S.memberships.map((m) => `<span class="tag dark">${esc(pname(m.property))}</span>`).join('')}</div>

    ${secTitle('New Releases', '新規取得事業用地の情報')}
    <div class="hscroll">${RELEASES.map((r) => `<div class="tile"><div class="im tall" ${bg(r.k)}></div><div class="rg">${r.rg}</div><div class="nm">${esc(r.nm)}</div></div>`).join('')}</div>

    ${secTitle('Exclusive Residences', '次代まで輝き続けるために', '<a href="#/collection" class="xs muted" style="text-decoration:none">すべて見る</a>')}
    <div class="hscroll">${PROPERTIES.map((p) => `<a class="tile" href="#/collection"><div class="im" ${bg(assetKey(p.id))}>${S.memberships.some((m) => m.property === p.id) ? '<span class="tag gold nw">ご登録済み</span>' : ''}</div><div class="rg">${p.region}</div><div class="nm">${esc(p.name)}</div></a>`).join('')}</div>

    ${secTitle('Craftsmanship', '継承される5つの真髄')}
    <div class="hscroll">${CRAFT_ORDER.map((k) => `<a class="craft-tile" href="#/craft/${k}"><div class="im" ${bg('slide_' + k)}></div><div class="bd"><div class="en">${CRAFT[k].en}</div><div class="jp">${CRAFT[k].jp}</div><div class="tg">${CRAFT[k].tag}</div></div></a>`).join('')}</div>

    ${secTitle('Prime Concierge', '中古物件のご紹介')}
    <div class="hscroll">${CONCIERGE.map((r) => `<div class="tile"><div class="im" ${bg(r.k)}></div><div class="rg">［${r.rg}］${r.note ? '　' + r.note : ''}</div><div class="nm">${esc(r.nm)}</div></div>`).join('')}</div>
    <div style="margin-top:14px"><button class="btn ghost" data-go="#/contact">プライムコンシェルジュに相談する</button></div>

    ${secTitle('Gallery', 'ギャラリー')}
    <div class="gal">${GALLERY.map((g) => `<div><div class="im" ${bg(g.k)}></div><div class="cap">${esc(g.t)}</div></div>`).join('')}</div>

    <div id="pushbox" style="margin-top:30px"></div>
    <div class="stack" style="margin-top:22px">
      <button class="btn" data-go="#/visit">来場を予約する</button>
      <button class="btn ghost" data-go="#/contact">担当者に相談する</button>
    </div>
    ${disclaimer()}
  </div>`;
  renderPushBox();
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
    ${isNew ? PROPERTIES.map((p) => `<div class="prop">
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
  app.innerHTML = `${subHeader('Craftsmanship', '#/home')}
  <div class="section" style="padding-top:0">
    <p class="eyebrow">${c.en}</p>
    <h1 class="display-jp">${c.jp}　<span style="font-size:14px;color:var(--muted)">${c.tag}</span></h1>
    <div style="margin:16px -22px 0">${A('video_' + k) ? `<video class="vid" src="${esc(A('video_' + k))}" poster="${esc(A('poster_' + k))}" controls playsinline preload="metadata"></video>` : `<div class="vid" ${bg('poster_' + k)}></div>`}</div>
    <div class="person"><div class="ph" ${bg('poster_' + k)}></div><div><div class="xs muted">${esc(c.who[0])}</div><div style="font-family:var(--serif-jp);font-size:18px;color:var(--green)">${esc(c.who[1])}</div><div class="xs" style="letter-spacing:.1em;color:var(--gold)">${esc(c.who[2])}</div></div></div>
    <p style="font-family:var(--serif-jp);font-size:16px;line-height:1.9;color:var(--green)">${esc(c.copy)}</p>
    <p class="xs muted" style="margin-top:14px">※掲載のクラフトマンの映像は、2024年8月に撮影したものです。</p>
    <div style="margin-top:20px"><button class="btn ghost" data-go="#/home">ホームへ戻る</button></div>
    ${disclaimer()}
  </div>`;
}

function viewNotices() {
  setTabs('#/notices');
  const s = seen();
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:6px"><p class="eyebrow">Members exclusive</p><h1 class="display">Notices</h1></div>
  <div class="section"><div class="list">
    ${S.notices.length ? S.notices.map((n) => `<div class="list-item" data-nid="${n.id}" style="flex-wrap:wrap">
      ${s.has(n.id) ? '<span style="width:7px;flex:none"></span>' : '<span class="reddot"></span>'}
      <div style="flex:1"><div class="t">${esc(n.title)}</div><div class="d">${esc(pname(n.property))}　${fmtDate(n.publishedAt)}</div>
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
  const sel = new Set(S.selected.size ? S.selected : S.memberships.slice(0, 1).map((m) => m.property));
  let method = 'tel'; let slot = 'pm';
  app.innerHTML = `${topbar()}
  <div class="section" style="padding-bottom:6px"><p class="eyebrow">Members exclusive</p><h1 class="display">At Your Service</h1></div>
  <div class="section">
    <div class="banner">${esc(S.name)} 様<br><span class="muted xs">ご登録の電話・メールを使います（再入力は不要です）</span></div>
    <h2 class="h2">相談したい物件（複数選べます）</h2>
    <div class="list" id="propList">${PROPERTIES.map((p) => `<div class="list-item" data-p="${p.id}"><span class="tag ${sel.has(p.id) ? 'dark' : ''}" data-mark style="min-width:22px;text-align:center">${sel.has(p.id) ? '✓' : '　'}</span><div class="t">${esc(p.name)}</div><span class="tag" style="margin-left:auto">新築</span></div>`).join('')}</div>
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
  const prop = mine[0] || PROPERTIES[0].id; let date = ''; let slot = '11:30';
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + 1);
  const y = base.getFullYear(); const m = base.getMonth();
  const first = new Date(y, m, 1).getDay(); const days = new Date(y, m + 1, 0).getDate();
  app.innerHTML = `${subHeader('来場予約', '#/home')}
  <div class="section" style="padding-top:0"><p class="eyebrow">Members exclusive</p><h1 class="display">Your Invitation</h1>
    <div class="field" style="margin-top:18px"><label>物件</label><select class="input" id="vp">${PROPERTIES.map((p) => `<option value="${p.id}" ${p.id === prop ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
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
  const mc = r.match(/^#\/craft\/(\w+)$/);
  if (mc) viewCraft(mc[1]);
  else ({ '#/home': viewHome, '#/collection': viewCollection, '#/notices': viewNotices, '#/contact': viewContact, '#/visit': viewVisit, '#/install': viewInstall }[r] || viewHome)();
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
