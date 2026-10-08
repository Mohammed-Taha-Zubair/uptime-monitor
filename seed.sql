-- Users (id is generated automatically by SERIAL)
-- The hashes are fake bcrypt-looking strings, only for development
INSERT INTO users (name, email, password_hash) VALUES
  ('John Doe', 'john@example.com', '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehash01'),
  ('Apple',    'apple@example.com', '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehash02');

-- Monitors (assumes a fresh schema, so the users have ids 1 and 2)
INSERT INTO monitors (user_id, name, url, interval_seconds, last_checked_at) VALUES
  (1, 'John Shop',  'https://johnshop.example.com', 60,   NOW() - INTERVAL '1 minute'),
  (2, 'Apple Site', 'https://apple.example.com',    3600, NOW() - INTERVAL '1 hour');

-- Monitor 1: up for 3 checks, then down for 3 checks (an outage)
INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at) VALUES
  (1, true,  200, 120,  NULL,                      NOW() - INTERVAL '8 minutes'),
  (1, true,  200, 135,  NULL,                      NOW() - INTERVAL '7 minutes'),
  (1, true,  200, 118,  NULL,                      NOW() - INTERVAL '6 minutes'),
  (1, false, 500, 90,   'Internal Server Error',   NOW() - INTERVAL '5 minutes'),
  (1, false, NULL, NULL, 'Timeout after 10000ms',  NOW() - INTERVAL '4 minutes'),
  (1, false, 503, 95,   'Service Unavailable',     NOW() - INTERVAL '3 minutes');

-- Monitor 2: healthy, checked hourly
INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at) VALUES
  (2, true, 200, 250, NULL, NOW() - INTERVAL '3 hours'),
  (2, true, 200, 240, NULL, NOW() - INTERVAL '2 hours'),
  (2, true, 200, 260, NULL, NOW() - INTERVAL '1 hour');

-- Incident: monitor 1 went down at its first failed check and is still down
INSERT INTO incidents (monitor_id, started_at, ended_at) VALUES
  (1, NOW() - INTERVAL '5 minutes', NULL);-- Users (id is generated automatically by SERIAL)
-- The hashes are fake bcrypt-looking strings, only for development
INSERT INTO users (name, email, password_hash) VALUES
  ('John Doe', 'john@example.com', '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehash01'),
  ('Apple',    'apple@example.com', '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehash02');

-- Monitors (assumes a fresh schema, so the users have ids 1 and 2)
INSERT INTO monitors (user_id, name, url, interval_seconds, last_checked_at) VALUES
  (1, 'John Shop',  'https://johnshop.example.com', 60,   NOW() - INTERVAL '1 minute'),
  (2, 'Apple Site', 'https://apple.example.com',    3600, NOW() - INTERVAL '1 hour');

-- Monitor 1: up for 3 checks, then down for 3 checks (an outage)
INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at) VALUES
  (1, true,  200, 120,  NULL,                      NOW() - INTERVAL '8 minutes'),
  (1, true,  200, 135,  NULL,                      NOW() - INTERVAL '7 minutes'),
  (1, true,  200, 118,  NULL,                      NOW() - INTERVAL '6 minutes'),
  (1, false, 500, 90,   'Internal Server Error',   NOW() - INTERVAL '5 minutes'),
  (1, false, NULL, NULL, 'Timeout after 10000ms',  NOW() - INTERVAL '4 minutes'),
  (1, false, 503, 95,   'Service Unavailable',     NOW() - INTERVAL '3 minutes');

-- Monitor 2: healthy, checked hourly
INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at) VALUES
  (2, true, 200, 250, NULL, NOW() - INTERVAL '3 hours'),
  (2, true, 200, 240, NULL, NOW() - INTERVAL '2 hours'),
  (2, true, 200, 260, NULL, NOW() - INTERVAL '1 hour');

-- Incident: monitor 1 went down at its first failed check and is still down
INSERT INTO incidents (monitor_id, started_at, ended_at) VALUES
  (1, NOW() - INTERVAL '5 minutes', NULL);

