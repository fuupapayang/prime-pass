// ES CON プライムメンバーシップ サイトの素材（ローカル保存分）を、軽くして、Firebase Storage（ログイン者のみ閲覧）へ上げる。
// 公開のGitHubリポジトリには、素材を置かない。URLの一覧は、Firestore の config/assets に保存する。
//   node scripts/upload-assets.mjs "/Volumes/BlackBox3/ikiiki0008_プライムサイト/SITE DATA/01Prime Pass"
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const SRC = process.argv[2];
if (!SRC) { console.error('素材のフォルダを指定してください'); process.exit(1); }
const P = 'smipocket-stg';
const BUCKET = 'smipocket-stg.firebasestorage.app';
const TMP = join(tmpdir(), 'primepass-assets');
mkdirSync(TMP, { recursive: true });
const TOKEN = execFileSync('gcloud', ['auth', 'print-access-token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'X-Goog-User-Project': P };

// key: [相対パス, 長辺の最大px（画像のみ。動画・svgはそのまま）]
const A = (rel) => `assets/img/${rel}`;
const FILES = {
  hero: [A('top/mv-sp.jpg'), 1200],
  stage1: [A('top/stage-01-sp.jpg'), 900], stage2: [A('top/stage-02-sp.jpg'), 900],
  member: [A('top/member-sp.jpg'), 1000],
  concierge_mv: [A('top/primecc_mv_sp.jpg'), 900],
  ex_hayama24: [A('top/exclusive_hayama24.jpg'), 900], ex_meguro62: [A('top/exclusive_meguro62.jpg'), 900],
  ex_doyama227: [A('top/exclusive_doyama227.jpg'), 900], ex_naha_asato83: [A('top/exclusive_naha-asato83.jpg'), 900],
  ex_fvillage508: [A('top/exclusive_fvillage508.jpg'), 900], ex_ost_garden: [A('top/exclusive_ost-garden.jpg'), 900],
  ex_alia_hawaii: [A('top/exclusive_alia-hawaii.jpg'), 900],
  rel_ashiya: [A('project/ashiya/topic.jpg'), 900], rel_tojinmachi: [A('project/tojinmachi/topic.jpg'), 900],
  rel_minamiazabu: [A('project/minamiazabu/topic.jpg'), 900], rel_nishiazabu2: [A('top/topic-04.jpg'), 900], rel_kudanminami: [A('top/topic-01.jpg'), 900],
  pc_hayama: [A('primeconcierge/hayama/img_01.jpg'), 900], pc_shirokane: [A('primeconcierge/shirokane/img_01.jpg'), 900], pc_kagurazaka: [A('primeconcierge/kagurazaka/img_01.jpg'), 900],
  gal_1: [A('gallery/gallery_thmb_01.jpg'), 900], gal_2: [A('gallery/gallery_thmb_02.jpg'), 900], gal_3: [A('gallery/gallery_thmb_03.jpg'), 900],
};
['mekiki', 'takumi', 'kiwame', 'kokoromi', 'omotenashi'].forEach((k, i) => {
  const n = String(i + 1).padStart(2, '0');
  FILES[`slide_${k}`] = [A(`top/slide-${n}.jpg`), 700];
  FILES[`poster_${k}`] = [A(`top/img-${String(i + 9).padStart(2, '0')}.jpg`), 900];
  FILES[`person_${k}`] = [A(`top/img-${String(i + 14).padStart(2, '0')}.png`), 700];
  FILES[`video_${k}`] = [`assets/video/${k}_sp.mp4`, 0];
});
const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };

async function upload(key, localPath, name) {
  const token = randomUUID();
  const body = readFileSync(localPath);
  const meta = { name, contentType: MIME[extname(localPath)] || 'application/octet-stream', metadata: { firebaseStorageDownloadTokens: token }, cacheControl: 'private, max-age=3600' };
  const boundary = 'b' + randomUUID().replace(/-/g, '');
  const pre = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${meta.contentType}\r\n\r\n`);
  const post = Buffer.from(`\r\n--${boundary}--`);
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart`, { method: 'POST', headers: { ...H, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: Buffer.concat([pre, body, post]) });
  if (!r.ok) throw new Error(`${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(name)}?alt=media&token=${token}`;
}

const urls = {};
let total = 0;
for (const [key, [rel, max]] of Object.entries(FILES)) {
  const src = join(SRC, rel);
  if (!existsSync(src)) { console.log('SKIP（見つかりません）', rel); continue; }
  let path = src;
  if (max && ['.jpg', '.png'].includes(extname(src))) {
    path = join(TMP, `${key}${extname(src)}`);
    execFileSync('sips', ['-Z', String(max), src, '--out', path], { stdio: 'ignore' });
  }
  total += statSync(path).size;
  urls[key] = await upload(key, path, `site/${key}${extname(path)}`);
}

// URL一覧を Firestore（config/assets）へ
const toV = (o) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { stringValue: v }])) } });
const r = await fetch(`https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/config/assets`, {
  method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { urls: toV(urls) } }),
});
if (!r.ok) throw new Error('config/assets: ' + (await r.text()).slice(0, 200));
console.log(`OK: ${Object.keys(urls).length} ファイル／${(total / 1e6).toFixed(1)}MB をアップロードしました`);
