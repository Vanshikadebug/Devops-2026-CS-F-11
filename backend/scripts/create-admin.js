/**
 * scripts/create-admin.js -- promotes an account to super_admin, or creates
 * one, from the ADMIN_* variables in the environment.
 *
 *   npm run db:admin
 *
 * There is deliberately no default password: a shipped default admin
 * credential is the single most exploited weakness in self-hosted software.
 * An existing account is promoted and its password left untouched.
 */

const bcrypt = require('bcryptjs')
const config = require('../src/config/env')
const { prisma, disconnectPrisma } = require('../src/lib/prisma')
const auditModel = require('../src/models/auditModel')

async function main() {
  const { email, password, name, mobile } = config.seedAdmin

  if (!email) {
    console.error('[admin] ADMIN_EMAIL is not set. Add it to .env and retry.')
    process.exitCode = 1
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    if (existing.role === 'super_admin') {
      console.log(`[admin] ${email} is already a super_admin. Nothing to do.`)
      return
    }
    const before = existing.role
    await prisma.user.update({ where: { email }, data: { role: 'super_admin' } })
    await auditModel.record({
      adminId: existing.id,
      adminEmail: email,
      action: 'user.role_change',
      targetType: 'user',
      targetId: existing.id,
      description: `Promoted ${email} from ${before} to super_admin via db:admin`,
      changes: { role: { from: before, to: 'super_admin' } },
    })
    console.log(`[admin] promoted ${email} from ${before} to super_admin.`)
    return
  }

  if (!password || password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error(
      '[admin] to CREATE a new admin, ADMIN_PASSWORD must be 12+ characters\n' +
        '        and contain a letter and a digit.',
    )
    process.exitCode = 1
    return
  }

  const created = await prisma.user.create({
    data: {
      name: name || 'Administrator',
      email,
      mobile: mobile || '0000000000',
      password: await bcrypt.hash(password, config.bcryptSaltRounds),
      role: 'super_admin',
    },
    select: { id: true, email: true },
  })

  await auditModel.record({
    adminId: created.id,
    adminEmail: created.email,
    action: 'user.create',
    targetType: 'user',
    targetId: created.id,
    description: `Created super_admin ${created.email} via db:admin`,
  })

  console.log(`[admin] created ${created.email} as super_admin.`)
  console.log('[admin] now remove ADMIN_PASSWORD from .env.')
}

main()
  .catch((err) => {
    console.error('[admin] FAILED:', err.message)
    process.exitCode = 1
  })
  .finally(disconnectPrisma)
