import { db } from '../db.js'
import { users } from '../schema.js'

/**
 * 目前系统还没有真正的登录/鉴权，这里沿用原来逻辑：
 * - 取第一条用户作为 admin
 * - 若不存在则创建默认 admin
 */
export async function getOrCreateAdminUserId(): Promise<string> {
  const existing = await db.select({ id: users.id }).from(users).limit(1)
  if (existing[0]?.id) return existing[0].id

  const [created] = await db
    .insert(users)
    .values({
      email: 'admin@example.com',
      passwordHash: 'default_hash',
      name: 'Admin',
      role: 'admin',
    })
    .returning({ id: users.id })

  if (!created?.id) throw new Error('Failed to create default admin user')
  return created.id
}

