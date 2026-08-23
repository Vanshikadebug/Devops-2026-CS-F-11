-- ===============================================================
-- ReuseHub -- ONE-TIME CI DATABASE + USER  (run once, by hand, as root)
-- ===============================================================
-- WHAT THIS IS
-- The Jenkins pipeline (see ../Jenkinsfile) runs the test suite against
-- the LOCAL MySQL already on this machine -- the always-on "MySQL80"
-- Windows service -- instead of a Docker container. That means there is
-- nothing to start or open for a build to go green: a push just builds.
--
-- The one risk of sharing the dev server is that CI could touch the
-- developer's real `reusehub` data. It doesn't, and this file is why:
--   * CI builds into a SEPARATE, disposable database, `reusehub_ci`.
--   * CI logs in as a DEDICATED account that has rights on NOTHING else.
-- So the worst a runaway build could do is rebuild its own throwaway
-- database. The real one is unreachable to it.
--
-- RUN THIS ONCE. After that every build works with no further steps.
-- Re-running it is harmless -- every statement is IF NOT EXISTS / GRANT, or
-- sets a server flag to the same value it already has (step 4).
--
-- HOW TO RUN IT (any one):
--   * MySQL Workbench:  File > Open SQL Script > this file > run (⚡)
--   * PowerShell -- it has NO `<` redirect and needs `&` to run a quoted
--     path, so pipe the file in instead (you will be prompted for your root
--     password, which is NOT stored anywhere):
--       Get-Content database\ci-setup.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
--   * cmd.exe -- the classic redirect works here:
--       "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database\ci-setup.sql
--
-- >>> WHY THE PASSWORD BELOW IS COMMITTED ON PURPOSE <<<
-- 'reusehub_ci_pw' is NOT a secret. This account can reach only the
-- reusehub_ci database, which holds nothing but disposable test data
-- that db:setup rebuilds from scratch on every run. It exists so the
-- Jenkinsfile can carry a WORKING login WITHOUT ever containing your
-- real root password. Anything genuinely secret (a production DB
-- password) belongs in Jenkins > Credentials, pulled in with
-- credentials('id') -- see JENKINS_SETUP.md. Treat this pair as public
-- and local-only.
-- ===============================================================

-- 1. The isolated CI database. Same charset/collation as schema.sql, so
--    the tables built inside it behave identically to the dev database.
CREATE DATABASE IF NOT EXISTS reusehub_ci
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. The dedicated CI account, created for BOTH 'localhost' and
--    '127.0.0.1'. MySQL treats those as different hosts: the pipeline
--    connects to 127.0.0.1 (to dodge the IPv6 ::1 trap), while a human
--    testing by hand usually connects as localhost. Covering both means
--    "works from Jenkins" and "works when I try it myself" are the same
--    account with the same password.
CREATE USER IF NOT EXISTS 'reusehub_ci'@'localhost' IDENTIFIED BY 'reusehub_ci_pw';
CREATE USER IF NOT EXISTS 'reusehub_ci'@'127.0.0.1' IDENTIFIED BY 'reusehub_ci_pw';

-- 3. Full rights, but ONLY on reusehub_ci. This grant is the fence that
--    makes the account safe to hardcode: it may create tables, install
--    the report triggers, seed and truncate WITHIN reusehub_ci, and do
--    nothing whatsoever to `reusehub` or any other database. Database-
--    level ALL PRIVILEGES includes CREATE (so setup-db.js's
--    `CREATE DATABASE IF NOT EXISTS reusehub_ci` is permitted) and the
--    TRIGGER privilege that schema.sql's two report triggers need. NOTE:
--    that TRIGGER privilege is necessary but, on its own, NOT sufficient
--    while binary logging is on -- there is a second, server-level gate
--    that step 4 below lifts.
GRANT ALL PRIVILEGES ON reusehub_ci.* TO 'reusehub_ci'@'localhost';
GRANT ALL PRIVILEGES ON reusehub_ci.* TO 'reusehub_ci'@'127.0.0.1';

-- Make the new account and grants take effect immediately.
FLUSH PRIVILEGES;

-- 4. Let that NON-SUPER account actually create schema.sql's report triggers.
--    This is the gate that turned build #13 red with
--    ER_BINLOG_CREATE_ROUTINE_NEED_SUPER, and it catches almost everyone:
--    when binary logging is ON (the default on MySQL 8) the server refuses
--    to let any account WITHOUT the global SUPER privilege create a trigger,
--    function or stored procedure -- the worry being that a non-deterministic
--    routine could desync statement-based replication. reusehub_ci is
--    deliberately NOT SUPER (that fence is the whole point of this file), so
--    the build creates every table fine and then dies on the
--    trg_reports_one_target_* triggers.
--
--    log_bin_trust_function_creators = 1 is the documented fix: it tells the
--    server to trust the routines these users create, so a non-SUPER account
--    may create them. It is a GLOBAL server setting -- there is no per-database
--    grant for it -- so root sets it here, once. SET PERSIST (MySQL 8) writes
--    it to mysqld-auto.cnf so it SURVIVES a service restart; a plain
--    SET GLOBAL would be forgotten on the next reboot and quietly re-break the
--    build. On a local dev/CI server with no replicas this relaxation has no
--    downside. (If you are ever on a MySQL older than 8.0, use SET GLOBAL and
--    also add `log_bin_trust_function_creators=1` under [mysqld] in my.ini.)
SET PERSIST log_bin_trust_function_creators = 1;

SELECT 'reusehub_ci database and CI user are ready -- Jenkins can now build'
  AS status;
