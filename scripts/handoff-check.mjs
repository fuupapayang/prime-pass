// 引き継ぎ番号（QR・ホーム画面追加用）の確認。  node scripts/handoff-check.mjs
const KEY = 'AIzaSyC8f-gfj7rVvrkXwErw1bdC5HMixpI9kfA';
const FN = 'https://asia-northeast1-smipocket-stg.cloudfunctions.net';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const post = async (u, b, tok, ua) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ua ? { 'User-Agent': ua } : {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(b) })).json();
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

// ホーム画面アプリへの引き継ぎ（同じ回線・同じiPhone・短時間に1人だけ）
const m2 = await post(`${FN}/mintHandoff`, { data: { kind: 'install' } }, idt, UA);
ok('追加用の番号を作る', !!m2.result?.token);
const cl0 = await post(`${FN}/claimInstall`, { data: {} }, null, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15');
ok('iPhoneでない端末では、候補が出ない', cl0.result?.found === false);
const cl = await post(`${FN}/claimInstall`, { data: {} }, null, UA);
ok('同じ回線・同じiPhoneの種類で、候補が1人だけ見つかる', cl.result?.found === true && !!cl.result.claim);
const cf = await post(`${FN}/claimInstallConfirm`, { data: { claim: cl.result?.claim } });
ok('確認のあとで、ログインの鍵を受け取る', !!cf.result?.customToken);
const cf2 = await post(`${FN}/claimInstallConfirm`, { data: { claim: cl.result?.claim } });
ok('同じ確認は、2回目は使えない', !!cf2.error);
const cl2 = await post(`${FN}/claimInstall`, { data: {} }, null, UA);
ok('使い終わったあとは、候補が出ない', cl2.result?.found === false);
