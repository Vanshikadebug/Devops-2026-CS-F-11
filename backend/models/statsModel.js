/**
 * models/statsModel.js -- the counts behind the dashboard.
 *
 * An unusual model: it does not own a table. itemModel owns `items`,
 * userModel owns `users`. This one answers a single question spanning
 * three tables -- "what is the state of my account?" -- and returns
 * nothing but numbers. They live together because the dashboard's
 * numbers are one coherent thing; split across two files, neither could
 * be read as a complete answer.
 *
 * >>> EVERY QUERY IN THIS FILE IS SCOPED TO ONE user_id <<<
 * That is not a style rule, it is the security model. An unscoped count
 * would return the whole site's total and quietly display it as yours.
 * Read each `where` below and satisfy yourself that it names one person.
 *
 * A note for anyone comparing this against the git history: the raw-SQL
 * version needed Number() around every SUM(), because MySQL types SUM as
 * DECIMAL and mysql2 returns DECIMAL as a string to protect precision --
 * so `available` used to serialise as "2" instead of 2, and 2 + "2" is
 * "22". groupBy returns real integers, so that hazard is gone rather
 * than merely handled.
 */

const { prisma } = require('../config/prisma')

/**
 * Turns groupBy output into a flat { status: count } lookup.
 *
 * Totalling the buckets rather than issuing a separate count keeps this
 * correct if a new status is ever added to the enum -- and a status with
 * no rows is absent from groupBy entirely, which is why every caller
 * below reads through `?? 0` instead of trusting the key to exist. A
 * brand-new user with no items must see 0, not undefined.
 */
function tally(groups) {
  const counts = {}
  let total = 0
  for (const g of groups) {
    const n = g._count._all
    counts[g.status] = n
    total += n
  }
  return { counts, total }
}

/** How many items this user has listed, broken down by status. */
async function itemCounts(userId) {
  const { counts, total } = tally(
    await prisma.item.groupBy({
      by: ['status'],
      where: { user_id: userId },
      _count: { _all: true },
    }),
  )

  return {
    total,
    available: counts.Available ?? 0,
    reserved: counts.Reserved ?? 0,
    unavailable: counts.Unavailable ?? 0,
  }
}

/**
 * Requests OTHER people have made on THIS user's items.
 *
 * The indirection is worth understanding: `requests` records who asked
 * (requester_id) and what they asked for (item_id), but not who OWNS the
 * item -- that fact lives in items.user_id. So "requests addressed to
 * me" has to travel through the relation, which is what the nested
 * `item: { user_id }` filter does.
 *
 * `pending` is the number that matters on screen: people currently
 * waiting for an answer from this user.
 */
async function requestsReceived(userId) {
  const { counts, total } = tally(
    await prisma.request.groupBy({
      by: ['status'],
      where: { item: { user_id: userId } },
      _count: { _all: true },
    }),
  )

  return { total, pending: counts.Pending ?? 0 }
}

/**
 * Requests THIS user has made on other people's items.
 * No relation hop needed -- requester_id is already the answer.
 */
async function requestsSent(userId) {
  const { counts, total } = tally(
    await prisma.request.groupBy({
      by: ['status'],
      where: { requester_id: userId },
      _count: { _all: true },
    }),
  )

  return {
    total,
    pending: counts.Pending ?? 0,
    accepted: counts.Accepted ?? 0,
  }
}

/**
 * Everything the dashboard needs, in one object. Promise.all issues all
 * three concurrently and waits for the slowest, which is correct here
 * because none of the three depends on another's result.
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
