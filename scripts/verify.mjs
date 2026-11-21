// 権限の自動チェック：6つの役割で実際にログインし、物件ごとに、読めるか／拒否されるかを確認する
//   node scripts/verify.mjs
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const P = 'smipocket-stg';
const KEY = 'AIzaSyC8f-gfj7rVvrkXwErw1bdC5HMixpI9kfA';
const FN = `https://asia-northeast1-${P}.cloudfunctions.net`;
const PW = readFileSync('.local/test-accounts.txt', 'utf8').match(/共通パスワード: (\S+)/)[1];
const PROPS = ['hayama24', 'meguro62', 'doyama227', 'ost-garden'];
const COLS = ['memberships', 'contacts', 'inquiries', 'events', 'notices'];

const signIn = async (email) => {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j.idToken;
};
const canRead = async (tok, col, p) => {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: 'property' }, op: 'EQUAL', value: { stringValue: p } } }, limit: 50 } }),
  });
  const j = await r.json();
  if (!r.ok) return 'X';
  return j.filter((x) => x.document).length;
};
const callFn = async (tok, name, data) => {
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify({ data }) });
  const j = await r.json(); return j.error ? `拒否(${j.error.status})` : '成功';
};

// 期待値: 読める=true
const EXPECT = (role, own, p) => {
  const mine = own.includes(p);
  switch (role) {
    case 'adex': return { memberships: 1, contacts: 1, inquiries: 1, events: 1, notices: 1 };
    case 'qlea': case 'escon': return { memberships: 1, contacts: 0, inquiries: 0, events: 1, notices: 1 };
    case 'staff': return { memberships: +mine, contacts: +mine, inquiries: +mine, events: +mine, notices: +mine };
  }
};
const USERS = [['adex@primepass.test', 'adex', []], ['qlea@primepass.test', 'qlea', []], ['escon@primepass.test', 'escon', []], ['staff1@primepass.test', 'staff', ['hayama24']], ['staff2@primepass.test', 'staff', ['meguro62']], ['staff3@primepass.test', 'staff', ['doyama227']]];

let bad = 0;
console.log('■ 閲覧権限（○=読める ×=拒否）　期待と違う場合は NG を表示');
for (const [email, role, own] of USERS) {
  const tok = await signIn(email);
  let line = `${email.padEnd(24)}`;
  for (const p of PROPS) {
    const ex = EXPECT(role, own, p);
    const cells = [];
    for (const c of COLS) {
      const got = await canRead(tok, c, p);
      const ok = got !== 'X';
      const good = ok === !!ex[c];
      if (!good) bad++;
      cells.push(`${c.slice(0, 3)}:${ok ? '○' : '×'}${good ? '' : 'NG'}`);
    }
    line += ` | ${p}: ${cells.join(' ')}`;
  }
  console.log(line);
}

console.log('\n■ 通知の配信（sendNotice）');
const SEND = [['adex@primepass.test', 'hayama24', '成功'], ['qlea@primepass.test', 'hayama24', '拒否'], ['escon@primepass.test', 'hayama24', '拒否'], ['staff1@primepass.test', 'hayama24', '成功'], ['staff1@primepass.test', 'meguro62', '拒否'], ['staff2@primepass.test', 'meguro62', '拒否'], ['staff2@primepass.test', 'hayama24', '拒否'], ['staff3@primepass.test', 'hayama24', '拒否']];
for (const [email, p, ex] of SEND) {
  const tok = await signIn(email);
  const got = await callFn(tok, 'sendNotice', { property: p, title: `[自動テスト] ${email}`, body: 'verify' });
  const ok = got.startsWith(ex); if (!ok) bad++;
  console.log(`${email.padEnd(24)} 物件${p}: ${got}${ok ? '' : '  NG（期待: ' + ex + '）'}`);
}

console.log('\n■ お客様の登録〜ログイン（一時番号）');
const email = `verify${Date.now()}@example.com`;
const ir = await fetch(`${FN}/intake`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://fuupapayang.github.io' }, body: JSON.stringify({ name: '自動 テスト', email, phone: '090-0000-0000', property: 'meguro62', formType: 'entry', consent: true }) });
const { token } = await ir.json();
const rd1 = await (await fetch(`${FN}/redeemToken`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { token } }) })).json();
const rd2 = await (await fetch(`${FN}/redeemToken`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { token } }) })).json();
console.log('一時番号の1回目の交換:', rd1.result && rd1.result.customToken ? '成功' : 'NG ' + JSON.stringify(rd1));
console.log('一時番号の2回目の交換:', rd2.error ? `拒否（${rd2.error.status}）` : 'NG（再利用できてしまう）');
if (!(rd1.result && rd1.result.customToken) || !rd2.error) bad++;
if (rd1.result) {
  const st = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: rd1.result.customToken, returnSecureToken: true }) })).json();
  const mtok = st.idToken;
  const own = await (await fetch(`https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${mtok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'contacts' }], where: { fieldFilter: { field: { fieldPath: 'cid' }, op: 'EQUAL', value: { stringValue: JSON.parse(Buffer.from(mtok.split('.')[1], 'base64url')).user_id } } } } }) })).json();
  const mine = own.filter((x) => x.document).length;
  console.log('お客様が、自分の登録情報を読む:', mine === 1 ? '成功（1件）' : `NG(${mine})`); if (mine !== 1) bad++;
  const other = await canRead(mtok, 'contacts', 'hayama24');
  console.log('お客様が、他人の個人情報を読む:', other === 'X' ? '拒否（正しい）' : 'NG（読めてしまう）'); if (other !== 'X') bad++;
  console.log('お客様が、通知を配信する:', await callFn(mtok, 'sendNotice', { property: 'meguro62', title: 'x', body: 'y' }));
  console.log('お客様の問い合わせ送信:', await callFn(mtok, 'submitInquiry', { properties: ['meguro62'], kind: 'inquiry', message: '自動テスト', contactMethod: 'mail' }));
  console.log('行動ログの記録:', await callFn(mtok, 'logEvent', { type: 'open' }));
}
console.log('\n■ ADEX専用の管理機能（物件・担当者）');
const callJ = async (tok, name, data) => { const r = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ data }) }); return r.json(); };
const chk = (label, ok) => { console.log(`${label}: ${ok ? '期待どおり' : 'NG'}`); if (!ok) bad++; };
const adexTok = await signIn('adex@primepass.test');
const staff1Tok = await signIn('staff1@primepass.test');
const PID = 'zz-test-' + Date.now().toString(36);
chk('担当者が、物件を登録しようとする→拒否', !!(await callJ(staff1Tok, 'adminSaveProperty', { id: PID, name: 'x' })).error);
chk('ADEXが、物件を登録する→成功', !!(await callJ(adexTok, 'adminSaveProperty', { id: PID, name: '自動テスト物件', region: '首都圏', area: 'テスト', kind: '新築' })).result);
chk('登録した物件が、フォーム用の一覧に出る', (await (await fetch(`${FN}/listProperties`)).json()).properties.some((x) => x.id === PID));
chk('ADEXが、物件の掲載を停止する→成功', !!(await callJ(adexTok, 'adminSetPropertyStatus', { id: PID, status: 'archived' })).result);
await new Promise((r) => setTimeout(r, 1500));
chk('停止した物件は、フォーム用の一覧から消える', !(await (await fetch(`${FN}/listProperties`)).json()).properties.some((x) => x.id === PID));
const em = `verify-staff-${Date.now()}@primepass.test`;
chk('担当者が、担当者アカウントを発行しようとする→拒否', !!(await callJ(staff1Tok, 'adminCreateStaff', { email: em, name: 'x', properties: ['meguro62'] })).error);
const cr = await callJ(adexTok, 'adminCreateStaff', { email: em, name: '自動テスト担当者', properties: ['meguro62'] });
chk('ADEXが、担当者アカウントを発行する→成功（パスワードを返す）', !!(cr.result && cr.result.password));
if (cr.result) {
  const nr = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password: cr.result.password, returnSecureToken: true }) });
  const nj = await nr.json();
  chk('発行した担当者が、ログインできる', !!nj.idToken);
  if (nj.idToken) {
    chk('　自分の物件（目黒）は、読める', (await canRead(nj.idToken, 'contacts', 'meguro62')) !== 'X');
    chk('　他の物件（葉山）は、読めない', (await canRead(nj.idToken, 'contacts', 'hayama24')) === 'X');
    chk('ADEXが、担当物件を変更する→成功', !!(await callJ(adexTok, 'adminUpdateStaff', { uid: cr.result.uid, properties: ['hayama24'] })).result);
    const nr2 = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password: cr.result.password, returnSecureToken: true }) })).json();
    chk('　変更後は、葉山が読めて、目黒は読めない', (await canRead(nr2.idToken, 'contacts', 'hayama24')) !== 'X' && (await canRead(nr2.idToken, 'contacts', 'meguro62')) === 'X');
    chk('ADEXが、アカウントを停止する→成功', !!(await callJ(adexTok, 'adminSetStaffDisabled', { uid: cr.result.uid, disabled: true })).result);
    const nr3 = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password: cr.result.password, returnSecureToken: true }) });
    chk('　停止後は、ログインできない', !nr3.ok);
  }
}
console.log('\n■ 問い合わせの対応状況');
const staff2Tok = await signIn('staff2@primepass.test');
chk('担当外の担当者（目黒）が、葉山の問い合わせを変更→拒否', !!(await callJ(staff2Tok, 'setInquiryStatus', { id: 'demo_q1', status: 'doing' })).error);
chk('担当の担当者（葉山）が、自物件の問い合わせを「対応中」にする→成功', !!(await callJ(staff1Tok, 'setInquiryStatus', { id: 'demo_q1', status: 'doing', memo: '自動テスト' })).result);
chk('ADEXが、「未対応」に戻す→成功', !!(await callJ(adexTok, 'setInquiryStatus', { id: 'demo_q1', status: 'new', memo: '' })).result);
const qleaTok = await signIn('qlea@primepass.test');
chk('QLEAが、問い合わせを変更→拒否', !!(await callJ(qleaTok, 'setInquiryStatus', { id: 'demo_q1', status: 'done' })).error);
console.log('\n■ 通知の承認フロー・予約配信');
const qdocs = async (tok, col, field, val) => { const r = await fetch(`https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: val } } } } }) }); const j = await r.json(); return Array.isArray(j) ? j.filter((x) => x.document).map((x) => x.document) : []; };
const T0 = `[自動テスト] 承認 ${Date.now()}`;
chk('承認が必要な物件で、担当者が、いますぐ配信→拒否', !!(await callJ(staff2Tok, 'sendNotice', { property: 'meguro62', title: T0, body: 'x' })).error);
const sub = await callJ(staff2Tok, 'saveNotice', { property: 'meguro62', title: T0, body: 'テスト本文', action: 'submit' });
chk('担当者が、承認を依頼する→「承認待ち」になる', sub.result && sub.result.status === 'pending');
chk('担当者が、自分で承認しようとする→拒否', !!(await callJ(staff2Tok, 'reviewNotice', { id: sub.result?.id, decision: 'approve' })).error);
chk('承認待ちの間は、お客様向けのお知らせに出ない', (await qdocs(adexTok, 'notices', 'title', T0)).length === 0);
const rj = await callJ(adexTok, 'reviewNotice', { id: sub.result?.id, decision: 'reject', note: '文面を直してください' });
chk('ADEXが、差し戻す→「下書き」に戻る', rj.result && rj.result.status === 'draft');
const sub2 = await callJ(staff2Tok, 'saveNotice', { id: sub.result?.id, property: 'meguro62', title: T0, body: '直しました', action: 'submit' });
chk('担当者が、直して、もう一度依頼する→「承認待ち」', sub2.result && sub2.result.status === 'pending');
const ap = await callJ(adexTok, 'reviewNotice', { id: sub.result?.id, decision: 'approve' });
chk('ADEXが、承認する→配信される', ap.result && ap.result.status === 'sent');
chk('　お知らせとして記録される', (await qdocs(adexTok, 'notices', 'title', T0)).length === 1);
const dr = await callJ(staff1Tok, 'saveNotice', { property: 'hayama24', title: '[自動テスト] 下書き', body: 'x', action: 'draft' });
chk('下書きを保存できる', dr.result && dr.result.status === 'draft');
chk('他の担当者が、その下書きを取り下げる→拒否', !!(await callJ(staff2Tok, 'deleteOutbox', { id: dr.result?.id })).error);
chk('作成者が、取り下げる→成功', !!(await callJ(staff1Tok, 'deleteOutbox', { id: dr.result?.id })).result);
chk('過去の日時での予約→拒否', !!(await callJ(staff1Tok, 'saveNotice', { property: 'hayama24', title: '[自動テスト] 過去', body: 'x', action: 'submit', scheduleAt: Date.now() - 60000 })).error);
const T1 = `[自動テスト] 予約 ${Date.now()}`;
const sc = await callJ(staff1Tok, 'saveNotice', { property: 'hayama24', title: T1, body: '予約配信のテスト', action: 'submit', scheduleAt: Date.now() + 50000 });
chk('承認不要の物件で、予約する→「予約中」になる', sc.result && sc.result.status === 'scheduled');
chk('予約の時刻前は、お知らせに出ない', (await qdocs(adexTok, 'notices', 'title', T1)).length === 0);
let delivered = false;
for (let i = 0; i < 20 && !delivered; i++) { await new Promise((r) => setTimeout(r, 10000)); delivered = (await qdocs(adexTok, 'notices', 'title', T1)).length === 1; }
chk('予約の時刻になると、自動で配信される（最大200秒待つ）', delivered);
chk('　配信後は、予約の一覧から消える', (await qdocs(staff1Tok, 'outbox', 'property', 'hayama24')).filter((d) => d.fields.title.stringValue === T1).length === 0);
globalThis.__cleanup = { PID, staffUid: cr.result && cr.result.uid };

// 後片付け: 自動テストが作ったお知らせ・登録者を、削除する（best effort。gcloud にログイン済みであること）
try {
  const AT = execFileSync('gcloud', ['auth', 'print-access-token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  const DOCS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
  const H = { Authorization: `Bearer ${AT}`, 'X-Goog-User-Project': P, 'Content-Type': 'application/json' };
  const run = async (col, field, op, val) => (await (await fetch(`${DOCS}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: val } } } } }) })).json()).filter((x) => x.document).map((x) => x.document);
  const del = async (docs) => { for (const d of docs) await fetch(`https://firestore.googleapis.com/v1/${d.name}`, { method: 'DELETE', headers: H }); return docs.length; };
  let n = 0;
  const notices = (await run('notices', 'title', 'GREATER_THAN_OR_EQUAL', '[自動テスト]')).filter((d) => d.fields.title.stringValue.startsWith('[自動テスト]'));
  n += await del(notices);
  const cs = await run('contacts', 'name', 'EQUAL', '自動 テスト');
  for (const c of cs) {
    const cid = c.fields.cid.stringValue;
    const ms = await run('memberships', 'cid', 'EQUAL', cid);
    for (const m of ms) n += await del(await run('events', 'anonId', 'EQUAL', m.fields.anonId.stringValue));
    n += await del(ms); n += await del(await run('inquiries', 'cid', 'EQUAL', cid)); n += await del(await run('contacts', 'cid', 'EQUAL', cid));
    n += await del(await run('intakeIndex', 'cid', 'EQUAL', cid));
  }
  const { PID: pid, staffUid } = globalThis.__cleanup || {};
  if (pid) { await fetch(`${DOCS}/properties/${pid}`, { method: 'DELETE', headers: H }); n += 1; }
  if (staffUid) {
    await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${P}/accounts:delete`, { method: 'POST', headers: H, body: JSON.stringify({ localId: staffUid }) });
    await fetch(`${DOCS}/staff/${staffUid}`, { method: 'DELETE', headers: H }); n += 1;
  }
  console.log(`後片付け: テスト用データ ${n} 件を削除しました`);
} catch (e) { console.log('後片付けをスキップしました：' + e.message.slice(0, 80)); }
console.log(`\n結果: ${bad === 0 ? 'すべて期待どおり' : 'NG が ' + bad + ' 件あります'}`);
process.exit(bad ? 1 : 0);
