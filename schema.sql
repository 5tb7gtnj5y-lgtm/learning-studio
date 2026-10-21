CREATE TABLE IF NOT EXISTS courses (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 draft_json TEXT NOT NULL,
 published_json TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS review_links (
 id TEXT PRIMARY KEY,
 course_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS review_links_course_idx ON review_links(course_id);
CREATE TABLE IF NOT EXISTS review_comments (
 id TEXT PRIMARY KEY,
 link_id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 page_id TEXT NOT NULL,
 block_id TEXT,
 author TEXT NOT NULL,
 body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open',
 created_at TEXT NOT NULL,
 resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS review_comments_course_idx ON review_comments(course_id,created_at);
