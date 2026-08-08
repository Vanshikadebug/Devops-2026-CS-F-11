-- ===============================================================
-- ReuseHub -- DATABASE SCHEMA
--
-- WHAT IS THIS FILE?
-- The complete definition of the database structure: every table,
-- column, key and index. Running it creates the database from
-- nothing.
--
-- WHY KEEP THE SCHEMA IN A FILE INSTEAD OF CLICKING IN WORKBENCH?
-- Three reasons that matter for a DevOps project:
--   1. It is VERSION CONTROLLED. Every structural change is in git
--      history, next to the code that depends on it.
--   2. It is REPRODUCIBLE. A teammate, a fresh laptop, or the
--      Docker MySQL container in Phase 13 all run this one file and
--      get an identical database. Clicking through a GUI is not
--      repeatable and cannot be reviewed.
--   3. It is AUTOMATABLE. Phase 13 mounts this file so the MySQL
--      container builds itself on first start, with no manual step.
--
-- HOW TO RUN IT:
--   "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database/schema.sql
-- ===============================================================

-- Create the database only if it is not already there, so re-running
-- this file is safe.
-- utf8mb4 is the character set: it stores the FULL Unicode range,
-- including emoji and every Indian language script. The older
-- "utf8" in MySQL is a 3-byte subset that CANNOT store emoji and
-- throws "Incorrect string value" errors -- a classic trap.
CREATE DATABASE IF NOT EXISTS reusehub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE reusehub;

-- Drop in reverse dependency order. `requests` references `items`,
-- which references `users`, so children must go first -- a foreign
-- key will refuse to let you drop a parent that is still referenced.
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS users;


-- ===============================================================
-- TABLE 1: users
-- ===============================================================
CREATE TABLE users (
  -- INT UNSIGNED: no negative IDs, doubling the positive range.
  -- AUTO_INCREMENT: MySQL assigns the next number automatically.
  -- PRIMARY KEY: uniquely identifies a row, and is indexed, so
  -- lookups by id are fast.
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  name VARCHAR(100) NOT NULL,

  -- UNIQUE is what makes "email already registered" reliable.
  -- The check happens in the DATABASE, not in application code.
  -- That distinction matters: two users registering at the exact
  -- same instant could both pass an application-level "does this
  -- email exist?" check and both insert. The database constraint
  -- cannot be raced -- the second INSERT fails with ER_DUP_ENTRY,
  -- which our errorHandler already maps to a 409.
  email VARCHAR(255) NOT NULL,

  mobile VARCHAR(15) NOT NULL,

  -- Long enough for a bcrypt hash, which is always 60 characters
  -- ($2a$10$ + 53 chars). Sized at 255 to leave room if we ever
  -- change algorithm.
  -- NOTE: this column NEVER contains a plain-text password. Phase 6
  -- hashes with bcrypt before the value ever reaches this table.
  password VARCHAR(255) NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ENGINE=InnoDB is required for foreign keys and transactions.
-- The older MyISAM engine silently IGNORES foreign key definitions,
-- so you would think you had referential integrity when you did not.


-- ===============================================================
-- TABLE 2: items
-- ===============================================================
CREATE TABLE items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- The FOREIGN KEY column: which user listed this item.
  -- Its type MUST match users.id exactly (INT UNSIGNED), or MySQL
  -- rejects the constraint with a confusing errno 150.
  user_id INT UNSIGNED NOT NULL,

  name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,

  -- ENUM restricts the column to a fixed list. An invalid category
  -- is rejected by the database itself, so a bug in the API can
  -- never write "Bookss" into this column.
  -- These values MUST stay in sync with CATEGORIES in
  -- frontend/src/utils/constants.js
  category ENUM('Books','Electronics','Clothing','Furniture','Stationery','Other')
    NOT NULL,

  -- >>> NAMED item_condition, NOT condition. <<<
  -- CONDITION is a RESERVED WORD in MySQL (it belongs to stored
  -- procedure syntax). A column called `condition` must be wrapped
  -- in backticks in EVERY query forever, and one forgotten pair
  -- causes a syntax error that is genuinely hard to spot.
  -- The API still exposes this field as "condition" -- the model
  -- layer aliases it -- so the frontend is unaffected.
  item_condition ENUM('New','Like New','Good','Fair','Poor') NOT NULL,

  location VARCHAR(150) NOT NULL,

  -- Nullable: an item without a picture is perfectly valid.
  -- NULL means "no image", which is different from an empty string.
  image_url VARCHAR(500) DEFAULT NULL,

  status ENUM('Available','Reserved','Unavailable')
    NOT NULL DEFAULT 'Available',

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- --- INDEXES -------------------------------------------------
  -- An index is a lookup structure, like the index at the back of a
  -- textbook. Without one, MySQL reads EVERY row to find matches (a
  -- "full table scan"). With 20 demo rows that is invisible; with
  -- 100,000 rows it is the difference between 2ms and 2 seconds.
  -- We index the columns we actually filter and sort by in Phase 9.
  KEY idx_items_user      (user_id),
  KEY idx_items_status    (status),
  KEY idx_items_category  (category),
  KEY idx_items_created   (created_at),

  -- A FULLTEXT index powers real word-based search across two
  -- columns at once. Phase 9 uses it so searching "study desk"
  -- ranks by relevance instead of doing a slow LIKE '%...%' scan.
  FULLTEXT KEY ft_items_search (name, description),

  -- --- FOREIGN KEY ---------------------------------------------
  -- Guarantees every items.user_id points at a real users.id row.
  -- Without it, deleting a user would leave "orphan" items owned by
  -- a person who no longer exists.
  --
  -- ON DELETE CASCADE: delete a user -> their items are deleted too.
  --   Chosen because an item with no owner is meaningless, and the
  --   owner is the only person who can manage it.
  -- ON UPDATE CASCADE: if a user id ever changed, items follow.
  CONSTRAINT fk_items_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ===============================================================
-- TABLE 3: requests
-- ===============================================================
-- This is a JOIN TABLE (also called a junction or link table).
-- It expresses a many-to-many relationship:
--   one user can request many items,
--   one item can be requested by many users.
-- Neither `users` nor `items` can hold that on its own, so the
-- relationship gets its own table.
CREATE TABLE requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  item_id      INT UNSIGNED NOT NULL,   -- which item is wanted
  requester_id INT UNSIGNED NOT NULL,   -- who is asking for it

  -- Optional note: "Could I collect this on Saturday?"
  message VARCHAR(500) DEFAULT NULL,

  status ENUM('Pending','Accepted','Rejected')
    NOT NULL DEFAULT 'Pending',

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- >>> THE MOST IMPORTANT CONSTRAINT IN THIS FILE <<<
  -- One user may request one item only ONCE. Without this, a user
  -- could click "Request Item" ten times (or double-click once on a
  -- slow connection) and flood the owner with ten identical rows.
  -- Enforcing it here is airtight: even a buggy API, a replayed
  -- request, or two simultaneous clicks cannot get past it.
  UNIQUE KEY uq_requests_item_requester (item_id, requester_id),

  KEY idx_requests_item      (item_id),
  KEY idx_requests_requester (requester_id),
  KEY idx_requests_status    (status),

  CONSTRAINT fk_requests_item
    FOREIGN KEY (item_id) REFERENCES items(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_requests_requester
    FOREIGN KEY (requester_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ===============================================================
-- RELATIONSHIP SUMMARY
-- ===============================================================
--
--   users                items               requests
--   ┌──────────┐         ┌──────────┐        ┌──────────────┐
--   │ id (PK)  │────┐    │ id (PK)  │───┐    │ id (PK)      │
--   │ name     │    │    │ user_id  │◄──┘    │ item_id      │◄─┐
--   │ email(U) │    └───►│ name     │    ┌──►│ requester_id │  │
--   │ mobile   │         │ category │    │   │ status       │  │
--   │ password │         │ status   │    │   └──────────────┘  │
--   └──────────┘         └──────────┘    │                     │
--        │                     │         │                     │
--        └─────────────────────┼─────────┘                     │
--          a user makes many   └───────────────────────────────┘
--          requests              an item receives many requests
--
--   users  1 ──< N  items      "one user lists many items"
--   users  1 ──< N  requests   "one user makes many requests"
--   items  1 ──< N  requests   "one item receives many requests"
--
--   users <──> items  is many-to-many THROUGH requests.
--
-- Note that `users` connects to `requests` by TWO different paths:
--   - directly, as the requester
--   - indirectly, as the owner of the requested item
-- That is exactly how Phase 10 separates "requests I sent" from
-- "requests I received".
-- ===============================================================
