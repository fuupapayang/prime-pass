// プライム担当（staff4）を追加する（担当＝エスコン プライムだけ）。既存のデータは消さない。  node scripts/add-staff4.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { enrollTotp, signInWithMfa } from './mfa.mjs';
const P = 'smipocket-stg'; const WEBKEY = 'AIzaSyC8f-gfj7rVvrkXwErw1bdC5HMixpI9kfA';
const AUTH = `https://identitytoolkit.googleapis.com/v1/projects/${P}`;
const DOC = `projects/${P}/databases/(default)/documents`;
const tok = execFileSync('gcloud', ['auth', 'print-access-token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const H = { Authorization: `Bearer ${tok}`, 'X-Goog-User-Project': P, 'Content-Type': 'application/json' };
const api = async (m, u, b) => { const r = await fetch(u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; } if (!r.ok) { const e = new Error(`${m} ${u} ${r.status} ${t.slice(0, 200)}`); e.body = j; throw e; } return j; };
const PASSWORD = readFileSync('.local/test-accounts.txt', 'utf8').match(/共通パスワード: (\S+)/)[1];
const email = 'staff4@primepass.test'; const name = 'プライム担当（エスコン プライム）'; const claims = { role: 'staff', properties: ['prime'] };
let uid;
try { uid = (await api('POST', `${AUTH}/accounts`, { email, password: PASSWORD, displayName: name, emailVerified: true })).localId; }
catch (e) { if (!/EMAIL_EXISTS/.test(JSON.stringify(e.body))) throw e; uid = (await api('POST', `${AUTH}/accounts:lookup`, { email: [email] })).users[0].localId; }
await api('POST', `${AUTH}/accounts:update`, { localId: uid, password: PASSWORD, displayName: name, customAttributes: JSON.stringify(claims), emailVerified: true });
await api('PATCH', `https://firestore.googleapis.com/v1/${DOC}/staff/${uid}`, { fields: { email: { stringValue: email }, displayName: { stringValue: name }, role: { stringValue: 'staff' }, properties: { arrayValue: { values: [{ stringValue: 'prime' }] } }, disabled: { booleanValue: false } } });
const SECRETS = JSON.parse(readFileSync('.local/mfa-secrets.json', 'utf8'));
if (!SECRETS[email]) {
  await api('POST', `${AUTH}/accounts:update`, { localId: uid, mfa: { enrollments: [] } }).catch(() => {});
  const r = await signInWithMfa({ email, password: PASSWORD, key: WEBKEY });
  SECRETS[email] = await enrollTotp(r.idToken, WEBKEY);
  writeFileSync('.local/mfa-secrets.json', JSON.stringify(SECRETS, null, 2));
  appendFileSync('.local/test-accounts.txt', `\nプライム担当（エスコン プライム）　　　　 ${email}\nプライム担当（エスコン プライム）の設定キー: ${SECRETS[email]}\n`);
}
console.log('staff4 追加完了 uid=', uid);
