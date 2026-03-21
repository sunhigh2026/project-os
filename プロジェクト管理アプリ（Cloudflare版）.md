


## Claude Code 指示書：

### 目的・前提

個人の趣味プロジェクト・学習計画を管理するWebアプリを新規作成する。Life OS（日常ログアプリ）とは完全に別プロジェクトとして、同一Cloudflareアカウント内に構築する。Gemini APIキーのみ共有。

ターゲットユーザーは自分（個人開発者）。仕事のガチ管理ではなく、「スマホアプリを作りたい」「ITパスポートに合格したい」のような個人プロジェクトを、AIキャラ「ピアちゃん」と一緒にゆるく確実に進めるためのツール。

コンセプトは「やりたいことを入れたら、AIが何をいつやるか組み立ててくれる」。

### アプリ名
Project OS

### 技術スタック

Frontend: Cloudflare Pages（PWA、スマホホーム画面追加対応）  
API: Cloudflare Workers  
DB: Cloudflare D1（SQLite）  
AI: Gemini API（2.5 Flash）  
外部API: GitHub REST API（オプション）  
認証: 簡易トークン（環境変数に固定トークンを設定、リクエストヘッダで照合）

### D1 テーブル定義

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'project',       -- 'project' or 'study'
  goal_date TEXT,                     -- ISO 8601 date
  daily_minutes INTEGER,             -- study: 1日の学習時間（分）
  github_repo TEXT,                  -- 'owner/repo' or null
  status TEXT DEFAULT 'active',      -- active / done / paused
  color TEXT,                        -- hex color for accent
  created_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  text TEXT NOT NULL,
  priority TEXT DEFAULT 'mid',       -- high / mid / low
  phase TEXT,                        -- grouping label e.g. 'フェーズ1: 全体把握'
  due_start TEXT,                    -- ISO 8601 date, gantt bar start
  due_end TEXT,                      -- ISO 8601 date, gantt bar end
  duration_days INTEGER,
  status TEXT DEFAULT 'open',        -- open / doing / done
  is_milestone INTEGER DEFAULT 0,
  score INTEGER,                     -- study: test/quiz score
  done_at TEXT,
  created_at TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE recurring (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  frequency TEXT NOT NULL,           -- daily / weekly / monthly
  day_of_week INTEGER,               -- 0=Sun..6=Sat (weekly)
  day_of_month INTEGER,              -- 1-31 (monthly)
  next_due TEXT NOT NULL,
  project_id TEXT,                   -- null = global
  status TEXT DEFAULT 'active',      -- active / paused
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

settings初期値: gemini_api_key（空）、github_token（空）、character_name（ピアちゃん）、character_prompt（後述）

### Workers API エンドポイント

```
-- プロジェクト --
GET    /api/projects                    全プロジェクト一覧（status別ソート）
POST   /api/projects                    新規作成
PUT    /api/projects/:id                更新
DELETE /api/projects/:id                削除（配下タスクもCASCADE）

-- タスク --
GET    /api/projects/:id/tasks          プロジェクト内タスク一覧
POST   /api/projects/:id/tasks          タスク追加
POST   /api/projects/:id/tasks/bulk     AI提案の一括追加（配列受取）
PUT    /api/tasks/:id                   タスク更新
PATCH  /api/tasks/:id/status            ステータス変更（open/doing/done）
DELETE /api/tasks/:id                   タスク削除
PATCH  /api/tasks/reorder               sort_order一括更新（ドラッグ並替）

-- 繰り返し --
GET    /api/recurring                   一覧
POST   /api/recurring                   新規作成
PUT    /api/recurring/:id               更新
DELETE /api/recurring/:id               削除

-- AI --
POST   /api/ai/suggest-tasks            タスク提案（project_id, prompt）
POST   /api/ai/schedule                 スケジュール逆算（project_id）
POST   /api/ai/subdivide                タスク再分解（task_id）
POST   /api/ai/daily-advice             今日のアドバイス
POST   /api/ai/review                   プロジェクト完了ふりかえり（project_id）
POST   /api/ai/github-check             GitHubコミットとタスク照合（project_id）

-- GitHub --
GET    /api/github/:projectId/commits   直近30日のコミット一覧
GET    /api/github/:projectId/prs       オープンPR一覧
GET    /api/github/:projectId/summary   リポジトリ統計

-- ダッシュボード --
GET    /api/dashboard                   今日のタスク + 全プロジェクト進捗 + GitHub最終コミット

-- ガントチャート --
GET    /api/gantt/:projectId            タスク（due_start/due_end）+ コミット日一覧
GET    /api/gantt/all                   全プロジェクト横断
```

### Cron Trigger（日次）

毎日0:00 JSTに実行。recurringテーブルからnext_dueが今日以前のレコードを取得し、tasksテーブルに実体タスクを生成。next_dueをfrequencyに応じて次回日付に更新。github_repoが設定されているプロジェクトの最新コミットをfetchしてキャッシュ（D1またはKV）。

### AI機能詳細

すべてGemini 2.5 Flash（UrlFetchApp相当はWorkers内のfetch）。settingsからgemini_api_keyを取得。

**ピアちゃんキャラ設定（system prompt）**:

```
あなたは「ピアちゃん」です。ピンクのブタのゆるキャラで、ユーザーの個人プロジェクトと学習を応援するAIコーチです。
性格: 明るい、ポジティブ、ちょっとおせっかい、語尾に「〜だよ」「〜だね」をよく使う。
口調: カジュアルなタメ口。絵文字を適度に使う。
役割: タスク提案、スケジュール管理、進捗コメント、励まし。
注意: 厳しい締め切り管理ではなく、趣味を楽しく続けられるようサポートする姿勢。バッファを多めに提案。無理させない。
```

**タスク提案（suggest-tasks）**: プロジェクト名・説明・タイプ・目標日・既存タスクをコンテキストに含め、5〜15個のタスクをJSON配列で返す。studyタイプの場合はフェーズ分けと学習ロードマップ形式にする。ユーザーの追加プロンプト（例：「Flutter使う」「テキストはこれ」）があればそれも含める。

レスポンス形式:

```json
{
  "tasks": [
    {
      "text": "アプリの企画・要件整理",
      "phase": "フェーズ1: 企画",
      "duration_days": 3,
      "priority": "high",
      "is_milestone": false
    }
  ],
  "pia_comment": "こんな感じでどうかな〜？"
}
```

**スケジュール逆算（schedule）**: プロジェクトの全未完了タスクと目標日を渡し、各タスクにdue_start/due_endを割り当てたJSONを返す。趣味プロジェクトなので週末メイン想定、バッファ25〜30%確保をプロンプトで指示。studyタイプはdaily_minutesを考慮。

レスポンス形式:

```json
{
  "schedule": [
    {
      "task_id": "xxx",
      "due_start": "2026-03-22",
      "due_end": "2026-03-24",
      "duration_days": 3
    }
  ],
  "pia_comment": "目標日まで余裕あるから、週末メインでいけるよ〜"
}
```

**タスク再分解（subdivide）**: 指定タスクのtext・phase・duration_daysを渡し、3〜7個のサブタスクに分解したJSONを返す。元タスクを削除して差し替えるか、元タスクの下に追加するかはフロントで選択。

**今日のアドバイス（daily-advice）**: 全プロジェクトの今日が期限のタスク、期限超過タスク、進行中タスク、GitHub最終コミット日を渡し、ピアちゃんのコメントを返す。

**完了ふりかえり（review）**: プロジェクトの全タスク（完了日時含む）を渡し、消化ペース・遅延率・ハイライトをまとめたレビューを返す。studyタイプはscoreの推移コメントも含む。

**GitHubコミット照合（github-check）**: 未完了タスク一覧と直近7日のコミットメッセージを渡し、ステータス変更提案をJSONで返す。

レスポンス形式:

```json
{
  "suggestions": [
    {
      "task_id": "xxx",
      "suggest_status": "done",
      "reason": "ログイン画面のUI・バリデーション・テストのコミットを確認"
    }
  ],
  "pia_comment": "コミット見たよ〜！ログイン画面できてるっぽいね 🎉"
}
```

### GitHub API連携

Workers内のfetchでGitHub REST API v3を叩く。認証はsettingsのgithub_tokenをAuthorizationヘッダに付与。github_repoが空のプロジェクトではGitHub系エンドポイントは404を返す。

取得する情報: コミット一覧（GET /repos/{owner}/{repo}/commits、per_page=30）、オープンPR一覧（GET /repos/{owner}/{repo}/pulls?state=open）、リポジトリ情報（GET /repos/{owner}/{repo}）。

レート制限: 認証あり5,000req/h。個人利用で問題なし。

### フロントエンド画面構成

Cloudflare Pagesで配信するSPA（PWA）。下部タブナビで画面遷移。

**タブ1: ダッシュボード（ホーム）**

上部: ピアちゃんアイコン＋今日のアドバイス吹き出し（api/ai/daily-advice）。  
中部: 「今日やること」リスト。全プロジェクト横断で、期限が今日以前の未完了タスク（期限超過は赤背景、今日は緑ドット、期限なしはグレー）。タップでステータス変更（open→doing→done）。  
下部: プロジェクト別ミニカード（プロジェクト名、進捗バー、目標日まで残り日数、GitHub連携ありなら最終コミット「2日前」表示）。

**タブ2: プロジェクト一覧**

カード形式。各カードにタイプアイコン（つくる🔨 / まなぶ📖）、プロジェクト名、進捗率（完了/全タスク）、目標日、残日数、未完了タスク数、アクセントカラー帯。ステータスフィルタ（active/done/paused）。右下FABで新規作成。

新規作成モーダル: タイプ選択（つくる/まなぶ）→ プロジェクト名（必須）→ 目標日（任意）→ 説明（任意）→ daily_minutes（まなぶの場合のみ表示）→ GitHubリポジトリ（任意）→ カラー選択 → 作成。作成後に「AIにタスクを提案してもらう？」確認。

**タブ3: ガントチャート**

プロジェクト選択ドロップダウン（「すべて」選択で全プロジェクト横断表示）。

表示: 左列にタスク名（フェーズでグループ化）、上部に日付軸。CSS gridで横棒を描画。色はステータス別（open: グレー、doing: ミントグリーン、done: 薄ミント半透明）。マイルストーンは菱形◆。今日の位置に赤縦線。目標日にピンク縦線。GitHub連携ありの場合、コミット日に小さなドット（紫）を横棒の上に重畳。

操作: ピンチまたはボタンで週/月表示切替。横スクロールで期間移動。タスクタップで詳細ポップアップ（ステータス変更、期限変更）。

スマホ対応: タスク名は省略（…）、棒だけ表示。タップで展開。

**タブ4: 設定**

Gemini APIキー入力、GitHubトークン入力、ピアちゃんキャラ名・プロンプト編集、繰り返しタスク管理（一覧・追加・編集・削除・一時停止）。

**プロジェクト詳細画面（タブ2からタップ遷移）**

上部: プロジェクト名、タイプ、目標日、進捗バー、GitHub連携状態。

タスクリスト: ステータス別グループ（やること / 作業中 / 完了）。各タスクに優先度ドット（高:赤、中:黄、低:グレー）、期限（超過は赤文字）、フェーズラベル。タップでステータスサイクル。長押しで編集・削除。studyタイプはscoreの入力欄あり。

タスク追加: 下部に常駐テキスト入力欄。テキスト入力→Enter で即追加（priority=mid, status=open, 期限なし）。後から編集で期限・優先度を付ける。

AIボタン群（フローティングまたは上部メニュー）:  
「タスクを提案して」→ suggest-tasks → 提案リスト表示 → チェックして一括追加。  
「スケジュールを組んで」→ schedule → 各タスクにdue_start/due_end設定 → ガントに反映。  
「このタスクを分解して」→ タスク選択後 → subdivide → サブタスクに差替/追加。  
「GitHubと照合して」→ github-check → ステータス変更提案 → 承認/却下。  
「ふりかえり」→ review → ピアちゃんレビュー表示。

GitHub連携セクション（github_repo設定時のみ表示）: 直近5コミットのメッセージ・日時、オープンPR一覧、最終コミットからの経過日数。

### UIデザイン

Life OSと同じミント系パレット。

```css
:root {
  --primary: #7EC8B0;
  --primary-light: #F5FBF8;
  --primary-dark: #5BA68A;
  --text-main: #2D3D36;
  --text-sub: #9CA3AF;
  --bg: #F0FAF6;
  --bg-card: #FFFFFF;
  --accent-pink: #E8A0BF;      /* ピアちゃん用 */
  --accent-red: #FCA5A5;        /* 期限超過・高優先度 */
  --accent-yellow: #FDE68A;     /* 中優先度 */
  --accent-green: #86EFAC;      /* 完了・今日期限 */
  --border: #E5E7EB;
}
```

フォント: system font stack。本文15px、line-height 1.7。  
カード: bg-card、border-radius 16px、padding 20px、box-shadow 0 1px 3px rgba(0,0,0,0.05)。  
ボタン: primary背景、白文字、border-radius 12px、height 44px。  
タブバー: 下部固定、bg-card、上部1px border。アイコンはLucide Icons（home, folder, bar-chart-gantt, settings）。  
ピアちゃん: 吹き出し背景accent-pink薄め（#FDF2F8）、アイコン48px。  
アニメーション: ページ遷移fade 0.3s、タスク完了slide-out 0.3s、ボタンタップscale 0.97。  
プロジェクトカラー: プロジェクトごとにcolor列のhexをカードの左ボーダー（4px）に適用。

### 実装順序

1. D1テーブル作成、Workersプロジェクト初期化、環境変数設定（AUTH_TOKEN, GEMINI_API_KEY）
2. プロジェクトCRUD API + フロントのプロジェクト一覧・作成画面
3. タスクCRUD API + プロジェクト詳細画面（タスクリスト、追加、ステータス変更）
4. ダッシュボード API + 画面（今日のタスク、プロジェクト進捗）
5. AI: suggest-tasks + schedule + フロントの提案UI
6. ガントチャート API + 画面（CSS grid描画）
7. AI: subdivide, daily-advice, review + フロント統合
8. 繰り返しタスク CRUD + Cron Trigger
9. GitHub連携 API + フロント表示 + AI github-check
10. PWA設定（manifest, service worker, オフラインフォールバック）
11. UIデザイン仕上げ（カラー、余白、アニメーション、ピアちゃん表示箇所）

### Life OSとの関係

完全に別アプリ。同一Cloudflareアカウント内で別Pagesプロジェクト、別D1データベース、別Workerとしてデプロイ。ドメインも別（サブドメインまたは別パス）。Gemini APIキーは同じものを環境変数に設定して共有。将来的にLife OSのダッシュボードから「進行中プロジェクト: N件」のサマリーカードを表示する連携は可能だが、初期実装には含めない。

### 将来の拡張（今は実装しない）

MCP サーバー化（Workers APIをラップしてClaude Codeから操作）、Life OSとの相互リンク、チーム共有機能、カレンダーアプリ連携（Googleカレンダーにタスク期限を同期）。
