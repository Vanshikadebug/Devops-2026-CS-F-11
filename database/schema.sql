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
--
-- The three admin tables are dropped FIRST for the same reason: all
-- three reference `users` (audit_logs.admin_id, reports.reporter_id,
-- platform_settings.updated_by), and reports also references `items`.
DROP TABLE IF EXISTS platform_settings;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS reports;
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

  -- --- ADMIN-EDITABLE PRESENTATION FIELDS ----------------------
  -- Both NULLABLE and both added by the admin panel. NULL is the
  -- honest default and the seed leaves them that way on purpose: we
  -- do not have a verified description or a licensed photograph for
  -- every campus, and inventing either would put wrong information
  -- about a real institution on the site. An admin fills these in
  -- when they actually know the answer.
  description VARCHAR(1000) DEFAULT NULL,
  image_url   VARCHAR(500)  DEFAULT NULL,

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

  -- --- AUTHORIZATION ------------------------------------------
  -- >>> THIS COLUMN IS THE ENTIRE ADMIN PERMISSION SYSTEM <<<
  --
  -- Four roles, in increasing order of power:
  --   user         the default. No admin access whatsoever.
  --   moderator    may review content. May NOT touch accounts.
  --   admin        may manage accounts, content and locations.
  --   super_admin  may additionally CHANGE ROLES.
  --
  -- WHY A COLUMN ON `users` AND NOT A SEPARATE `admins` TABLE?
  -- A second table would mean an admin has two identities -- two
  -- rows, two ids, two passwords, two places to get out of sync --
  -- and every query that asks "who listed this item?" would have to
  -- know which table to look in. An admin is a user who can do more,
  -- not a different kind of being. One column says exactly that.
  --
  -- DEFAULT 'user' IS A SECURITY DECISION, NOT A CONVENIENCE.
  -- Registration (authController.register) never mentions this
  -- column, so a new account gets 'user' from the DATABASE, not from
  -- application code that could be bypassed. There is no code path
  -- that inserts a role at signup, which means a crafted registration
  -- body -- {"name":"x","role":"admin"} -- has nowhere to land. That
  -- is privilege escalation prevented by the shape of the schema
  -- rather than by a filter someone has to remember to write.
  --
  -- ENUM, not VARCHAR: MySQL itself rejects 'administrator',
  -- 'ADMIN' or any typo. A role column that can hold an unrecognised
  -- string is a role column that fails open the moment a comparison
  -- is written as `role !== 'user'`.
  role ENUM('user','moderator','admin','super_admin')
    NOT NULL DEFAULT 'user',

  -- Whether this account may sign in and act.
  -- 'blocked' is REVERSIBLE, which is precisely why it exists: the
  -- alternative to a block is deletion, and deletion CASCADES to
  -- every item the person listed. An admin dealing with a spammer
  -- needs to stop them without destroying evidence, and needs to be
  -- able to undo a mistake. protect.js refuses a blocked account, so
  -- the block takes effect on the very next request rather than when
  -- their 7-day token happens to expire.
  status ENUM('active','blocked') NOT NULL DEFAULT 'active',

  -- Set by authController.login. NULL means "has never logged in",
  -- which is a real and useful state for an admin looking at an
  -- account -- distinct from "logged in long ago".
  last_login_at TIMESTAMP NULL DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_college (college_id),

  -- The admin user table is filtered and sorted by these two on
  -- every page load, so both are indexed.
  KEY idx_users_role (role),
  KEY idx_users_status (status),

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

  -- --- MODERATION ----------------------------------------------
  -- >>> WHY THIS IS A SECOND COLUMN AND NOT MORE VALUES IN `status` <<<
  --
  -- The admin panel needs to know whether a listing is allowed to be
  -- on the site. The obvious move is to add 'Pending', 'Rejected' and
  -- 'Hidden' to the ENUM above. That is wrong, and it is worth being
  -- precise about why, because it looks like the tidier option.
  --
  -- `status` answers a question the OWNER controls:
  --     is this thing still up for grabs?     Available / Reserved / Unavailable
  --
  -- This column answers a question the MODERATOR controls:
  --     may this listing be shown at all?     Pending / Approved / Rejected / Hidden
  --
  -- Those are INDEPENDENT facts, and every combination of them is
  -- meaningful. An item can be Reserved and Approved (normal), or
  -- Available and Hidden (visible to nobody, though its owner still
  -- considers it up for grabs). Collapsing two independent facts into
  -- one column forces them to be mutually exclusive, so approving a
  -- reserved item would have to FORGET that it was reserved. There is
  -- no value of a single ENUM that can express both.
  --
  -- The practical consequence, and the reason this is not a
  -- theoretical objection: `status` is already read and written by
  -- PATCH /api/items/:id/status, by every item filter, by the
  -- dashboard's counts, by the frontend's STATUS_VARIANTS map, and by
  -- 183 passing tests. Adding values to it would change the meaning
  -- of data those all depend on. A new column changes the meaning of
  -- nothing.
  --
  -- >>> WHY DEFAULT 'Approved' AND NOT 'Pending' <<<
  -- Because this column is being added to a table that already holds
  -- rows. A DEFAULT of 'Pending' would instantly un-publish every
  -- existing listing on the site the moment the migration ran -- a
  -- schema change that silently empties the home page.
  --
  -- Whether NEW items start Pending is therefore NOT decided here. It
  -- is decided by the `require_item_approval` row in
  -- platform_settings, which an admin can switch on. Default off, so
  -- the behaviour built in Phase 8 is exactly preserved until someone
  -- deliberately chooses otherwise. See itemController.create.
  moderation_status ENUM('Pending','Approved','Rejected','Hidden')
    NOT NULL DEFAULT 'Approved',

  -- Who acted, when, and why. NULL across all three means "no
  -- moderator has ever touched this row", which is the state of every
  -- item that was simply approved by default.
  --
  -- ON DELETE SET NULL, not CASCADE: deleting an admin account must
  -- not delete the items they once reviewed. The audit trail in
  -- audit_logs keeps the name; this column keeps the live link.
  moderated_by      INT UNSIGNED  DEFAULT NULL,
  moderated_at      TIMESTAMP     NULL DEFAULT NULL,

  -- The reason shown to the owner when their listing is rejected.
  -- Rejecting without a reason is not a moderation decision, it is a
  -- disappearance -- so the API requires this field on reject.
  moderation_reason VARCHAR(500)  DEFAULT NULL,

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

  -- The moderation queue is "every Pending item, oldest first" -- the
  -- one screen an admin opens most and the one query that must not
  -- table-scan as the site grows.
  KEY idx_items_moderation (moderation_status),

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
    ON UPDATE CASCADE,

  CONSTRAINT fk_items_moderator
    FOREIGN KEY (moderated_by) REFERENCES users(id)
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
-- TABLE 7: audit_logs        (added by the admin panel)
-- ===============================================================
-- Every administrative action writes one row here, before the
-- response is sent. This is the table that answers "who blocked this
-- user, and when, and why" three months later.
--
-- >>> WHY THIS TABLE BREAKS TWO RULES THE REST OF THE SCHEMA KEEPS <<<
-- Read the two decisions below together with the `reports` table that
-- follows it -- reports makes the OPPOSITE choice on both, on purpose.
-- The difference is not inconsistency; it is what the two tables are
-- for.
--
--   1. NO FOREIGN KEY ON THE TARGET.
--      target_type/target_id is a "polymorphic" pointer: ('item', 47)
--      or ('user', 12). MySQL cannot constrain that, and here that is
--      the POINT. The single most important thing this table records
--      is a deletion -- "admin 3 deleted item 47" -- and item 47 does
--      not exist by the time the row is written. A foreign key would
--      make it impossible to log exactly the actions that most need
--      logging.
--
--   2. THE ADMIN'S EMAIL IS COPIED IN, not just referenced.
--      Duplicating data is normally a bug. An audit trail is the one
--      place it is required: if the admin account is later deleted,
--      admin_id goes NULL (SET NULL, never CASCADE -- a log that
--      vanishes when its author leaves is not a log) and without the
--      copied email the row becomes "somebody did this". The email is
--      a SNAPSHOT of who acted at that moment, which is the fact
--      being recorded. It is deliberately not kept in sync.
--
-- Rows here are INSERT-ONLY. No API path updates or deletes them --
-- there is no endpoint for it, by design.
CREATE TABLE audit_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  admin_id    INT UNSIGNED DEFAULT NULL,   -- NULL once the account is gone
  admin_email VARCHAR(255) NOT NULL,       -- the snapshot; see above

  -- A machine-readable verb: 'user.block', 'item.reject',
  -- 'college.update', 'settings.update'. Lower-case, dot-separated,
  -- always <noun>.<verb> so the list groups sensibly when sorted.
  action VARCHAR(60) NOT NULL,

  target_type ENUM('user','item','college','city','area','report','setting','category')
    NOT NULL,
  target_id   INT UNSIGNED DEFAULT NULL,   -- NULL for site-wide changes

  -- A human sentence written at the time of the action, e.g.
  -- "Blocked user priya@example.com (repeated spam listings)".
  -- Stored rather than generated on read, because the wording depends
  -- on values that may no longer exist.
  description VARCHAR(500) NOT NULL,

  -- >>> WHAT MUST NEVER LAND IN THIS COLUMN <<<
  -- JSON snapshot of what changed, e.g. {"role":["user","admin"]}.
  -- The writer STRIPS password, password_hash and token keys before
  -- storing. An audit log is read by more people than the users table
  -- ever is, so a hash leaking into it is worse than not logging.
  changes JSON DEFAULT NULL,

  -- Requests can arrive through a proxy, so this is best-effort
  -- evidence, not identification. VARCHAR(45) fits a full IPv6 address.
  ip_address VARCHAR(45) DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- The activity page is "newest first", optionally narrowed to one
  -- admin or one kind of target.
  KEY idx_audit_created (created_at),
  KEY idx_audit_admin   (admin_id),
  KEY idx_audit_action  (action),
  KEY idx_audit_target  (target_type, target_id),

  CONSTRAINT fk_audit_admin
    FOREIGN KEY (admin_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ===============================================================
-- TABLE 8: reports           (added by the admin panel)
-- ===============================================================
-- A normal user flags an item or another user; a moderator works
-- through the queue. This is the only new table with a user-facing
-- write endpoint (POST /api/reports).
--
-- >>> WHY THIS DOES *NOT* USE THE POLYMORPHIC SHAPE ABOVE <<<
-- A report also points at "an item or a user", so copying
-- audit_logs' target_type/target_id looks obvious. It is wrong here,
-- and the reason is the opposite of the reason it was right there.
--
-- A report is a LIVE work item: the moderator has to open the thing
-- being reported and judge it. So the row is worthless if it points
-- at something that no longer exists -- and with a polymorphic
-- pointer, nothing stops that. Two nullable columns with real
-- foreign keys let the database guarantee the target is real, and
-- CASCADE means deleting a spam listing clears its reports along
-- with it, which is exactly right: the complaint was resolved by the
-- deletion.
--
-- Audit logs must outlive their target. Reports must not.
CREATE TABLE reports (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  reporter_id INT UNSIGNED NOT NULL,

  -- EXACTLY ONE of these two is set. Enforced by the two triggers
  -- after this table, not by trusting the API -- see the long note
  -- further down for why it is a trigger and not a CHECK constraint.
  reported_item_id INT UNSIGNED DEFAULT NULL,
  reported_user_id INT UNSIGNED DEFAULT NULL,

  reason ENUM('Spam','Inappropriate','Fraud','Duplicate','Wrong Category','Other')
    NOT NULL,
  details VARCHAR(1000) DEFAULT NULL,

  status ENUM('Open','Under Review','Resolved','Rejected')
    NOT NULL DEFAULT 'Open',

  -- Filled when a moderator closes the report. 'Resolved' means action
  -- was taken; 'Rejected' means the report itself was unfounded.
  reviewed_by     INT UNSIGNED DEFAULT NULL,
  reviewed_at     TIMESTAMP    NULL DEFAULT NULL,
  resolution_note VARCHAR(500) DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- Same reasoning as uq_requests_item_requester: one person may
  -- report one item once. Without this, a double-click or a grudge
  -- inflates the report count and distorts the moderation queue.
  -- NULLs do not collide in a MySQL UNIQUE index, so this constrains
  -- item reports without accidentally constraining user reports.
  UNIQUE KEY uq_reports_item_reporter (reported_item_id, reporter_id),
  UNIQUE KEY uq_reports_user_reporter (reported_user_id, reporter_id),

  KEY idx_reports_status   (status),
  KEY idx_reports_created  (created_at),
  KEY idx_reports_reporter (reporter_id),

  -- >>> WHERE THE "EXACTLY ONE TARGET" CHECK WENT <<<
  -- This table used to carry
  --
  --   CONSTRAINT chk_reports_one_target CHECK (
  --     (reported_item_id IS NOT NULL) <> (reported_user_id IS NOT NULL)
  --   )
  --
  -- and MySQL 8 refused it outright:
  --
  --   ER_CHECK_CONSTRAINT_CLAUSE_USING_FK_REFER_ACTION_COLUMN:
  --   Column 'reported_item_id' cannot be used in a check constraint
  --   ... needed in a foreign key constraint referential action
  --
  -- The restriction is real and it is not arbitrary. A CHECK is
  -- evaluated when a row is written; a cascading foreign key REWRITES
  -- rows behind the application's back. MySQL will not promise to hold
  -- a CHECK it can silently invalidate, so it forbids the combination
  -- outright rather than enforcing it inconsistently.
  --
  -- That forced a choice between the CHECK and the cascade, and the
  -- cascade had to win: without ON DELETE CASCADE the foreign keys
  -- default to RESTRICT, and then deleting a reported item FAILS.
  -- Someone reporting a spam listing would make that listing
  -- undeletable -- breaking DELETE /api/items/:id, which has worked
  -- since Phase 8, and handing every user a way to pin any item in
  -- place by reporting it.
  --
  -- The invariant is enforced by the two TRIGGERS below instead. See
  -- the note there for why triggers are allowed to do what a CHECK
  -- is not.
  CONSTRAINT fk_reports_reporter
    FOREIGN KEY (reporter_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_reports_item
    FOREIGN KEY (reported_item_id) REFERENCES items(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_reports_user
    FOREIGN KEY (reported_user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- reviewed_by is SET NULL, unlike the three above: closing a report
  -- is an administrative act whose record should survive the reviewer
  -- leaving, and the full account is in audit_logs anyway.
  CONSTRAINT fk_reports_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- TRIGGERS: a report must name exactly one target
-- ---------------------------------------------------------------
-- >>> WHY A TRIGGER IS PERMITTED WHERE A CHECK IS NOT <<<
-- The rule MySQL enforces is about columns that a CASCADE can rewrite
-- without the constraint being re-evaluated. A trigger sidesteps that
-- because it fires on the INSERT and UPDATE the application performs
-- -- the writes whose correctness we actually control -- and does not
-- claim to hold during a cascade. So the guarantee is slightly
-- narrower than a CHECK, and it is exactly the part that matters:
-- no code path can create a report with no target or two targets.
--
-- (Cascades genuinely do not fire triggers in MySQL. That is fine
-- here: an ON DELETE CASCADE removes the whole report row, and an
-- ON UPDATE CASCADE renumbers a target that is still a target. Neither
-- can turn a one-target row into a zero- or two-target row.)
--
-- WHY BOTH INSERT AND UPDATE
-- A BEFORE INSERT trigger alone guards creation and nothing else, so
-- `UPDATE reports SET reported_item_id = NULL` would quietly produce
-- the invalid row the insert trigger exists to prevent. Half an
-- invariant is not an invariant.
--
-- SQLSTATE '45000' is the standard's "unhandled user-defined
-- exception". mysql2 surfaces it as an error with that sqlState and
-- the MESSAGE_TEXT below, which errorHandler.js maps to a 500 -- and
-- a 500 is the honest answer, because reaching this trigger means the
-- validator and the model both failed to do their job.
--
-- `<>` on two boolean expressions is XOR: true when exactly one side
-- is true. `=` is therefore "both or neither", which is the error case.
CREATE TRIGGER trg_reports_one_target_insert
BEFORE INSERT ON reports FOR EACH ROW
BEGIN
  IF (NEW.reported_item_id IS NOT NULL) = (NEW.reported_user_id IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A report must name exactly one target: an item or a user, not both and not neither';
  END IF;
END;

CREATE TRIGGER trg_reports_one_target_update
BEFORE UPDATE ON reports FOR EACH ROW
BEGIN
  IF (NEW.reported_item_id IS NOT NULL) = (NEW.reported_user_id IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A report must name exactly one target: an item or a user, not both and not neither';
  END IF;
END;


-- ===============================================================
-- TABLE 9: platform_settings (added by the admin panel)
-- ===============================================================
-- Values an admin can change from /admin/settings without a redeploy.
--
-- >>> KEY-VALUE ROWS, NOT ONE WIDE ROW <<<
-- The alternative is a single-row table with one column per setting.
-- That reads better in SQL, and it means every new setting is an
-- ALTER TABLE plus a migration -- so settings stop getting added, and
-- the panel drifts into showing switches that do nothing. Rows are
-- cheap; columns are a schema change.
--
-- The cost of rows is that everything is a string, which is why
-- value_type exists: the model casts on read, so `maintenance_mode`
-- arrives in JavaScript as `false` and not as the string "false" --
-- which is truthy, and would enable maintenance mode permanently.
--
-- >>> EVERY ROW HERE IS READ BY REAL CODE <<<
-- A setting whose value nothing consults is a lie told by a working
-- switch. The default rows live in ONE place --
-- DEFAULT_SETTINGS in backend/models/settingsModel.js -- and each
-- names the file that honours it. Adding a row without a reader is
-- the mistake this comment exists to prevent.
CREATE TABLE platform_settings (
  -- The key IS the primary key: 'maintenance_mode', 'site_name'.
  -- No surrogate id, because settings are addressed by name
  -- everywhere and a second identifier would only allow duplicates.
  setting_key   VARCHAR(60) NOT NULL,

  -- TEXT, not VARCHAR: a future setting could hold a longer value
  -- (a banner message, a JSON list) and this column should not be the
  -- reason that needs a migration.
  setting_value TEXT DEFAULT NULL,

  value_type ENUM('string','number','boolean','json')
    NOT NULL DEFAULT 'string',

  -- Shown next to the field in the admin UI, so the label and the
  -- explanation live with the setting instead of being hardcoded in
  -- the React page.
  label       VARCHAR(120) NOT NULL,
  description VARCHAR(300) DEFAULT NULL,

  -- Grouped into sections on the settings page.
  category ENUM('general','users','items','moderation') NOT NULL DEFAULT 'general',

  -- FALSE for settings that must never be edited through the UI, even
  -- if a row exists (nothing uses this yet; it is here so that adding
  -- a read-only setting later does not need a migration).
  is_editable BOOLEAN NOT NULL DEFAULT TRUE,

  updated_by INT UNSIGNED DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (setting_key),
  KEY idx_settings_category (category),

  CONSTRAINT fk_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL
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
--
--
-- THE ADMIN TABLES
-- ================
--
--   users                    audit_logs
--   ┌────────────┐           ┌─────────────────┐
--   │ id (PK)    │◄─ ─ ─ ─ ─ ┤ admin_id (NULL) │   dashed = SET NULL
--   │ role       │           │ admin_email     │   (a log outlives
--   │ status     │           │ action          │    its author)
--   └────────────┘           │ target_type ─┐  │
--        ▲   ▲               │ target_id ───┘  │   no FK, on purpose:
--        │   │               └─────────────────┘   logs a deleted row
--        │   │
--        │   │               reports                     items
--        │   └───────────────┤ reporter_id      │   ┌────────────┐
--        └─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤ reviewed_by(NULL)│   │ id (PK)    │
--                            │ reported_user_id ├──►│ ...        │
--                            │ reported_item_id ├──►│            │
--                            │ status           │   └─────┬──────┘
--                            └──────────────────┘         │
--                              exactly one target,        │
--                              enforced by CHECK          │
--                                                         │
--   platform_settings                                     │
--   ┌──────────────────┐                                  │
--   │ setting_key (PK) │        items.moderated_by ─ ─ ─ ─┘
--   │ setting_value    │        also points back at users
--   │ updated_by(NULL) ├─ ─ ─►  (SET NULL: deleting an admin
--   └──────────────────┘         must not delete reviewed items)
--
-- The two tables that both point at "an item or a user" resolve it in
-- OPPOSITE ways, and that contrast is the most important thing in
-- this diagram:
--
--   audit_logs  polymorphic, NO foreign key  -> survives deletion
--   reports     two real foreign keys        -> deleted with target
--
-- An audit log exists to record what happened, including deletions,
-- so it must be able to name a row that is gone. A report exists to
-- be acted on, so a report naming a row that is gone is noise. Same
-- shape, different lifetime, different design.
-- ===============================================================
