import { Router } from 'express'
import { supabase } from '../lib/supabase.js'

const router = Router()

// Get all projects
router.get('/', async (req, res) => {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, description, urls, default_config, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }

  const projectIds = projects.map(p => p.id)

  // Fetch stats from view only for relevant projects
  const { data: stats } = await supabase
    .from('project_latest_stats')
    .select('*')
    .in('project_id', projectIds)

  const statsMap = new Map(stats?.map(s => [s.project_id, s]))

  const projectsWithStats = projects.map(p => {
    const s: any = statsMap.get(p.id)
    return {
      ...p,
      stats: s ? {
        performance: s.avg_performance,
        lcp: s.avg_lcp,
        fid: s.avg_tbt,
        cls: s.avg_cls,
        weight: s.avg_weight,
        lastRunAt: s.last_run_at
      } : null
    }
  })

  res.json({ success: true, data: projectsWithStats })
})

// Create project
router.post('/', async (req, res) => {
  const { name, description, urls, config } = req.body
  
  // TODO: Get real user ID from auth middleware
  // For now, fetch the first user (admin)
  const { data: users } = await supabase.from('users').select('id').limit(1)
  let userId = users?.[0]?.id

  // If no user exists, create a default admin user
  if (!userId) {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        email: 'admin@example.com',
        password_hash: 'default_hash', // In production, use real hash
        name: 'Admin',
        role: 'admin'
      })
      .select()
      .single()
      
    if (createError) {
       console.error('Failed to create default user', createError)
       return res.status(500).json({ success: false, error: 'Failed to create default user' })
    }
    userId = newUser.id
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name,
      description,
      urls: urls || [],
      default_config: config || {},
    })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }

  res.json({ success: true, data })
})

// Get project details with history stats
router.get('/:id', async (req, res) => {
  const { id } = req.params
  
  // 1. Get project info
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (projectError) {
    return res.status(404).json({ success: false, error: 'Project not found' })
  }

  // 2. Get historical reports for this project's tasks
  // We join tasks -> reports
  // Since Supabase join syntax can be complex, we'll do two queries or use a view
  // For simplicity: get last 20 tasks, then get their reports
  
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, created_at')
    .eq('project_id', id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(20)

  let history: any[] = []
  
  if (tasks && tasks.length > 0) {
    const taskIds = tasks.map(t => t.id)
    
    const { data: reports } = await supabase
      .from('reports')
      .select('task_id, url, performance_score, accessibility_score, best_practices_score, seo_score, lcp, tbt, cls, fcp, speed_index, total_byte_weight')
      .in('task_id', taskIds)

    // Group by task to calculate average scores per run
    const reportsByTask = (reports || []).reduce((acc: any, curr) => {
      if (!acc[curr.task_id]) acc[curr.task_id] = []
      acc[curr.task_id].push(curr)
      return acc
    }, {})

    history = tasks.map(task => {
        const taskReports = reportsByTask[task.id] || []
        if (taskReports.length === 0) return null
        
        // Calculate averages
        const avg = (key: string) => {
            const sum = taskReports.reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0)
            return taskReports.length ? sum / taskReports.length : 0
        }
        
        return {
            date: task.created_at,
            taskId: task.id,
            performance: Math.round(avg('performance_score')),
            accessibility: Math.round(avg('accessibility_score')),
            bestPractices: Math.round(avg('best_practices_score')),
            seo: Math.round(avg('seo_score')),
            // Metrics
            lcp: Number(avg('lcp').toFixed(0)),
            tbt: Number(avg('tbt').toFixed(0)),
            cls: Number(avg('cls').toFixed(3)),
            fcp: Number(avg('fcp').toFixed(0)),
            si: Number(avg('speed_index').toFixed(0)),
            weight: Number(avg('total_byte_weight').toFixed(0))
        }
    }).filter(Boolean).reverse() // Reverse to show chronological order
  }

  // 3. Get latest reports for "Dashboard" view
  // We want the latest report for each URL + Device combination
  // Strategy: Get last 10 tasks (including running ones maybe?), fetch their reports, then dedupe by url+device
  const { data: recentTasks } = await supabase
    .from('tasks')
    .select('id, status, progress, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  let latestReports: any[] = []
  let runningTask: any = null

  if (recentTasks && recentTasks.length > 0) {
    // Check for running task
    runningTask = recentTasks.find(t => t.status === 'running' || t.status === 'pending')
    
    const taskIds = recentTasks.map(t => t.id)
    
    const { data: reports } = await supabase
      .from('reports')
      .select('id, task_id, url, device, location, status, error_message, created_at, performance_score, accessibility_score, best_practices_score, seo_score, lcp, tbt, cls, fcp, speed_index, total_byte_weight, screenshot')
      .in('task_id', taskIds)
      .order('created_at', { ascending: false })
      
    // Dedupe: keep first occurrence of unique key (url + device)
    const seen = new Set()
    latestReports = (reports || []).filter(r => {
      const key = `${r.url}-${r.device}-${r.location || 'us-east'}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // 4. Group reports by URL+Device+Location for history sparklines
    // We want the last 10 runs for each page
    const reportsMap: Record<string, any[]> = {}
    reports?.forEach(r => {
        const key = `${r.url}-${r.device}-${r.location || 'us-east'}`
        if (!reportsMap[key]) reportsMap[key] = []
        reportsMap[key].push(r)
    })
    
    // Sort each group by date desc
    const reportsHistory: Record<string, any[]> = {}
    Object.keys(reportsMap).forEach(key => {
        reportsHistory[key] = reportsMap[key]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 10) // Keep last 10
            .reverse() // Oldest to newest for chart
    })

    // Add reportsHistory to response
    res.json({ success: true, data: { ...project, history, latestReports, reportsHistory, runningTask } })
  } else {
      res.json({ success: true, data: { ...project, history, latestReports, reportsHistory: {}, runningTask } })
  }
})

// Update project
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name, description, urls, config } = req.body

  const { data, error } = await supabase
    .from('projects')
    .update({
      name,
      description,
      urls,
      default_config: config,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }

  res.json({ success: true, data })
})

// Delete project
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }

  res.json({ success: true, message: 'Project deleted' })
})

// Stop running task
router.post('/:id/stop-run', async (req, res) => {
  const { id } = req.params
  
  // Find the latest running task for this project
  const { data: runningTasks, error: findError } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', id)
    .in('status', ['running', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)

  if (findError) {
    return res.status(500).json({ success: false, error: findError.message })
  }

  if (runningTasks && runningTasks.length > 0) {
      const taskId = runningTasks[0].id
      
      // Update to cancelled
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status: 'cancelled' })
        .eq('id', taskId)
        
      if (updateError) {
        return res.status(500).json({ success: false, error: updateError.message })
      }
      
      return res.json({ success: true, message: 'Task cancelled' })
  }

  res.json({ success: false, message: 'No running task found' })
})

export default router
