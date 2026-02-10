import { Router } from 'express'
import { supabase } from '../lib/supabase.js'

const router = Router()

// Get report details (including HTML)
router.get('/:id', async (req, res) => {
  const { id } = req.params
  
  const { data, error } = await supabase
    .from('reports')
    .select('html_report')
    .eq('id', id)
    .single()

  if (error || !data) {
    return res.status(404).send('Report not found')
  }

  // Directly return the HTML string for iframe rendering
  res.setHeader('Content-Type', 'text/html')
  res.send(data.html_report)
})

export default router
