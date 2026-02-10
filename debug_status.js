import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function check() {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3)
  
  if (tasks && tasks.length > 0) {
      console.log('Latest Task:', JSON.stringify(tasks[0], null, 2))
      
      const { data: reports } = await supabase
        .from('reports')
        .select('id, url, device, status, performance_score')
        .eq('task_id', tasks[0].id)
        
      console.log('Reports for latest task:', JSON.stringify(reports, null, 2))
  } else {
      console.log('No tasks found', error)
  }
}

check()
