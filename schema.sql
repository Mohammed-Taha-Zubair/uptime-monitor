-- Dev reset: safe now because there's no real data yet
DROP TABLE IF EXISTS incidents, check_results, monitors, users CASCADE;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(50)  NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE monitors (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(100) NOT NULL,
  url              TEXT         NOT NULL,
  interval_seconds INTEGER      NOT NULL CHECK (interval_seconds IN (60, 3600, 86400)),
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_checked_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE check_results (
  id          BIGSERIAL PRIMARY KEY,
  monitor_id  INTEGER     NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  is_up       BOOLEAN     NOT NULL,
  status_code INTEGER,
  response_ms INTEGER,
  error       TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_check_results_monitor_time
  ON check_results (monitor_id, checked_at);

CREATE TABLE incidents (
  id          SERIAL PRIMARY KEY,
  monitor_id  INTEGER     NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ
);