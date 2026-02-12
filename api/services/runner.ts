import PQueue from 'p-queue'
import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabase } from '../lib/supabase.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Queue to limit concurrent worker instances (2 at a time to balance CPU/RAM)
const queue = new PQueue({ concurrency: 2 })

export interface TaskConfig {
  taskId: string
  urls: (
    | string
    | {
        url: string
        title?: string
        device?: ('desktop' | 'mobile')[]
        network?: 'slow3g' | 'fast4g' | 'wifi'
        authType?: 'none' | 'form' | 'custom'
        authData?: any
        location?: string | string[]
      }
  )[]
  device: ('desktop' | 'mobile')[]
  network: 'slow3g' | 'fast4g' | 'wifi'
  authType?: 'none' | 'form' | 'custom'
  authData?: any
  location?: string | string[]
}

const runningTasks = new Map<string, ChildProcess>()

export const taskRunner = {
  addTask: (config: TaskConfig) => {
    queue.add(() => processTask(config))
  },

  cancelTask: async (taskId: string) => {
      await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', taskId)
      
    const child = runningTasks.get(taskId)
    if (child) {
      console.log(`[Runner] Found child process for ${taskId}, sending cancel message...`)
      try {
        child.send({ type: 'cancel' })
      } catch {
        // ignore
      }

      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }, 5000)

      runningTasks.delete(taskId)
    } else {
      console.log(`[Runner] No active child process found for ${taskId}`)
    }
  },
}

async function processTask(config: TaskConfig) {
  const { taskId } = config

  const workerPath = path.join(__dirname, 'lighthouse-worker.ts')

  const child = fork(workerPath, [], {
    execArgv: ['--import', 'tsx'],
    stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
  })

  runningTasks.set(taskId, child)

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      process.stdout.write(`[Worker ${taskId}] ${chunk.toString()}`)
    })
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[Worker ${taskId} ERROR] ${chunk.toString()}`)
    })
  }

  const cleanup = () => {
    runningTasks.delete(taskId)
  }

  child.on('error', async (err) => {
    console.error(`[Runner] Child process error for task ${taskId}:`, err)
    await supabase.from('tasks').update({ status: 'failed' }).eq('id', taskId)
    cleanup()
  })

  child.on('exit', async (code, signal) => {
    console.log(`[Runner] Child process exited for task ${taskId} with code ${code} signal ${signal}`)

    if (code !== 0 && code !== null) {
      const { data: task } = await supabase.from('tasks').select('status').eq('id', taskId).single()
      if (task && task.status !== 'completed' && task.status !== 'cancelled') {
        await supabase.from('tasks').update({ status: 'failed' }).eq('id', taskId)
      }
    }

    cleanup()
  })

  return new Promise<void>((resolve) => {
    child.on('message', (msg: any) => {
      if (msg?.type === 'done') {
        cleanup()
        resolve()
      }
    })

    child.send({ type: 'run', payload: config })
  })
}
