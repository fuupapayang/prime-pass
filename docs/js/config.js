// 接続先と、物件の一覧（本番切替のときは、ここを差し替える）
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
export const LIST_URL = `https://${REGION}-${FIREBASE_CONFIG.projectId}.cloudfunctions.net/listProperties`;
export const APP_NAME = 'PRIME PASS';
export const ENV_LABEL = 'テスト環境（架空データのみ）';

// ES CON プライムメンバーシップ サイトの Exclusive Residences（先頭3つに、物件担当者1〜3を割り当てている）
export const PROPERTIES = [
  { id: 'hayama24', name: 'グラン レ・ジェイド葉山', region: '首都圏', area: '神奈川県 葉山町', url: 'https://sumai.es-conjapan.co.jp/hayama24/' },
  { id: 'meguro62', name: 'レ・ジェイド目黒', region: '首都圏', area: '東京都 目黒区', url: 'https://sumai.es-conjapan.co.jp/meguro62/' },
  { id: 'doyama227', name: 'レ・ジェイド大阪梅田', region: '西日本', area: '大阪府 大阪市', url: 'https://sumai.es-conjapan.co.jp/doyama227/' },
  { id: 'naha-asato83', name: 'レ・ジェイド那覇安里駅前', region: '九州・沖縄', area: '沖縄県 那覇市', url: 'https://sumai.es-conjapan.co.jp/naha-asato83/' },
  { id: 'fvillage508', name: 'エスコンフィールドタワー', region: '北海道', area: '北海道 北広島市', url: 'https://sumai.es-conjapan.co.jp/fvillage508/' },
  { id: 'ost-garden', name: 'オストガーデン軽井沢', region: '中部', area: '長野県 軽井沢町', url: 'https://www.ost-garden.jp/' },
  { id: 'alia-hawaii', name: 'ハワイ Alia / Kuilei', region: '海外', area: 'ハワイ', url: 'https://alia-hawaii.jp/hawaiilp.html' },
];
export const PROPERTY_NAMES = Object.fromEntries(PROPERTIES.map((p) => [p.id, p.name]));
export const PROPERTY_IDS = PROPERTIES.map((p) => p.id);
export const assetKey = (id) => 'ex_' + id.replace(/-/g, '_');
