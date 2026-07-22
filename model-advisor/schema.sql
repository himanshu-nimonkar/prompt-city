-- Model Arena store.
-- analyses: full /api/analyze responses (cache + history)
-- model_runs: per-model live measurements (real latency/tokens/$)

CREATE TABLE IF NOT EXISTS analyses (
  id          TEXT PRIMARY KEY,
  prompt_hash TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  task_type   TEXT,
  result_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hash ON analyses(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_time ON analyses(created_at);

CREATE TABLE IF NOT EXISTS model_runs (
  id            TEXT PRIMARY KEY,
  analysis_id   TEXT,
  model_id      TEXT NOT NULL,
  ok            INTEGER NOT NULL,
  latency_ms    REAL NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens  INTEGER NOT NULL,
  cost_usd      REAL NOT NULL,
  via           TEXT,
  error         TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_model ON model_runs(model_id);
CREATE INDEX IF NOT EXISTS idx_runs_time ON model_runs(created_at);
