/**
 * controllers/dashboardController.js -- "what is the state of my account?"
 *
 * WHAT IS THIS FILE?
 * One endpoint, GET /api/dashboard, that answers everything the
 * dashboard screen needs: who you are, and your counts.
 *
 * WHY ONE ENDPOINT INSTEAD OF LETTING THE PAGE CALL THREE?
 * The dashboard could fetch /api/auth/me, then a stats endpoint, then
 * /api/items/mine. Three round trips, three loading spinners, and
 * three chances for one of them to fail while the others succeed --
 * leaving a screen that is half filled in and impossible to describe
 * to the user. One request either works or it does not.
 *
 * There is a real cost to this choice and it is worth naming: an
 * endpoint shaped around one screen has to change when that screen
 * changes. That is an acceptable trade for a dashboard, which by
 * definition exists to show one particular summary.
 *
 * >>> THIS IS THE AUTHORIZATION PHASE, SO READ THIS PART <<<
 * Authentication (Phase 6) asked "who are you?". Authorization asks
 * "what are you allowed to see?", and it is the harder question,
 * because the code that gets it wrong looks completely normal.
 *
 * The rule this whole phase is built on:
 *
 *     THE USER ID COMES FROM req.user.id, NEVER FROM THE REQUEST.
 *
 * req.user was loaded by protect.js from a token whose SIGNATURE was
 * verified -- so it cannot be forged without the server's secret.
 * Anything in the URL, the query string, or the body was typed by the
 * caller and can say anything at all. Compare:
 *
 *     getUserStats(req.user.id)      // mine, always
 *     getUserStats(req.query.userId) // whosever id I type in the URL
 *
 * The second line is one word different, reviews as reasonable, and
 * hands the entire user table to anyone who tries ?userId=1, then 2,
 * then 3. tests/dashboard.test.js proves the first behaviour by
 * logging in as one user, asking for another's data every way the
 * HTTP request allows, and checking the answer never changes.
 */

const statsModel = require('../models/statsModel')
const itemModel = require('../models/itemModel')
const asyncHandler = require('../utils/asyncHandler')

// How many of the user's newest items ride along with the stats.
// The dashboard shows a preview strip, not the full list -- "see all"
// links to /my-items, which calls GET /api/items/mine without a limit.
const RECENT_ITEMS = 3

/**
 * GET /api/dashboard -- the logged-in user's own summary.
 *
 * Registered behind `protect`, so req.user is guaranteed here. There
 * is deliberately no `if (!req.user)` guard: a guard like that reads
 * as defensive, but it quietly turns "somebody forgot the middleware"
 * into a tidy 401 instead of a loud crash -- which means the missing
 * `protect` never gets noticed. The route file is the single place
 * that decides who may call this, and it should stay that way.
 *
 * WHY IS THE USER OBJECT IN THE RESPONSE?
 * So the page can greet you by name without a second request. It is
 * the same SAFE_FIELDS object /api/auth/me returns -- no password,
 * because userModel never selects that column.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id

  // Both reads are independent, so they run concurrently rather than
  // one after the other. getUserStats is itself three parallel
  // queries, so this is four queries in roughly one query's time.
  const [stats, recentItems] = await Promise.all([
    statsModel.getUserStats(userId),
    itemModel.findByUser(userId, { limit: RECENT_ITEMS }),
  ])

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
      stats,
      recentItems,
    },
  })
})

module.exports = { getDashboard }
