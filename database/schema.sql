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
--
-- The location tables go last because BOTH users and items point at
-- `colleges`, and `colleges` points at `areas`, which points at
-- `cities`. Reverse the order and MySQL refuses with errno 3730.
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS colleges;
DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS cities;


-- ===============================================================
-- THE LOCATION TABLES: cities -> areas -> colleges
-- ===============================================================
-- WHY THREE TABLES INSTEAD OF THREE COLUMNS ON `items`?
--
-- The lazy version stores the text on every item:
--     items.city VARCHAR, items.area VARCHAR, items.college VARCHAR
-- and it breaks immediately, in ways that are hard to undo:
--
--   1. TYPOS BECOME NEW PLACES. "SKIT Jaipur", "S.K.I.T. Jaipur" and
--      "skit jaipur" are three different colleges as far as a text
--      column is concerned, so the browse page shows three entries
--      and each holds a fraction of the items.
--   2. RENAMING IS A MIGRATION. If a college changes its name you
--      must UPDATE every item row, and hope none were missed.
--   3. YOU CANNOT LIST THE OPTIONS. To fill the "choose your city"
--      dropdown you would run SELECT DISTINCT over the items table --
--      which means a city with no items yet simply does not exist,
--      and nobody can ever be the first to list something there.
--
-- With real tables an item stores ONE number (college_id). The name
-- lives in exactly one row, the dropdowns come from the location
-- tables rather than from the items, and a brand-new college works
-- before anyone has listed anything at all.
-- ===============================================================


-- ---------------------------------------------------------------
-- TABLE 1: cities
-- ---------------------------------------------------------------
CREATE TABLE cities (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  name  VARCHAR(100) NOT NULL,   -- 'Jaipur'
  state VARCHAR(100) NOT NULL,   -- 'Rajasthan'

  -- A URL-safe identifier: 'jaipur'. Kept so a future Phase can use
  -- /browse/jaipur instead of /browse/3 -- readable, shareable, and
  -- stable even if the row's id changes when the database is reseeded.
  slug  VARCHAR(120) NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_cities_slug (slug),

  -- Two cities CAN share a name across states (there is a Hyderabad
  -- in Telangana and one in Sindh), so the uniqueness rule is the
  -- PAIR, not the name alone.
  UNIQUE KEY uq_cities_name_state (name, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- TABLE 2: areas  (localities within a city)
-- ---------------------------------------------------------------
CREATE TABLE areas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  city_id INT UNSIGNED NOT NULL,
  name    VARCHAR(100) NOT NULL,   -- 'Jagatpura'
  slug    VARCHAR(120) NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_areas_city (city_id),

  -- Scoped to the city: 'Civil Lines' exists in both Jaipur and
  -- Delhi, and both are legitimate. Only a repeat WITHIN one city is
  -- a mistake.
  UNIQUE KEY uq_areas_city_name (city_id, name),
  UNIQUE KEY uq_areas_city_slug (city_id, slug),

  CONSTRAINT fk_areas_city
    FOREIGN KEY (city_id) REFERENCES cities(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- TABLE 3: colleges
-- ---------------------------------------------------------------
-- A college belongs to an AREA, and the area belongs to a city. The
-- city is therefore reachable by a JOIN and is NOT stored again here.
-- Storing city_id as well would allow the two to disagree -- a
-- college in a Jaipur area but with city_id pointing at Delhi -- and
-- there would be no way to tell which was right.
CREATE TABLE colleges (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  area_id INT UNSIGNED NOT NULL,

  name       VARCHAR(200) NOT NULL,  -- 'Swami Keshvanand Institute of Technology'
  short_name VARCHAR(60)  NOT NULL,  -- 'SKIT Jaipur'  (what the UI shows)
  slug       VARCHAR(220) NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_colleges_area (area_id),
  UNIQUE KEY uq_colleges_slug (slug),

  CONSTRAINT fk_colleges_area
    FOREIGN KEY (area_id) REFERENCES areas(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ===============================================================
-- TABLE 4: users
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

  -- The user's own campus. Used to pre-select the browse filters, so
  -- someone who has told us where they study does not have to pick
  -- their city, area and college again on every visit.
  --
  -- NULLABLE, deliberately. Registration (Phase 6) does not ask for a
  -- college, and making this NOT NULL would break every existing
  -- account and every existing test. "I have not said yet" is a real
  -- state and NULL is how you spell it.
  --
  -- ON DELETE SET NULL, not CASCADE: deleting a college must not
  -- delete the people who studied there.
  college_id INT UNSIGNED DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_college (college_id),

  CONSTRAINT fk_users_college
    FOREIGN KEY (college_id) REFERENCES colleges(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ENGINE=InnoDB is required for foreign keys and transactions.
-- The older MyISAM engine silently IGNORES foreign key definitions,
-- so you would think you had referential integrity when you did not.


-- ===============================================================
-- TABLE 5: items
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

  -- --- WHERE THIS ITEM IS -------------------------------------
  -- Two columns, doing two different jobs. This is the one place in
  -- the schema where storing "the same thing twice" is correct, so
  -- it is worth being precise about why.
  --
  -- college_id is the STRUCTURED fact, and the only thing filtering
  -- ever looks at. "Show me items at SKIT Jaipur" is
  -- `WHERE college_id = 4` -- an indexed integer comparison that
  -- cannot be defeated by a spelling difference.
  --
  -- location is the HUMAN SENTENCE printed on the card, e.g.
  -- 'Jagatpura, Jaipur'. It is not what we filter on.
  --
  -- Why keep it at all, when the area and city are reachable through
  -- college_id? Because college_id is NULLABLE: an item can be listed
  -- off-campus, or by an account created before colleges existed, and
  -- such an item still has to say where it is. `location` is the
  -- answer that always exists, which is why it stays NOT NULL.
  --
  -- The RULE, enforced in the model layer: filter on college_id,
  -- display the college when it is present and fall back to
  -- `location` when it is not. Never filter on the text.
  location VARCHAR(150) NOT NULL,

  -- ON DELETE SET NULL: removing a college from the directory must
  -- not delete people's listings. The item survives and falls back
  -- to its `location` text.
  college_id INT UNSIGNED DEFAULT NULL,

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

  -- The browse page's main query is "available items at THIS college,
  -- newest first". A COMPOSITE index covers all three parts in one
  -- structure, in the order the query uses them: narrow by college,
  -- narrow by status, then read out already sorted by date. Three
  -- separate single-column indexes cannot do that -- MySQL would pick
  -- one, then filter and re-sort the remainder by hand.
  KEY idx_items_college_status_created (college_id, status, created_at),

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
    ON UPDATE CASCADE,

  CONSTRAINT fk_items_college
    FOREIGN KEY (college_id) REFERENCES colleges(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ===============================================================
-- TABLE 6: requests
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
--
--
-- THE LOCATION CHAIN
-- ==================
--
--   cities          areas           colleges        items
--   ┌──────────┐    ┌──────────┐    ┌────────────┐  ┌────────────┐
--   │ id (PK)  │◄──┐│ id (PK)  │◄──┐│ id (PK)    │◄┐│ college_id │
--   │ name     │   └┤ city_id  │   └┤ area_id    │ ││ location   │
--   │ state    │    │ name     │    │ name       │ │└────────────┘
--   └──────────┘    └──────────┘    │ short_name │ │
--                                   └────────────┘ │  users
--                                                  │ ┌────────────┐
--                                                  └─┤ college_id │
--                                                    └────────────┘
--
--   cities 1 ──< N areas 1 ──< N colleges 1 ──< N items
--
-- This chain is what makes the browse flow possible:
--   pick a city   -> list its areas
--   pick an area  -> list its colleges
--   pick a college-> list its items
--
-- Each step is a single indexed lookup on a foreign key. And because
-- items.college_id and users.college_id BOTH point at the same
-- `colleges` row, "items at my college" needs no text matching at
-- all -- it is one integer comparison.
-- ===============================================================
