-- ==============================
-- migration-v3: 学習機能強化
-- ==============================

-- 学習セッション（ストップウォッチ）
CREATE TABLE IF NOT EXISTS study_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER,
  tag TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_study_sessions_project_id ON study_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_date ON study_sessions(date);

-- タスクに復習フラグ追加
ALTER TABLE tasks ADD COLUMN review_flag INTEGER DEFAULT 0;

-- プロジェクトに目標総学習時間追加
ALTER TABLE projects ADD COLUMN total_goal_hours REAL;
