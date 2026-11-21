// 二段階認証（TOTP＝認証アプリの6桁コード）のテスト用の部品。seed.mjs と verify.mjs で使う。
// 本番では使わない（テスト用アカウントの自動確認のためだけ）。
import { createHmac } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32decode(s) {
  const clean = String(s).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = '';
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function totp(secretB32, atMs = Date.now(), period = 30, digits = 6) {
  const counter = Math.floor(atMs / 1000 / period);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', b32decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

// コードは、使うたびに、30秒枠の番号が、前より大きいものでないと受け付けられない（再利用の防止）。次の枠まで、待つことがある
const lastCounter = new Map();
async function freshCode(secret) {
  for (let i = 0; i < 30; i++) {
    const k = Math.floor(Date.now() / 30000);
    for (const cand of [k, k + 1]) {
      if (cand > (lastCounter.get(secret) || 0)) { lastCounter.set(secret, cand); return totp(secret, cand * 30000); }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('使えるコードがありません');
}
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { const e = new Error(JSON.stringify(j).slice(0, 300)); e.body = j; e.status = r.status; throw e; }
  return j;
};
const IT = 'https://identitytoolkit.googleapis.com';

/** パスワードでログイン。二段階が必要なら、secret から作ったコードで、続けてログインする */
export async function signInWithMfa({ email, password, key, secret }) {
  const r = await post(`${IT}/v1/accounts:signInWithPassword?key=${key}`, { email, password, returnSecureToken: true });
  if (r.idToken) return { idToken: r.idToken, mfa: false };
  if (!r.mfaPendingCredential) throw new Error('unexpected sign-in response');
  if (!secret) throw new Error(`二段階認証の設定キーがありません: ${email}`);
  const info = r.mfaInfo.find((i) => i.totpInfo) || r.mfaInfo[0];
  const f = await post(`${IT}/v2/accounts/mfaSignIn:finalize?key=${key}`, {
    mfaPendingCredential: r.mfaPendingCredential, mfaEnrollmentId: info.mfaEnrollmentId, totpVerificationInfo: { verificationCode: await freshCode(secret) },
  });
  return { idToken: f.idToken, mfa: true };
}

/** 認証アプリを登録する（パスワードのみでログインした直後の idToken が必要）。設定キー（base32）を返す */
export async function enrollTotp(idToken, key) {
  const st = await post(`${IT}/v2/accounts/mfaEnrollment:start?key=${key}`, { idToken, totpEnrollmentInfo: {} });
  const info = st.totpSessionInfo;
  await post(`${IT}/v2/accounts/mfaEnrollment:finalize?key=${key}`, {
    idToken, displayName: '認証アプリ', totpVerificationInfo: { sessionInfo: info.sessionInfo, verificationCode: await freshCode(info.sharedSecretKey) },
  });
  return info.sharedSecretKey;
}
