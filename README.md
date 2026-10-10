# Ambient Light for 動画配信

TVer・ABEMA・ニコニコ動画などの動画再生画面に、映像の色に合わせて光るアンビエントライト効果を追加する非公式のChrome拡張機能です。

「[Ambient light for YouTube™](https://chromewebstore.google.com/)」にインスパイアされて作成しました。
DRM（著作権保護技術）を使っていない日本の動画サービスを中心に対応しています。

## 対応サイト

- TVer
- ABEMA（無料部分）
- ニコニコ動画

Netflix・Amazon Prime Video・Disney+・U-NEXT・Hulu・DMM TVなどDRMを使用するサービスは、
ブラウザのセキュリティ機構により映像フレームの読み取りがブロックされるため、技術的に対応できません。

## 機能

- 動画の色をリアルタイムに解析し、プレイヤーの背後にグロー効果を表示
- 強さ・なめらかさ(FPS)を調整可能
- オン/オフの切り替え

## インストール（開発者モード）

1. このリポジトリをダウンロードまたはクローン
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」からこのフォルダを選択

## 対応サイトの追加について

`content/ambient.js` の `SITE_ADAPTERS` にサイトごとの `findVideo` / `findContainer` を追加し、
`manifest.json` の `content_scripts.matches` と `host_permissions` にホストを追加することで、
他のDRMなしサイトにも対応を広げられます。

## プライバシーポリシー

[こちら](https://shimakaru.github.io/ambient-light-for-streaming/privacy.html)

## 免責事項

本拡張機能は非公式のファンメイドツールであり、各サービスの運営会社とは一切関係ありません。
