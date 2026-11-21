// 接続先の設定（本番切替のときは、ここだけを差し替える）
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC8f-gfj7rVvrkXwErw1bdC5HMixpI9kfA',
  authDomain: 'smipocket-stg.firebaseapp.com',
  projectId: 'smipocket-stg',
  storageBucket: 'smipocket-stg.firebasestorage.app',
  messagingSenderId: '246405644992',
  appId: '1:246405644992:web:9eec0977df22bfc30c2325',
};
export const REGION = 'asia-northeast1';
export const INTAKE_URL = `https://${REGION}-${FIREBASE_CONFIG.projectId}.cloudfunctions.net/intake`;
export const APP_NAME = 'PRIME PASS';
export const ENV_LABEL = 'テスト環境（架空データのみ）';
export const PROPERTY_NAMES = { a: 'レジェイド○○（仮）', b: '△△タワー（仮）', c: '□□ヒルズ（仮）' };
export const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
