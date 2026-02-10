import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  console.log('Force cancelling all running/pending tasks...')
  
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'cancelled', progress: 100 })
    .in('status', ['running', 'pending'])
    .select()

  if (error) {
    console.error('Error:', error)
  } else {
    console.log(`Cancelled ${data.length} tasks.`)
    console.log(JSON.stringify(data, null, 2))
  }
}

run()
