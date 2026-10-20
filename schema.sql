CREATE TABLE IF NOT EXISTS courses (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 draft_json TEXT NOT NULL,
 published_json TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);