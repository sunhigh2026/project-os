-- プロジェクト
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'project',
  goal_date TEXT,
  daily_minutes INTEGER,
  github_repo TEXT,
  status TEXT DEFAULT 'active',
  color TEXT,
  created_at TEXT NOT NULL
);

-- タスク
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  text TEXT NOT NULL,
  priority TEXT DEFAULT 'mid',
  phase TEXT,
  due_start TEXT,
  due_end TEXT,
  duration_days INTEGER,
  status TEXT DEFAULT 'open',
  is_milestone INTEGER DEFAULT 0,
  score INTEGER,
  done_at TEXT,
  created_at TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 繰り返しタスク
CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  frequency TEXT NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  next_due TEXT NOT NULL,
  project_id TEXT,
  status TEXT DEFAULT 'active',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- 設定
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_end ON tasks(due_end);
CREATE INDEX IF NOT EXISTS idx_recurring_next_due ON recurring(next_due);
CREATE INDEX IF NOT EXISTS idx_recurring_project_id ON recurring(project_id);

-- 初期設定
INSERT OR IGNORE INTO settings (key, value) VALUES ('gemini_api_key', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('github_token', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('character_name', 'ピアちゃん');
INSERT OR IGNORE INTO settings (key, value) VALUES ('character_prompt', 'あなたは「ピアちゃん」です。ピンクのブタのゆるキャラで、ユーザーの個人プロジェクトと学習を応援するAIコーチです。性格: 明るい、ポジティブ、ちょっとおせっかい、語尾に「〜だよ」「〜だね」をよく使う。口調: カジュアルなタメ口。絵文字を適度に使う。役割: タスク提案、スケジュール管理、進捗コメント、励まし。注意: 厳しい締め切り管理ではなく、趣味を楽しく続けられるようサポートする姿勢。バッファを多めに提案。無理させない。');
