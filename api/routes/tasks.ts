import { Router } from 'express'
import { supabase } from '../lib/supabase.js'
import { taskRunner } from '../services/runner.js'

const router = Router()

// Create task
router.post('/create', async (req, res) => {
  const { projectId, urls, device, network, authType, authData, location } = req.body

  // Get user (admin for now)
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

  // Insert task
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      project_id: projectId,
      urls,
      device, // Now can be an array
      network,
      auth_type: authType,
      auth_data: authData,
      status: 'pending',
      location: location || 'us-east'
    })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }

  // Trigger performance check
  taskRunner.addTask({
    taskId: data.id,
    urls: data.urls,
    device: data.device, // Pass array
    network: data.network,
    authType: data.auth_type,
    authData: data.auth_data,
    location: data.location
  })

  res.json({ success: true, data })
})

// Get task status (Summary only)
router.get('/:id/status', async (req, res) => {
  const { id } = req.params
  
  // Fetch task
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single()

  if (taskError) {
    return res.status(404).json({ success: false, error: 'Task not found' })
  }

  // Fetch reports summary (exclude heavy JSON/HTML data)
  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, url, status, performance_score, accessibility_score, best_practices_score, seo_score, screenshot, created_at')
    .eq('task_id', id)

  if (reportsError) {
     return res.status(500).json({ success: false, error: reportsError.message })
  }

  res.json({ success: true, data: { ...task, reports } })
})

// Cancel task
router.post('/:id/cancel', async (req, res) => {
    const { id } = req.params
    
    // Check if task exists and is running/pending
    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('status')
        .eq('id', id)
        .single()

    if (taskError || !task) {
        return res.status(404).json({ success: false, error: 'Task not found' })
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        return res.status(400).json({ success: false, error: 'Task is not active' })
    }

    // Call runner to cancel
    // We are passing taskRunner via import, assuming it's singleton
    // Note: In a distributed system, this might need a message queue or DB polling by workers.
    // Here we are single instance.
    await taskRunner.cancelTask(id)

    res.json({ success: true, message: 'Task cancellation requested' })
})

export default router
