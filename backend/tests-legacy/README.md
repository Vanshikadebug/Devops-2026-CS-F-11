# Legacy test suite (not currently run)

These 341 tests were written against the pre-refactor codebase. They are kept
because they encode a lot of valuable behaviour, but they do **not** run today
and `npm test` deliberately does not match this directory.

## Why they no longer run

1. Every file imports `../config/db` (the mysql2 pool). That module was removed
   — Prisma is now the only data client — so the files fail at import time.
2. `items.category` / `items.item_condition` moved from MySQL `ENUM` to
   `VARCHAR` validated against the admin-editable `categories` / `conditions`
   tables. Tests asserting a fixed six-category list no longer describe the
   system.
3. Paths moved: the app now lives under `src/`, so `require('../app')` needs to
   become `require('../src/app')`.

## Porting them

Per file, roughly:

- `require('../config/db')` → use `require('../src/lib/prisma')` and replace
  `pool.execute(sql, params)` with the equivalent Prisma call.
- `require('../app')` → `require('../src/app')`.
- Seed the taxonomy in `beforeAll` (the tests now need `categories` and
  `conditions` rows to exist) — see `prisma/seed.js`.

Then move the file back into a `tests/` directory, which `jest` matches.
