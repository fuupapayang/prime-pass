// テスト用のお知らせを、ADEXとして配信する（プッシュ通知の確認用）。  node scripts/send-test-notice.mjs hayama24
import { readFileSync } from 'node:fs';
import { signInWithMfa } from './mfa.mjs';
const KEY = 'AIzaSyC8f-gfj7rVvrkXwErw1bdC5HMixpI9kfA';
const FN = 'https://asia-northeast1-smipocket-stg.cloudfunctions.net';
const PW = readFileSync('.local/test-accounts.txt', 'utf8').match(/共通パスワード: (\S+)/)[1];
const SECRETS = JSON.parse(readFileSync('.local/mfa-secrets.json', 'utf8'));
const property = process.argv[2] || 'hayama24';
const tok = (await signInWithMfa({ email: 'adex@primepass.test', password: PW, key: KEY, secret: SECRETS['adex@primepass.test'] })).idToken;
const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
const r = await (await fetch(`${FN}/sendNotice`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ data: { property, title: `【テスト】通知の確認（${now}）`, body: 'プッシュ通知のテストです。この通知が届けば、成功です。' } }) })).json();
console.log(JSON.stringify(r));
