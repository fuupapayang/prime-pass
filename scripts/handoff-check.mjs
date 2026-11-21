// 引き継ぎ番号（QR・ホーム画面追加用）の確認。  node scripts/handoff-check.mjs
const KEY = 'AIzaSyC8f-gfj7rVvrkXwErw1bdC5HMixpI9kfA';
const FN = 'https://asia-northeast1-smipocket-stg.cloudfunctions.net';
const post = async (u, b, tok) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(b) })).json();
const ok = (l, c) => console.log(`${l}: ${c ? '期待どおり' : 'NG'}`);
const email = `handoff.${Date.now()}@example.com`;
const t0 = (await post(`${FN}/intake`, { name: '引継 テスト', email, phone: '090-0000-0000', projects: ['[首都圏] レ・ジェイド目黒'], consent: true })).token;
const c0 = (await post(`${FN}/redeemToken`, { data: { token: t0 } })).result.customToken;
const idt = (await post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${KEY}`, { token: c0, returnSecureToken: true })).idToken;
for (const kind of ['qr', 'install']) {
  const m = await post(`${FN}/mintHandoff`, { data: { kind } }, idt);
  ok(`${kind}：ログイン済みのお客様が、番号を作る`, !!m.result?.token);
  const r1 = await post(`${FN}/redeemToken`, { data: { token: m.result.token } });
  ok(`${kind}：番号でログインできる`, !!r1.result?.customToken);
  const r2 = await post(`${FN}/redeemToken`, { data: { token: m.result.token } });
  ok(`${kind}：同じ番号は、2回目は使えない`, !!r2.error);
}
ok('未ログインでは、番号を作れない', !!(await post(`${FN}/mintHandoff`, { data: { kind: 'qr' } })).error);
