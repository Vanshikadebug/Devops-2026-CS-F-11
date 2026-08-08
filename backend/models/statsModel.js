/**
 * models/statsModel.js -- the counts behind the dashboard.
 *
 * WHAT IS THIS FILE?
 * An unusual model: it does not own a table. itemModel owns `items`,
 * userModel owns `users`. This one answers a single question that
 * spans three tables at once -- "what is the state of my account?" --
 * and returns nothing but numbers.
 *
 * WHY NOT PUT THESE QUERIES IN itemModel AND requestModel?
 * Because the dashboard's numbers are one coherent thing, and
 * splitting them across two files would mean neither file could be
 * read as a complete answer. Keeping them together makes the whole
 * shape of the dashboard reviewable in one screen -- which matters,
 * because every query here is filtered by user id and a missing
 * filter is exactly the bug that leaks another person's data.
 *
 * >>> EVERY QUERY IN THIS FILE IS FILTERED BY user_id <<<
 * That is not a style rule, it is the security model. `SELECT
 * COUNT(*) FROM items` would return the whole site's item count and
 * quietly display it as yours. Read each WHERE clause below and
 * satisfy yourself that it is scoped to one person.
 *
 * WHY THREE QUERIES INSTEAD OF ONE BIG ONE?
 * They could be combined into a single SELECT full of scalar
 * subqueries, which would be one round trip instead of three. It
 * would also be nine copies of the same parameter and unreadable.
 * Promise.all runs these three concurrently -- so the cost is one
 * round trip's worth of waiting anyway, not three.
 */

const { pool } = require('../config/db')

/* ---------------------------------------------------------------
   >>> THE mysql2 TRAP THAT MAKES Number() NECESSARY BELOW <<<

   COUNT(*) comes back as a JavaScript number. SUM() does NOT --
   MySQL types it as DECIMAL, and mysql2 returns DECIMAL as a
   STRING to avoid losing precision on huge values.

   So without the casts, the API would answer:

       { "total": 3, "available": "2" }
                                  ^^^ a string

   ...which is the kind of bug that survives for weeks. It looks
   right in the JSON, and it even renders correctly in React,
   because "2" and 2 both print as 2. It breaks the moment anyone
   does arithmetic: 2 + "2" is "22", not 4.

   SUM(condition) works as a count because MySQL evaluates a
   comparison to 1 or 0, so summing it counts the matching rows.
   COALESCE handles the empty case: SUM over zero rows is NULL,
   not 0, so a brand-new user with no items would otherwise get
   null instead of a number.
--------------------------------------------------------------- */

/** How many items this user has listed, broken down by status. */
async function itemCounts(userId) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'Available'), 0)   AS available,
            COALESCE(SUM(status = 'Reserved'), 0)    AS reserved,
            COALESCE(SUM(status = 'Unavailable'), 0) AS unavailable
       FROM items
      WHERE user_id = ?`,
    [userId],
  )

  return {
    total: Number(row.total),
    available: Number(row.available),
    reserved: Number(row.reserved),
    unavailable: Number(row.unavailable),
  }
}

/**
 * Requests OTHER people have made on THIS user's items.
 *
 * This is the one query here that needs a JOIN, and the reason is
 * worth understanding: `requests` records who asked (requester_id)
 * and what they asked for (item_id). It does not record who OWNS the
 * item -- that fact lives in items.user_id. So to find "requests
 * addressed to me" we have to travel through `items`:
 *
 *     requests.item_id -> items.id, then filter items.user_id = me
 *
 * The `pending` number is the one that matters on screen: it is the
 * count of people currently waiting for an answer from this user.
 */
async function requestsReceived(userId) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(r.status = 'Pending'), 0) AS pending
       FROM requests r
       JOIN items i ON i.id = r.item_id
      WHERE i.user_id = ?`,
    [userId],
  )

  return { total: Number(row.total), pending: Number(row.pending) }
}

/**
 * Requests THIS user has made on other people's items.
 *
 * No JOIN needed -- requests.requester_id is already the answer.
 */
async function requestsSent(userId) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'Pending'), 0)  AS pending,
            COALESCE(SUM(status = 'Accepted'), 0) AS accepted
       FROM requests
      WHERE requester_id = ?`,
    [userId],
  )

  return {
    total: Number(row.total),
    pending: Number(row.pending),
    accepted: Number(row.accepted),
  }
}

/**
 * Everything the dashboard needs, in one object.
 *
 * Promise.all issues all three queries at once and waits for the
 * slowest, rather than running them one after another. With a local
 * database the difference is small; the habit is what matters, and it
 * is correct here because none of the three depends on another's
 * result.
 */
async function getUserStats(userId) {
  const [items, received, sent] = await Promise.all([
    itemCounts(userId),
    requestsReceived(userId),
    requestsSent(userId),
  ])

  return { items, requestsReceived: received, requestsSent: sent }
}

module.exports = { getUserStats }
