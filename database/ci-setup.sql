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
-- Re-running it is harmless -- every statement is IF NOT EXISTS / GRANT.
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
--    `CREATE DATABASE IF NOT EXISTS reusehub_ci` is permitted) and
--    TRIGGER (so schema.sql's two report triggers install cleanly).
GRANT ALL PRIVILEGES ON reusehub_ci.* TO 'reusehub_ci'@'localhost';
GRANT ALL PRIVILEGES ON reusehub_ci.* TO 'reusehub_ci'@'127.0.0.1';

-- Make the new account and grants take effect immediately.
FLUSH PRIVILEGES;

SELECT 'reusehub_ci database and CI user are ready -- Jenkins can now build'
  AS status;
