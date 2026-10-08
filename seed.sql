-- Development Seed Data
-- Assumes a fresh schema created via schema.sql

-- 1. Users
-- Password hashes are placeholder bcrypt strings for local development
INSERT INTO users (name, email, password_hash) VALUES
  ('John Doe',   'john@example.com',  '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehash01'),
  ('Sarah Connor', 'sarah@example.com', '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehash02');

-- 2. Monitors
INSERT INTO monitors (user_id, name, url, interval_seconds, is_active, last_checked_at) VALUES
  (1, 'Production API', 'https://httpbin.org/status/200', 60,   true, NOW() - INTERVAL '1 minute'),
  (1, 'Payment Gateway', 'https://httpbin.org/status/500', 60,   true, NOW() - INTERVAL '1 minute'),
  (2, 'Customer Portal', 'https://httpbin.org/delay/1',    3600, true, NOW() - INTERVAL '1 hour');

-- 3. Check Results (Time-Series Probes)
-- Monitor 1: Healthy sequence
INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at) VALUES
  (1, true, 200, 115, NULL, NOW() - INTERVAL '5 minutes'),
  (1, true, 200, 122, NULL, NOW() - INTERVAL '4 minutes'),
  (1, true, 200, 118, NULL, NOW() - INTERVAL '3 minutes'),
  (1, true, 200, 130, NULL, NOW() - INTERVAL '2 minutes'),
  (1, true, 200, 120, NULL, NOW() - INTERVAL '1 minute');

-- Monitor 2: Outage sequence (3 successes, followed by persistent 500/timeout failure)
INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at) VALUES
  (2, true,  200, 140,  NULL,                     NOW() - INTERVAL '10 minutes'),
  (2, true,  200, 135,  NULL,                     NOW() - INTERVAL '9 minutes'),
  (2, false, 500, 85,   'Internal Server Error',  NOW() - INTERVAL '8 minutes'),
  (2, false, 500, 92,   'Internal Server Error',  NOW() - INTERVAL '7 minutes'),
  (2, false, NULL, NULL, 'Timeout after 10000ms', NOW() - INTERVAL '6 minutes');

-- Monitor 3: Periodic hourly checks
INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at) VALUES
  (3, true, 200, 245, NULL, NOW() - INTERVAL '3 hours'),
  (3, true, 200, 238, NULL, NOW() - INTERVAL '2 hours'),
  (3, true, 200, 252, NULL, NOW() - INTERVAL '1 hour');

-- 4. Incidents
-- Monitor 2: Active (unresolved) incident opened 8 minutes ago when failure began
INSERT INTO incidents (monitor_id, started_at, ended_at) VALUES
  (2, NOW() - INTERVAL '8 minutes', NULL);

-- Monitor 1: Past historical incident that was successfully resolved yesterday
INSERT INTO incidents (monitor_id, started_at, ended_at) VALUES
  (1, NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours 45 minutes');
