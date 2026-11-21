// 権限の自動チェック：6つの役割で実際にログインし、物件ごとに、読めるか／拒否されるかを確認する
//   node scripts/verify.mjs
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const P = 'smipocket-stg';
const KEY = 'AIzaSyC8f-gfj7rVvrkXwErw1bdC5HMixpI9kfA';
const FN = `https://asia-northeast1-${P}.cloudfunctions.net`;
const PW = readFileSync('.local/test-accounts.txt', 'utf8').match(/共通パスワード: (\S+)/)[1];
const PROPS = ['a', 'b', 'c'];
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
const USERS = [['adex@primepass.test', 'adex', []], ['qlea@primepass.test', 'qlea', []], ['escon@primepass.test', 'escon', []], ['staff1@primepass.test', 'staff', ['a']], ['staff2@primepass.test', 'staff', ['b']], ['staff3@primepass.test', 'staff', ['c']]];

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
const SEND = [['adex@primepass.test', 'a', '成功'], ['qlea@primepass.test', 'a', '拒否'], ['escon@primepass.test', 'a', '拒否'], ['staff1@primepass.test', 'a', '成功'], ['staff1@primepass.test', 'b', '拒否'], ['staff2@primepass.test', 'b', '成功'], ['staff2@primepass.test', 'a', '拒否'], ['staff3@primepass.test', 'a', '拒否']];
for (const [email, p, ex] of SEND) {
  const tok = await signIn(email);
  const got = await callFn(tok, 'sendNotice', { property: p, title: `[自動テスト] ${email}`, body: 'verify' });
  const ok = got.startsWith(ex); if (!ok) bad++;
  console.log(`${email.padEnd(24)} 物件${p}: ${got}${ok ? '' : '  NG（期待: ' + ex + '）'}`);
}

console.log('\n■ お客様の登録〜ログイン（一時番号）');
const email = `verify${Date.now()}@example.com`;
const ir = await fetch(`${FN}/intake`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://fuupapayang.github.io' }, body: JSON.stringify({ name: '自動 テスト', email, phone: '090-0000-0000', property: 'b', formType: 'entry', consent: true }) });
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
  const other = await canRead(mtok, 'contacts', 'a');
  console.log('お客様が、他人の個人情報を読む:', other === 'X' ? '拒否（正しい）' : 'NG（読めてしまう）'); if (other !== 'X') bad++;
  console.log('お客様が、通知を配信する:', await callFn(mtok, 'sendNotice', { property: 'b', title: 'x', body: 'y' }));
  console.log('お客様の問い合わせ送信:', await callFn(mtok, 'submitInquiry', { properties: ['b'], kind: 'inquiry', message: '自動テスト', contactMethod: 'mail' }));
  console.log('行動ログの記録:', await callFn(mtok, 'logEvent', { type: 'open' }));
}
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
  console.log(`後片付け: テスト用データ ${n} 件を削除しました`);
} catch (e) { console.log('後片付けをスキップしました：' + e.message.slice(0, 80)); }
console.log(`\n結果: ${bad === 0 ? 'すべて期待どおり' : 'NG が ' + bad + ' 件あります'}`);
process.exit(bad ? 1 : 0);
