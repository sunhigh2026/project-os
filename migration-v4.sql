-- ==============================
-- migration-v4: タグ機能・デフォルトテンプレート追加
-- ==============================

-- プロジェクトにtagsカラム追加
ALTER TABLE projects ADD COLUMN tags TEXT;

-- デフォルトテンプレート
INSERT OR IGNORE INTO templates (id, name, description, type, tasks_json, created_at) VALUES
(
  'tmpl-webapp-01',
  'Webアプリ開発',
  'フロントエンド〜デプロイまでの標準的な開発フロー',
  'project',
  '[{"text":"要件定義・機能リストアップ","phase":"フェーズ1: 企画","priority":"high","duration_days":3},{"text":"ワイヤーフレーム・UI設計","phase":"フェーズ1: 企画","priority":"mid","duration_days":3},{"text":"技術スタック選定","phase":"フェーズ1: 企画","priority":"high","duration_days":1},{"text":"環境構築・リポジトリ作成","phase":"フェーズ2: 開発","priority":"high","duration_days":1},{"text":"データモデル設計・DB構築","phase":"フェーズ2: 開発","priority":"high","duration_days":3},{"text":"バックエンドAPI実装","phase":"フェーズ2: 開発","priority":"high","duration_days":7},{"text":"フロントエンド画面実装","phase":"フェーズ2: 開発","priority":"high","duration_days":7},{"text":"認証・セキュリティ実装","phase":"フェーズ2: 開発","priority":"mid","duration_days":3},{"text":"結合テスト・バグ修正","phase":"フェーズ3: テスト","priority":"high","duration_days":5},{"text":"デプロイ・本番環境構築","phase":"フェーズ4: リリース","priority":"high","duration_days":2},{"text":"README・ドキュメント整備","phase":"フェーズ4: リリース","priority":"low","duration_days":2}]',
  '2024-01-01T00:00:00.000Z'
),
(
  'tmpl-mobile-01',
  'モバイルアプリ開発',
  'iOS/Android アプリ開発の標準フロー',
  'project',
  '[{"text":"アプリコンセプト・ターゲット定義","phase":"フェーズ1: 企画","priority":"high","duration_days":2},{"text":"画面設計・プロトタイプ作成","phase":"フェーズ1: 企画","priority":"high","duration_days":4},{"text":"開発環境セットアップ","phase":"フェーズ2: 開発","priority":"high","duration_days":1},{"text":"ナビゲーション・ルーティング実装","phase":"フェーズ2: 開発","priority":"high","duration_days":2},{"text":"メイン画面UI実装","phase":"フェーズ2: 開発","priority":"high","duration_days":7},{"text":"API連携・データ取得実装","phase":"フェーズ2: 開発","priority":"high","duration_days":5},{"text":"プッシュ通知・権限処理","phase":"フェーズ2: 開発","priority":"mid","duration_days":2},{"text":"実機テスト・パフォーマンス調整","phase":"フェーズ3: テスト","priority":"high","duration_days":5},{"text":"ストア申請準備（スクショ・説明文）","phase":"フェーズ4: リリース","priority":"mid","duration_days":3},{"text":"ストア審査・公開","phase":"フェーズ4: リリース","priority":"high","duration_days":2}]',
  '2024-01-01T00:00:00.000Z'
),
(
  'tmpl-study-01',
  '資格勉強',
  '参考書1冊〜試験合格までの学習フロー',
  'study',
  '[{"text":"試験範囲・出題傾向を調査する","phase":"準備","priority":"high","duration_days":1},{"text":"参考書・教材を揃える","phase":"準備","priority":"high","duration_days":1},{"text":"学習スケジュールを立てる","phase":"準備","priority":"mid","duration_days":1},{"text":"インプット学習（テキスト通読）","phase":"インプット","priority":"high","duration_days":14},{"text":"章末問題・確認テストを解く","phase":"インプット","priority":"high","duration_days":7},{"text":"苦手分野の集中復習","phase":"アウトプット","priority":"high","duration_days":5},{"text":"過去問1回分を解く（1回目）","phase":"アウトプット","priority":"high","duration_days":1},{"text":"過去問1回分を解く（2回目）","phase":"アウトプット","priority":"high","duration_days":1},{"text":"過去問1回分を解く（3回目）","phase":"アウトプット","priority":"high","duration_days":1},{"text":"間違えた問題の解説を読み込む","phase":"アウトプット","priority":"high","duration_days":3},{"text":"直前総復習・要点まとめ","phase":"直前","priority":"high","duration_days":2},{"text":"試験当日の持ち物・会場確認","phase":"直前","priority":"mid","duration_days":1}]',
  '2024-01-01T00:00:00.000Z'
),
(
  'tmpl-blog-01',
  'ブログ/記事執筆',
  '1記事の企画〜公開までのライティングフロー',
  'project',
  '[{"text":"テーマ・タイトル案を決める","phase":"企画","priority":"high","duration_days":1},{"text":"ターゲット読者・ゴールを定義する","phase":"企画","priority":"mid","duration_days":1},{"text":"構成（見出し）を作る","phase":"執筆準備","priority":"high","duration_days":1},{"text":"参考文献・一次情報を収集する","phase":"執筆準備","priority":"mid","duration_days":2},{"text":"本文を書く（下書き）","phase":"執筆","priority":"high","duration_days":3},{"text":"リード文・まとめを書く","phase":"執筆","priority":"high","duration_days":1},{"text":"見出し・読みやすさを見直す","phase":"編集","priority":"mid","duration_days":1},{"text":"誤字脱字・事実確認チェック","phase":"編集","priority":"high","duration_days":1},{"text":"アイキャッチ画像を用意する","phase":"公開準備","priority":"mid","duration_days":1},{"text":"SEOメタ情報を設定して公開する","phase":"公開準備","priority":"mid","duration_days":1}]',
  '2024-01-01T00:00:00.000Z'
),
(
  'tmpl-oss-01',
  'OSSライブラリ開発',
  'npmパッケージ公開までの開発フロー',
  'project',
  '[{"text":"ライブラリのスコープ・API設計","phase":"設計","priority":"high","duration_days":2},{"text":"リポジトリ・パッケージ初期化","phase":"開発","priority":"high","duration_days":1},{"text":"コア機能の実装","phase":"開発","priority":"high","duration_days":7},{"text":"エラーハンドリング・エッジケース対応","phase":"開発","priority":"mid","duration_days":3},{"text":"ユニットテストを書く","phase":"テスト","priority":"high","duration_days":4},{"text":"README・使用例を書く","phase":"ドキュメント","priority":"high","duration_days":2},{"text":"CHANGELOG・バージョニング設定","phase":"リリース準備","priority":"mid","duration_days":1},{"text":"npm publishで公開する","phase":"リリース準備","priority":"high","duration_days":1}]',
  '2024-01-01T00:00:00.000Z'
);
