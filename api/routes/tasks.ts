import { Router } from 'express'
import { taskRunner } from '../services/runner.js'
import { db } from '../db.js'
import { tasks, reports } from '../schema.js'
import { desc, eq } from 'drizzle-orm'
import { getOrCreateAdminUserId } from '../services/admin-user.js'

const router = Router()

type DeviceType = 'desktop' | 'mobile'
type NetworkType = 'slow3g' | 'fast4g' | 'wifi'
type AuthType = 'none' | 'form' | 'custom'

interface CreateTaskBody {
  projectId: string
  urls: unknown[]
  device: DeviceType | DeviceType[]
  network: NetworkType
  authType?: AuthType
  authData?: unknown
  location?: string | string[]
}

// Create task
router.post('/create', async (req, res) => {
  const { projectId, urls, device, network, authType, authData, location } =
    req.body as CreateTaskBody

  try {
    const userId = await getOrCreateAdminUserId()

    // tasks.urls 在 DB 中是 text[]，但前端传过来的 urls 可能是 jsonb 数组（对象/字符串混合）
    const taskUrls: string[] = (urls || []).map((u: unknown) =>
      typeof u === 'string' ? u : JSON.stringify(u),
    )

    const deviceList = (Array.isArray(device) ? device : [device]).filter(
      Boolean,
    ) as DeviceType[]

    const loc = Array.isArray(location) ? location[0] : location || 'us-east'
    const finalAuthType: AuthType = authType || 'none'
    const finalAuthData =
      typeof authData === 'object' && authData !== null
        ? (authData as Record<string, unknown>)
        : null

    const [data] = await db
      .insert(tasks)
      .values({
        userId,
        projectId,
        urls: taskUrls,
        device: deviceList,
        network,
        authType: finalAuthType,
        authData: finalAuthData,
        status: 'pending',
        location: loc,
        progress: 0,
      })
      .returning()

    if (!data?.id) {
      return res.status(500).json({ success: false, error: 'Failed to create task' })
    }

    taskRunner.addTask({
      taskId: data.id,
      urls: data.urls || [],
      device: (data.device as DeviceType[]) || ['desktop'],
      network: (data.network as NetworkType) || 'fast4g',
      authType: (data.authType as AuthType) || 'none',
      authData: (data.authData as unknown) || undefined,
      location: (data.location as string) || 'us-east',
    })

    res.json({ success: true, data })
  } catch (error) {
    console.error('Failed to create task', error)
    const err = error as Error
    res.status(500).json({ success: false, error: err.message || 'Failed to create task' })
  }
})

// Get task status (Summary only)
router.get('/:id/status', async (req, res) => {
  const { id } = req.params
  try {
    const taskRows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    const task = taskRows[0]
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' })

    const reportRows = await db
      .select({
        id: reports.id,
        url: reports.url,
        status: reports.status,
        performance_score: reports.performanceScore,
        accessibility_score: reports.accessibilityScore,
        best_practices_score: reports.bestPracticesScore,
        seo_score: reports.seoScore,
        screenshot: reports.screenshot,
        created_at: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.taskId, id))
      .orderBy(desc(reports.createdAt))

    res.json({ success: true, data: { ...task, reports: reportRows } })
  } catch (error) {
    console.error('Failed to get task status', error)
    const err = error as Error
    res.status(500).json({ success: false, error: err.message || 'Failed to get task status' })
  }
})

// Cancel task
router.post('/:id/cancel', async (req, res) => {
    const { id } = req.params
    try {
      const taskRows = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, id))
        .limit(1)

      const task = taskRows[0]
      if (!task) return res.status(404).json({ success: false, error: 'Task not found' })

      if (['completed', 'failed', 'cancelled'].includes(String(task.status))) {
        return res.status(400).json({ success: false, error: 'Task is not active' })
      }

      await taskRunner.cancelTask(id)
      res.json({ success: true, message: 'Task cancellation requested' })
    } catch (error) {
      console.error('Failed to cancel task', error)
      const err = error as Error
      res.status(500).json({ success: false, error: err.message || 'Failed to cancel task' })
    }
})

export default router
