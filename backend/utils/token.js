/**
 * utils/token.js -- creating and verifying JWTs.
 *
 * WHAT IS A JWT (JSON Web Token)?
 * A string with three dot-separated parts:
 *
 *     eyJhbGciOiJIUzI1NiJ9.eyJpZCI6NCwiaWF0IjoxNzA...  .  4Rm8kQ...
 *     └── header ──────────┘└── payload ───────────┘   └ signature ┘
 *
 * The header says which algorithm was used. The payload holds our
 * data (here: the user's id). The signature is a hash of both, made
 * with JWT_SECRET.
 *
 * >>> THE PART EVERYONE GETS WRONG <<<
 * The header and payload are BASE64-ENCODED, NOT ENCRYPTED. Anyone
 * holding the token can decode and read them -- paste one into
 * jwt.io and it prints the contents. Base64 is an encoding, like
 * uppercase; it hides nothing.
 *
 * Therefore: NEVER put anything secret in a token. No passwords, no
 * password hashes, no private notes. We store only the user id, and
 * even that is public information.
 *
 * SO WHAT MAKES IT SECURE?
 * The signature. An attacker can freely read a token, and can freely
 * EDIT the payload -- change `"id": 4` to `"id": 1` and become
 * another user. But changing the payload changes its hash, and they
 * cannot produce a matching signature without JWT_SECRET. verify()
 * recomputes the hash and rejects the mismatch.
 *
 * That is why JWT_SECRET is the single most important value in this
 * project. Anyone who learns it can mint a valid token for ANY user
 * without knowing a password. It lives in backend/.env, which is
 * gitignored, and is never logged (see config/env.js, which prints
 * "[set]" and not the value).
 *
 * WHY STORE ONLY THE ID, AND NOT THE WHOLE USER?
 * Tokens live for 7 days. If we embedded the name and email, then a
 * user who changed their email would keep presenting the old one for
 * a week -- the token would be stale but still perfectly valid. The
 * id never changes, so we store that and look the user up fresh on
 * every request. Smaller token, always-current data.
 */

const jwt = require('jsonwebtoken')
const config = require('../config/env')

/**
 * Signs a token for a user id.
 *
 * `expiresIn` is not optional politeness -- it is what limits the
 * damage of a stolen token. A token with no expiry is a permanent
 * password that the user cannot change. Ours lasts 7 days
 * (JWT_EXPIRES_IN in .env).
 */
function signToken(userId) {
  return jwt.sign(
    { id: userId }, // the payload -- deliberately nothing else
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  )
}

/**
 * Verifies a token and returns its payload.
 *
 * THROWS on a bad token -- it does not return null. That is
 * deliberate: a caller who forgets to check a return value would
 * silently treat a forged token as valid, which is the worst
 * possible failure mode. An exception cannot be ignored by accident.
 *
 * jsonwebtoken throws two errors we care about, and errorHandler.js
 * already maps both to a 401:
 *   JsonWebTokenError -- signature invalid (tampered or wrong secret)
 *   TokenExpiredError -- past its expiry
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret)
}

module.exports = { signToken, verifyToken }
