import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  // Get latest task
  const { data: tasks } = await supabase.from('tasks').select('id').order('created_at', { ascending: false }).limit(1)
  if (!tasks || tasks.length === 0) return
  
  const taskId = tasks[0].id
  console.log('Checking reports for task:', taskId)
  
  const { data: reports } = await supabase
    .from('reports')
    .select('url, device, location, status, lcp, performance_score, error_message')
    .eq('task_id', taskId)
    
  console.log(JSON.stringify(reports, null, 2))
}

run()
