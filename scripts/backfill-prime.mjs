// これまでにフォームから登録した人（intakeIndex）に、「エスコン プライム」の登録を追加する（テスト環境用）。  node scripts/backfill-prime.mjs
import { execFileSync } from 'node:child_process';
const P = 'smipocket-stg';
const DOC = `projects/${P}/databases/(default)/documents`;
const tok = execFileSync('gcloud', ['auth', 'print-access-token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const H = { Authorization: `Bearer ${tok}`, 'X-Goog-User-Project': P, 'Content-Type': 'application/json' };
const get = async (path) => (await fetch(`https://firestore.googleapis.com/v1/${DOC}/${path}`, { headers: H })).json();
const idx = await get('intakeIndex?pageSize=300');
let n = 0;
for (const d of idx.documents || []) {
  const f = d.fields; const cid = f.cid.stringValue; const anonId = f.anonId.stringValue;
  const q = await (await fetch(`https://firestore.googleapis.com/v1/${DOC}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'contacts' }], where: { fieldFilter: { field: { fieldPath: 'cid' }, op: 'EQUAL', value: { stringValue: cid } } }, limit: 1 } }) })).json();
  const c = (q.find((x) => x.document) || {}).document; if (!c) continue;
  const cf = c.fields; const now = new Date().toISOString();
  const mid = `${cid}_prime`;
  await fetch(`https://firestore.googleapis.com/v1/${DOC}/contacts/${mid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { cid: { stringValue: cid }, property: { stringValue: 'prime' }, name: cf.name, email: cf.email, phone: cf.phone, consentAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }) });
  const ex = await get(`memberships/${mid}`);
  if (!ex.fields) await fetch(`https://firestore.googleapis.com/v1/${DOC}/memberships/${mid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { cid: { stringValue: cid }, anonId: { stringValue: anonId }, property: { stringValue: 'prime' }, tags: { arrayValue: { values: [{ stringValue: 'entry' }] } }, joinedAt: { timestampValue: now }, pushEnabled: { booleanValue: false } } }) });
  n++;
}
console.log('追加した人数:', n);
