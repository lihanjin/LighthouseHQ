import PQueue from 'p-queue'
import { fork, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../db.js'
import { tasks } from '../schema.js'
import { eq, sql } from 'drizzle-orm'

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const PSI_API_KEY = process.env.GOOGLE_API_KEY || process.env.PSI_API_KEY

// PSI proxy runs on the host machine to avoid Docker NAT blocking large responses
const PSI_PROXY = process.env.PSI_PROXY || 'http://host.docker.internal:7788'

function nodeGet(urlStr: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = urlStr.startsWith('https') ? https : http
    const req = mod.get(urlStr, { timeout: 120000 }, (res: any) => {
      if (res.statusCode >= 400) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('request timed out')) })
  })
}

async function runPSI(taskId: string, url: string, device: string) {
  const strategy = device === 'mobile' ? 'MOBILE' : 'DESKTOP'
  const params = new URLSearchParams({ url, strategy })
  if (PSI_API_KEY) params.append('key', PSI_API_KEY)
  for (const cat of ['performance', 'accessibility', 'best-practices', 'seo']) {
    params.append('category', cat)
  }

  console.log(`[Runner] PSI request: ${url} (${strategy})`)
  await db.execute(sql`UPDATE tasks SET status_text = ${'PSI 请求中: ' + url + ' (' + device + ')，约需 15-30 秒'} WHERE id = ${taskId}`)

  let body: string
  try {
    console.log(`[Runner] Trying PSI proxy at ${PSI_PROXY}`)
    body = await nodeGet(`${PSI_PROXY}/psi?${params}`)
    console.log(`[Runner] PSI proxy success: ${body.length} bytes`)
  } catch (proxyErr: any) {
    console.warn(`[Runner] PSI proxy failed (${proxyErr?.message}), trying direct...`)
    body = await nodeGet(`${PSI_ENDPOINT}?${params}`)
    console.log(`[Runner] PSI direct success: ${body.length} bytes`)
  }

  const psiResult: any = JSON.parse(body)
  const psiLhr = psiResult.lighthouseResult
  if (!psiLhr) throw new Error('No lighthouseResult in PSI response')

  const psiCategories = psiLhr.categories || {}
  const psiScores = {
    performance: Math.round((psiCategories.performance?.score || 0) * 100),
    accessibility: Math.round((psiCategories.accessibility?.score || 0) * 100),
    bestPractices: Math.round((psiCategories['best-practices']?.score || 0) * 100),
    seo: Math.round((psiCategories.seo?.score || 0) * 100),
  }
  const psiAudits = psiLhr.audits || {}

  await db.execute(sql`
    INSERT INTO reports (task_id, url, device, location, source, status, lighthouse_data,
      performance_score, accessibility_score, best_practices_score, seo_score,
      fcp, lcp, tbt, cls, speed_index, total_byte_weight)
    VALUES (
      ${taskId}, ${url}, ${device}, 'google-psi', 'psi', 'completed',
      ${JSON.stringify(psiLhr)}::jsonb,
      ${psiScores.performance}, ${psiScores.accessibility}, ${psiScores.bestPractices}, ${psiScores.seo},
      ${psiAudits['first-contentful-paint']?.numericValue ?? null},
      ${psiAudits['largest-contentful-paint']?.numericValue ?? null},
      ${psiAudits['total-blocking-time']?.numericValue ?? null},
      ${psiAudits['cumulative-layout-shift']?.numericValue ?? null},
      ${psiAudits['speed-index']?.numericValue ?? null},
      ${psiAudits['total-byte-weight']?.numericValue ?? null}
    )
  `)
  console.log(`[Runner] PSI done: ${url} perf=${psiScores.performance}`)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Queue to limit concurrent worker instances (2 at a time to balance CPU/RAM)
const queue = new PQueue({ concurrency: 1 })

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
    await db.update(tasks).set({ status: 'cancelled' }).where(eq(tasks.id, taskId))
      
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
    await db.update(tasks).set({ status: 'failed' }).where(eq(tasks.id, taskId))
    cleanup()
                    })

  child.on('exit', async (code, signal) => {
    console.log(`[Runner] Child process exited for task ${taskId} with code ${code} signal ${signal}`)

    if (code !== 0 && code !== null) {
      const rows = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
      const task = rows[0]
      if (task && task.status !== 'completed' && task.status !== 'cancelled') {
        await db.update(tasks).set({ status: 'failed' }).where(eq(tasks.id, taskId))
      }
    }

    cleanup()
  })

  return new Promise<void>((resolve) => {
    child.on('exit', () => resolve())

    child.on('message', (msg: any) => {
      if (msg?.type === 'done') {
        cleanup()
        resolve()
      } else if (msg?.type === 'psi_request') {
        runPSI(msg.taskId, msg.url, msg.device).catch((e) =>
          console.warn(`[Runner] PSI failed for ${msg.url}: ${e?.message}`)
        )
      }
    })

    child.send({ type: 'run', payload: config })
  })
}
