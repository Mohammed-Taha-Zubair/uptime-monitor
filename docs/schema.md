**user signup and login**

user needs to create account using:
    name,
    email,
    password
use middeleware, for authentiction signup/signin express endpoints, use jwt for creating auth middleware
for pass bcrypt it uses salt and hashes passwords i know about this library

**DATABASE**

Create table users;
insert into users values(ID primarykey, name varchar(20), email varchar(20), password varchar(20));

create table monitors;
insert into monitors values(monitor_id forenkey reference user.id, Id primarykey, monitor_name string, created_at datetime, urls string, time datetime)
<!-- monitor due to check data type boolean -->


CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(50)  NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO users (id, name, email, password_hash, created_at)
VALUES (1, 'John Doe', 'john.doe@example.com', "kjbjnvdfknsjhsjdfiabwfi", 1-2-3010),
       (2, 'apple', 'apple.doe@example.com', "ksdvjakvjndksnflajljg", 1-8-3010);

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

INSERT INTO monitors (id, user_id, name, url, interval_seconds, is_active, last_checked_at, created_at)
VALUES (11, 1, 'John Doe', 'ww.jondeo.com', 60, yes, 29-1-3010 ,1-2-3010),
       (22, 2, 'apple', 'ww.apple.com', 600, yes, 29-7-3010, 1-8-3010);

CREATE TABLE check_results (
  id          BIGSERIAL PRIMARY KEY,
  monitor_id  INTEGER     NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  is_up       BOOLEAN     NOT NULL,
  status_code INTEGER,
  response_ms INTEGER,
  error       TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO check_results (id, monitor_id, is_up, status_code, response_ms, error, checked_at)
VALUES (111, 11, true, 202, 120, "xz-comp broke",1-2-3010),
       (161, 11, false, , , "xz-comp broke",1-2-3010),
       (531, 11, false, 202, 120, "xz-comp broke",1-2-3010),
       (131, 11, false, , , "xz-comp broke",1-2-3010),
       (245, 22, true, 200, 250, null, 1-8-3010)
       (223, 22, true, 200, 250, null, 1-8-3010)
       (289, 22, true, 200, 250, null, 1-8-3010)
       (227, 22, true, 200, 250, null, 1-8-3010)
       (212, 22, true, 200, 250, null, 1-8-3010)
       (222, 22, true, 200, 200, "yz-compborke", 1-8-3010);


CREATE TABLE incidents (
  id          SERIAL PRIMARY KEY,
  monitor_id  INTEGER     NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ
);


INSERT INTO incidents (id, monitor_id, started_at, ended_at)
VALUES (11, 1, broken date, null aggrigated when fixed);
