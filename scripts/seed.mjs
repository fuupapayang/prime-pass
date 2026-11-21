// PRIME PASS (staging) テスト用データとテスト用アカウントを作る（何度実行しても同じ結果になる）
//   node scripts/seed.mjs
// 前提: gcloud にログイン済み（fuu.papayang@gmail.com）。Auth と Firestore が有効であること。
// パスワードは、コードに書かず、.local/test-accounts.txt（git管理外）にだけ保存する。
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const P = 'smipocket-stg';
const DOC = `projects/${P}/databases/(default)/documents`;
const accessToken = () => execFileSync('gcloud', ['auth', 'print-access-token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
let TOKEN = accessToken();
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'X-Goog-User-Project': P, 'Content-Type': 'application/json' });

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) { const e = new Error(`${method} ${url} -> ${r.status} ${t.slice(0, 300)}`); e.status = r.status; e.body = j; throw e; }
  return j;
}

/* ---- パスワード（初回に作り、.local に保存。2回目以降は同じものを使う） ---- */
mkdirSync('.local', { recursive: true });
const PWFILE = '.local/test-accounts.txt';
let PASSWORD;
if (existsSync(PWFILE)) {
  const m = readFileSync(PWFILE, 'utf8').match(/共通パスワード: (\S+)/);
  if (m) PASSWORD = m[1];
}
if (!PASSWORD) {
  const alpha = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(12);
  PASSWORD = 'pp-' + Array.from(b, (x) => alpha[x % alpha.length]).join('');
}

/* ---- Auth: 6つの役割 ---- */
const ACCOUNTS = [
  { email: 'adex@primepass.test', name: 'ADEX（テスト）', claims: { role: 'adex' }, label: 'ADEX' },
  { email: 'qlea@primepass.test', name: 'QLEA（テスト）', claims: { role: 'qlea' }, label: 'QLEA' },
  { email: 'escon@primepass.test', name: 'ES CON本社（テスト）', claims: { role: 'escon' }, label: 'ES CON本社' },
  { email: 'staff1@primepass.test', name: '物件担当者1（グラン レ・ジェイド葉山）', claims: { role: 'staff', properties: ['hayama24'] }, label: '物件担当者1（グラン レ・ジェイド葉山）' },
  { email: 'staff2@primepass.test', name: '物件担当者2（レ・ジェイド目黒）', claims: { role: 'staff', properties: ['meguro62'] }, label: '物件担当者2（レ・ジェイド目黒）' },
  { email: 'staff3@primepass.test', name: '物件担当者3（レ・ジェイド大阪梅田）', claims: { role: 'staff', properties: ['doyama227'] }, label: '物件担当者3（レ・ジェイド大阪梅田）' },
];
const AUTH = `https://identitytoolkit.googleapis.com/v1/projects/${P}`;
for (const a of ACCOUNTS) {
  let uid;
  try {
    const r = await api('POST', `${AUTH}/accounts`, { email: a.email, password: PASSWORD, displayName: a.name, emailVerified: true, customAttributes: JSON.stringify(a.claims) });
    uid = r.localId;
    // 作成時には役割（customAttributes）が反映されないため、続けて更新する
    await api('POST', `${AUTH}/accounts:update`, { localId: uid, customAttributes: JSON.stringify(a.claims) });
  } catch (e) {
    if (!/EMAIL_EXISTS/.test(JSON.stringify(e.body))) throw e;
    const l = await api('POST', `${AUTH}/accounts:lookup`, { email: [a.email] });
    uid = l.users[0].localId;
    await api('POST', `${AUTH}/accounts:update`, { localId: uid, password: PASSWORD, displayName: a.name, customAttributes: JSON.stringify(a.claims), emailVerified: true });
  }
  a.uid = uid;
}

/* ---- Firestore ---- */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

/* ---- 以前のテストデータを消す（テスト環境のみ。config は消さない） ---- */
async function wipe(col) {
  let n = 0;
  for (;;) {
    const r = await api('GET', `https://firestore.googleapis.com/v1/${DOC}/${col}?pageSize=300&mask.fieldPaths=_`);
    const docs = r.documents || [];
    if (!docs.length) break;
    for (let i = 0; i < docs.length; i += 300) await api('POST', `https://firestore.googleapis.com/v1/${DOC}:commit`, { writes: docs.slice(i, i + 300).map((d) => ({ delete: d.name })) });
    n += docs.length;
  }
  return n;
}
for (const c of ['properties', 'memberships', 'contacts', 'notices', 'events', 'inquiries', 'intakeIndex', 'tokens', 'pushTokens', 'staff']) await wipe(c);

const writes = [];
const put = (path, data) => writes.push({ update: { name: `${DOC}/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, x]) => [k, toValue(x)])) } });
const daysAgo = (d, h = 10) => new Date(Date.now() - d * 86400000 - (24 - h) * 3600000 * 0);

const PROPS = {
  'hayama24': { name: 'グラン レ・ジェイド葉山', region: '首都圏', area: '神奈川県 葉山町', kind: '新築' },
  'meguro62': { name: 'レ・ジェイド目黒', region: '首都圏', area: '東京都 目黒区', kind: '新築' },
  'doyama227': { name: 'レ・ジェイド大阪梅田', region: '西日本', area: '大阪府 大阪市', kind: '新築' },
  'naha-asato83': { name: 'レ・ジェイド那覇安里駅前', region: '九州・沖縄', area: '沖縄県 那覇市', kind: '新築' },
  'fvillage508': { name: 'エスコンフィールドタワー', region: '北海道', area: '北海道 北広島市', kind: '新築' },
  'ost-garden': { name: 'オストガーデン軽井沢', region: '中部', area: '長野県 軽井沢町', kind: '新築' },
  'alia-hawaii': { name: 'ハワイ Alia / Kuilei', region: '海外', area: 'ハワイ', kind: '新築' },
};
Object.entries(PROPS).forEach(([id, p], i) => put(`properties/${id}`, { ...p, status: 'active', order: i + 1, url: '' }));

const NAMES = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 美咲', '田中 健', '伊藤 彩', '渡辺 誠', '中村 玲子', '小林 拓海', '加藤 由美', '吉田 大輔', '山本 優子'];
const PH = 'hayama24'; const PM = 'meguro62'; const PD = 'doyama227'; const PN = 'naha-asato83'; const PF = 'fvillage508'; const PO = 'ost-garden';
const MEMBER_PROPS = [[PH, PM], [PH], [PH], [PM], [PM, PD], [PD], [PH, PD], [PM], [PD], [PH, PO], [PM, PN], [PD, PF]];
NAMES.forEach((name, i) => {
  const n = String(i + 1).padStart(2, '0');
  const cid = `demo_c${n}`;
  const anonId = `m_d0${n}`;
  MEMBER_PROPS[i].forEach((p) => {
    put(`contacts/${cid}_${p}`, { cid, property: p, name, email: `demo${n}@example.com`, phone: `090-0000-00${n}`, consentAt: daysAgo(20 - i), updatedAt: daysAgo(20 - i) });
    put(`memberships/${cid}_${p}`, { cid, anonId, property: p, tags: ['entry'], joinedAt: daysAgo(20 - i), lastSeenAt: daysAgo(i % 5), pushEnabled: i % 3 !== 0 });
  });
  const h = createHash('sha256').update(`demo${n}@example.com`).digest('hex');
  put(`intakeIndex/${h}`, { cid, anonId, createdAt: daysAgo(20 - i) });
});

const NOTICES = [
  [PH, '会員限定の間取りを追加しました', '会員のみなさまへ、限定の間取りと、CGを公開しました。（テスト用の文面です）', 3],
  [PH, 'モデルルームの来場予約を受付中です', '12月のご予約を承っております。（テスト用の文面です）', 12],
  [PM, '新築 第2期 先行案内のお知らせ', '会員のみなさまへ、先行案内を開始します。（テスト用の文面です）', 5],
  [PM, '販売状況を更新しました', '最新の販売状況を、ご確認いただけます。（テスト用の文面です）', 9],
  [PD, '現地見学会のご案内', '12月の週末に、現地見学会を開催します。（テスト用の文面です）', 6],
  [PD, '限定ムービーを公開しました', '会員限定のムービーを、ご覧いただけます。（テスト用の文面です）', 14],
  [PO, 'クラフトマンの映像を公開しました', '軽井沢のクラフトマンたちの映像を、ご覧いただけます。（テスト用の文面です）', 7],
  [PN, '最新の販売状況のお知らせ', '販売状況を更新しました。（テスト用の文面です）', 10],
];
NOTICES.forEach(([p, title, body, d], i) => put(`notices/demo_n${i + 1}`, { property: p, title, body, createdBy: 'seed', createdByRole: 'seed', publishedAt: daysAgo(d) }));

const EVT = ['open', 'open', 'notice_open', 'checkin'];
let ei = 0;
for (let i = 1; i <= 12; i++) {
  const n = String(i).padStart(2, '0');
  MEMBER_PROPS[i - 1].forEach((p) => {
    for (let k = 0; k < 3; k++) put(`events/demo_e${++ei}`, { anonId: `m_d0${n}`, property: p, type: EVT[(i + k) % 4], ts: daysAgo((i + k) % 9) });
  });
}
const INQ = [
  ['demo_c01', PH, 'inquiry', '間取りと価格帯について、相談したいです。', 'tel', 1],
  ['demo_c02', PH, 'visit', '', 'mail', 2],
  ['demo_c04', PM, 'inquiry', '先行案内の日程を教えてください。', 'mail', 1],
  ['demo_c05', PD, 'inquiry', '現地見学会に参加したいです。', 'tel', 3],
  ['demo_c06', PD, 'visit', '', 'tel', 4],
];
INQ.forEach(([cid, p, kind, message, cm, d], i) => put(`inquiries/demo_q${i + 1}`, { cid, property: p, kind, message, contactMethod: cm, timeSlot: kind === 'visit' ? '11:30' : '', visitDate: kind === 'visit' ? '2026-12-12' : '', guests: 2, status: 'new', createdAt: daysAgo(d) }));

for (const a of ACCOUNTS) put(`staff/${a.uid}`, { email: a.email, displayName: a.name, role: a.claims.role, properties: a.claims.properties || [], disabled: false });

for (let i = 0; i < writes.length; i += 400) {
  await api('POST', `https://firestore.googleapis.com/v1/${DOC}:commit`, { writes: writes.slice(i, i + 400) });
}

const lines = [
  'PRIME PASS（テスト環境）テスト用アカウント　※架空のデータ専用。公開しないでください',
  '',
  `共通パスワード: ${PASSWORD}`,
  '',
  ...ACCOUNTS.map((a) => `${a.label.padEnd(20, '　')} ${a.email}`),
  '',
  '管理画面: https://fuupapayang.github.io/prime-pass/admin/',
  'お客様の登録（サンプルフォーム）: https://fuupapayang.github.io/prime-pass/form/',
];
writeFileSync(PWFILE, lines.join('\n') + '\n');
console.log(`OK: accounts=${ACCOUNTS.length} docs=${writes.length}`);
