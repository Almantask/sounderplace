CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  name TEXT,
  email TEXT,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('bug', 'idea', 'question', 'other')),
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX feedback_created_at_idx ON feedback(created_at);
