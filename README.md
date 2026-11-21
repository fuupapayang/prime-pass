# PRIME PASS（テスト環境）

会員限定の物件情報アプリ（PWA）の、テスト用ビルドです。**架空のデータのみ**を使います。実際の個人情報は入れません。

- お客様アプリ: https://fuupapayang.github.io/prime-pass/
- 管理画面: https://fuupapayang.github.io/prime-pass/admin/
- 登録のサンプルフォーム: https://fuupapayang.github.io/prime-pass/form/

## 構成
- 画面: GitHub Pages（`docs/`）
- 裏側: Firebase（プロジェクト `smipocket-stg`。Auth・Firestore・Functions・Cloud Messaging）
- `functions/`: 一時番号の発行・通知の配信・権限チェック
- `firestore.rules`: 物件ごとのデータの壁と、役割別の閲覧権限
- `scripts/seed.mjs`: テスト用データとテスト用アカウントの作成（パスワードは、リポジトリに含めません）

## 役割
ADEX / QLEA / ES CON本社 / 物件担当者（物件ごと）。QLEAとES CON本社は、個人情報（名前・メール・電話）を読めません。

## 本番に切り替えるとき
接続先は `docs/js/config.js` と `docs/firebase-messaging-sw.js` に集約しています。
