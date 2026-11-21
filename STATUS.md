# PRIME PASS（テスト環境）進捗メモ

最終更新：2026-11-21。架空データのみのテスト環境です。本番ではありません。

## 公開先
- お客様のアプリ：https://fuupapayang.github.io/prime-pass/
- 管理画面：https://fuupapayang.github.io/prime-pass/admin/
- プライムサイトのまねフォーム：https://fuupapayang.github.io/prime-pass/escon-form/index.html
  - GTM経由：末尾に `?gtm=GTM-M2DV24C2`（テスト用コンテナ prime-pass-test、バージョン2を公開済み）
  - GTM手順：`.../escon-form/guide.html`、貼り付け用タグ：`docs/escon-form/gtm-paste-confirm.html` / `gtm-paste-thanks.html`
- リポジトリ：fuupapayang/prime-pass（GitHub Pages、/docs）／Firebase：smipocket-stg（Blaze、予算アラート月3,000円）

## できていること（実機・画面で確認済み）
1. 登録フォーム（まね）→ GTMのタグで氏名・電話・メールを読み取り → 受付窓口（intake）へ送信 → 使い捨て番号 → アプリへ移動
2. 「ご関心のあるプロジェクト」を物件に結びつけ、複数物件に登録。プライムサイトからの登録者は「エスコン プライム（prime）」にも必ず登録
3. QR（15分・1回）→ iPhone Safari → ホーム画面に追加 → ホーム画面アプリを開くと、同じWi-Fi・同じ画面サイズの登録者を、1人だけ見つけ、「○○ 様 PRIME PASSへようこそ。」→ ボタン1回でログイン（claimInstall）
4. 通知とメールの選択画面（プッシュ通知の許可、メール希望の保存）
5. プッシュ通知の受信（実機確認済み）
6. ホーム＝登録したサイト（プライム登録者はエスコン プライム、物件登録者はその物件のページ）
7. プライム画面：実サイトと同じトップ動画（YouTube epWL0sYdzBA）、画像の読み込みの再試行
8. 管理画面：6役割（ADEX、QLEA、ES CON本社、物件担当者1〜3）＋プライム担当（staff4＝エスコン プライムのみ）。二段階認証（認証アプリ）必須
9. 承認フロー（目黒は承認必須）、予約配信、物件画像、担当者からのご案内、コンテンツ管理

## テスト用アカウント・秘密情報（Gitには入っていません）
- `.local/test-accounts.txt`（共通パスワード、設定キー）、`.local/mfa-secrets.json`、`.local/mfa-qr.html`（認証アプリ用QR）
- 認証アプリを登録し直す必要がある場合は、`scripts/seed.mjs`（全データを作り直す。登録者のテストデータも消える）か、`scripts/add-staff4.mjs`（staff4のみ）

## 主なスクリプト
- `scripts/verify.mjs`：権限・配信・承認・MFAなどの自動確認（時間がかかる。MFAの回数制限に注意）
- `scripts/handoff-check.mjs`：QR・ホーム画面追加用の番号と、端末の引き継ぎの自動確認
- `scripts/send-test-notice.mjs 物件ID`：ADEXとして、テスト通知を配信
- `scripts/backfill-prime.mjs`：登録済みの人に、エスコン プライムの登録を追加

## 未確認・未対応
- 本物のフォーム（lmp1.net）の確認画面に、入力値が同じ項目名（input_model[…]）で残っているか → ES CON側に確認（`確認依頼文_フォーム連携.md`）。違う場合は、タグ①の読み取り部分だけ修正
- GA4へのイベント送信（個人情報は含めない形）
- メールでの案内の実送信（現在は希望の保存だけ）
- 期限切れ時の再ログイン（メールのリンク等）
- 引き継ぎ（端末の自動検出）の本番運用での安全性：同一回線・同一画面サイズの別人の混同を避けるため、本人確認の1タップを入れている。本番前に再検討
- 配信レポートのグラフ、承認者をADEX以外にする、バックアップコード、ADEX自身の認証リセット
- 本番のURL・コンテナ・Firebaseプロジェクトへの切り替え（タグ内のINTAKE・APPのURLを差し替え）
