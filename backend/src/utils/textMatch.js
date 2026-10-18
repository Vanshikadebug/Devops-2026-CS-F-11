/**
 * Case-insensitive substring filter for a Prisma `where`. MySQL's default
 * collation matched case-insensitively; MongoDB does not, so `mode` keeps the
 * old behaviour.
 *
 * On MongoDB Prisma turns `contains` into a $regex WITHOUT escaping it, so a
 * search for "(" would crash the query and "." would match anything. Escaping
 * the regex metacharacters makes every typed character literal.
 */
const escapeRegex = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const textMatch = (term) => ({ contains: escapeRegex(term), mode: 'insensitive' })

module.exports = textMatch
