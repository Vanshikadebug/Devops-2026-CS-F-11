/**
 * utils/escapeLike.js -- escape the wildcard characters in a LIKE pattern.
 *
 * >>> THIS IS NOT THE SAME PROBLEM AS SQL INJECTION <<<
 * The search term is already a bound parameter, so it cannot become
 * SQL. But INSIDE a LIKE pattern, `%` and `_` are still operators:
 * `%` matches any run of characters and `_` matches exactly one. A
 * user searching for the literal text "100%" would otherwise get a
 * pattern of `%100%%`, which matches every row that contains "100"
 * followed by anything -- and a user searching for just "%" would
 * match the entire table.
 *
 * The backslash must be escaped FIRST. Doing it last would also
 * escape the backslashes this function just added, doubling them.
 *
 * WHY THIS LIVES IN utils/ NOW.
 * It began as a private helper inside itemModel, back when the public
 * item search was the only LIKE query in the app. It is not any more:
 * the admin user, college, report and audit-log searches each build
 * the same `%term%` pattern, and each one needs the same escaping for
 * the same reason. A single shared copy means the rule is stated once
 * and cannot drift -- a fix here reaches every search box at once,
 * instead of four builders quietly disagreeing about whether `%` is
 * text or an operator.
 */
function escapeLike(term) {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

module.exports = escapeLike
