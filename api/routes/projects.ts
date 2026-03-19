import { Router } from 'express'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db.js'
import { projects, tasks, reports } from '../schema.js'
import { taskRunner } from '../services/runner.js'
import { getOrCreateAdminUserId } from '../services/admin-user.js'

const router = Router()

// Get all projects
router.get('/', async (req, res) => {
  try {
    // 查询 projects 列表
    const projectRows = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        urls: projects.urls,
        default_config: projects.defaultConfig,
        created_at: projects.createdAt,
        updated_at: projects.updatedAt,
      })
      .from(projects)
      .orderBy(desc(projects.createdAt))

    if (projectRows.length === 0) {
      return res.json({ success: true, data: [] })
    }

    const projectsWithStats = projectRows.map(p => {
      return {
        ...p,
        // 先不从视图聚合统计，后续有需要再用 Drizzle 视图补上
        stats: null,
      }
    })

    res.json({ success: true, data: projectsWithStats })
  } catch (error) {
    console.error('Failed to fetch projects with stats', error)
    const err = error as Error
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch projects' })
  }
})

// Create project
router.post('/', async (req, res) => {
  const { name, description, urls, config } = req.body
  try {
    const userId = await getOrCreateAdminUserId()
    const urlsJson = JSON.stringify(urls || [])
    const configJson = JSON.stringify(config || {})

    const result = (await db.execute(sql`
      insert into projects (user_id, name, description, urls, default_config)
      values (${userId}, ${name}, ${description ?? null}, ${urlsJson}::jsonb, ${configJson}::jsonb)
      returning
        id,
        name,
        description,
        urls,
        default_config,
        created_at,
        updated_at
    `)) as unknown as { rows: Record<string, unknown>[] }

    res.json({ success: true, data: result.rows?.[0] ?? null })
  } catch (error) {
    console.error('Failed to create project', error)
    res
      .status(500)
      .json({ success: false, error: (error as Error).message || 'Failed to create project' })
  }
})

// Get project details with history stats
router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    // 1. Get project info
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1)

    const project = projectRows[0]

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    // 2. Get historical reports for this project's tasks
    const taskRows = await db
      .select({
        id: tasks.id,
        created_at: tasks.createdAt,
        status: tasks.status,
      })
      .from(tasks)
      .where(and(eq(tasks.projectId, id), eq(tasks.status, 'completed')))
      .orderBy(desc(tasks.createdAt))
      .limit(20)

    let history: Array<{
      date: string | Date | null
      taskId: string
      performance: number
      accessibility: number
      bestPractices: number
      seo: number
      lcp: number
      tbt: number
      cls: number
      fcp: number
      si: number
      weight: number
    }> = []

    if (taskRows.length > 0) {
      const taskIds = taskRows.map((t) => t.id)

      const reportRows = await db
        .select({
          task_id: reports.taskId,
          url: reports.url,
          performance_score: reports.performanceScore,
          accessibility_score: reports.accessibilityScore,
          best_practices_score: reports.bestPracticesScore,
          seo_score: reports.seoScore,
          lcp: reports.lcp,
          tbt: reports.tbt,
          cls: reports.cls,
          fcp: reports.fcp,
          speed_index: reports.speedIndex,
          total_byte_weight: reports.totalByteWeight,
        })
        .from(reports)
        .where(inArray(reports.taskId, taskIds))

      const reportsByTask = reportRows.reduce((acc: Record<string, Record<string, unknown>[]>, curr) => {
        if (!acc[curr.task_id]) acc[curr.task_id] = []
        acc[curr.task_id].push(curr as unknown as Record<string, unknown>)
        return acc
      }, {})

      history = taskRows
        .map((task) => {
          const taskReports = reportsByTask[task.id] || []
          if (taskReports.length === 0) return null

          const avg = (key: string) => {
            const sum = taskReports.reduce(
              (s: number, r: Record<string, unknown>) =>
                s + (Number(r[key]) || 0),
              0,
            )
            return taskReports.length ? sum / taskReports.length : 0
          }

          return {
            date: task.created_at,
            taskId: task.id,
            performance: Math.round(avg('performance_score')),
            accessibility: Math.round(avg('accessibility_score')),
            bestPractices: Math.round(avg('best_practices_score')),
            seo: Math.round(avg('seo_score')),
            lcp: Number(avg('lcp').toFixed(0)),
            tbt: Number(avg('tbt').toFixed(0)),
            cls: Number(avg('cls').toFixed(3)),
            fcp: Number(avg('fcp').toFixed(0)),
            si: Number(avg('speed_index').toFixed(0)),
            weight: Number(avg('total_byte_weight').toFixed(0)),
          }
        })
        .filter(Boolean)
        .reverse()
    }

    // 3. Get latest reports for "Dashboard" view
    const recentTasksRows = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        progress: tasks.progress,
        created_at: tasks.createdAt,
      })
      .from(tasks)
      .where(eq(tasks.projectId, id))
      .orderBy(desc(tasks.createdAt))
      .limit(10)

    type LatestReport = Record<string, unknown>
    let latestReports: LatestReport[] = []
    let runningTask: Record<string, unknown> | null = null
    let reportsHistory: Record<string, LatestReport[]> = {}

    if (recentTasksRows.length > 0) {
      runningTask = recentTasksRows.find(
        (t) => t.status === 'running' || t.status === 'pending',
      )

      const taskIds = recentTasksRows.map((t) => t.id)

      const reportRows = await db
        .select({
          id: reports.id,
          task_id: reports.taskId,
          url: reports.url,
          device: reports.device,
          location: reports.location,
          source: reports.source,
          status: reports.status,
          error_message: reports.errorMessage,
          created_at: reports.createdAt,
          performance_score: reports.performanceScore,
          accessibility_score: reports.accessibilityScore,
          best_practices_score: reports.bestPracticesScore,
          seo_score: reports.seoScore,
          lcp: reports.lcp,
          tbt: reports.tbt,
          cls: reports.cls,
          fcp: reports.fcp,
          speed_index: reports.speedIndex,
          total_byte_weight: reports.totalByteWeight,
          screenshot: reports.screenshot,
        })
        .from(reports)
        .where(inArray(reports.taskId, taskIds))
        .orderBy(desc(reports.createdAt))

      const seen = new Set<string>()
      latestReports = reportRows.filter((r) => {
        const key = `${r.url}-${r.device}-${(r as any).source || 'local'}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const reportsMap: Record<string, LatestReport[]> = {}
      reportRows.forEach((r) => {
        const key = `${r.url}-${r.device}-${(r as any).source || 'local'}`
        if (!reportsMap[key]) reportsMap[key] = []
        reportsMap[key].push(r)
      })

      const sortedHistory: Record<string, LatestReport[]> = {}
      Object.keys(reportsMap).forEach((key) => {
        sortedHistory[key] = reportsMap[key]
          .sort((a, b) => {
            const aDate = (a as Record<string, unknown>).created_at
            const bDate = (b as Record<string, unknown>).created_at
            return new Date(String(bDate)).getTime() - new Date(String(aDate)).getTime()
          })
          .slice(0, 10)
          .reverse()
      })
      reportsHistory = sortedHistory
    }

    res.json({
      success: true,
      data: { ...project, history, latestReports, reportsHistory, runningTask },
    })
  } catch (error) {
    console.error('Failed to get project detail', error)
    res
      .status(500)
      .json({
        success: false,
        error: (error as Error).message || 'Failed to get project detail',
      })
  }
})

// Update project
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name, description, urls, config } = req.body
  try {
    const newDefaultConfig = config ?? req.body.default_config ?? {}

    const urlsJson = JSON.stringify(urls || [])
    const configJson = JSON.stringify(newDefaultConfig || {})

    const result = (await db.execute(sql`
      update projects
      set
        name = ${name},
        description = ${description ?? null},
        urls = ${urlsJson}::jsonb,
        default_config = ${configJson}::jsonb,
        updated_at = now()
      where id = ${id}
      returning
        id,
        name,
        description,
        urls,
        default_config,
        created_at,
        updated_at
    `)) as unknown as { rows: Record<string, unknown>[] }

    const updated = result.rows?.[0]
    if (!updated) return res.status(404).json({ success: false, error: 'Project not found' })
    res.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update project', error)
    res.status(500).json({ success: false, error: (error as Error).message || 'Failed to update project' })
  }
})

// Delete project
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const deleted = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id })
    if (deleted.length === 0) return res.status(404).json({ success: false, error: 'Project not found' })
    res.json({ success: true, message: 'Project deleted' })
  } catch (error) {
    console.error('Failed to delete project', error)
    res.status(500).json({ success: false, error: (error as Error).message || 'Failed to delete project' })
  }
})

// Clear all tasks and reports for a project
router.delete('/:id/history', async (req, res) => {
  const { id } = req.params
  try {
    const projectTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.projectId, id))

    if (projectTasks.length > 0) {
      const taskIds = projectTasks.map((t) => t.id)
      await db.delete(reports).where(inArray(reports.taskId, taskIds))
      await db.delete(tasks).where(eq(tasks.projectId, id))
    }

    res.json({ success: true, message: 'History cleared' })
  } catch (error) {
    console.error('Failed to clear history', error)
    res.status(500).json({ success: false, error: (error as Error).message || 'Failed to clear history' })
  }
})

// Stop running task
router.post('/:id/stop-run', async (req, res) => {
  const { id } = req.params
  try {
    const running = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, id), inArray(tasks.status, ['running', 'pending'])))
      .orderBy(desc(tasks.createdAt))
      .limit(1)

    const task = running[0]
    if (!task?.id) return res.json({ success: false, message: 'No running task found' })

    await taskRunner.cancelTask(task.id)
    return res.json({ success: true, message: 'Task cancellation requested' })
  } catch (error) {
    console.error('Failed to stop running task', error)
    res.status(500).json({ success: false, error: (error as Error).message || 'Failed to stop running task' })
  }
})

export default router
