import PQueue from 'p-queue'
import puppeteer, { Browser, Page } from 'puppeteer'
import lighthouse from 'lighthouse'
import { supabase } from '../lib/supabase.js'
import { URL } from 'url'

// Queue to limit concurrent browser instances (1 at a time to save RAM)
const queue = new PQueue({ concurrency: 1 })

export interface TaskConfig {
  taskId: string
  urls: (string | { 
    url: string; 
    title?: string;
    device?: ('desktop' | 'mobile')[];
    network?: 'slow3g' | 'fast4g' | 'wifi';
    authType?: 'none' | 'form' | 'custom';
    authData?: any;
    location?: string | string[];
  })[]
  device: ('desktop' | 'mobile')[]
  network: 'slow3g' | 'fast4g' | 'wifi'
  authType?: 'none' | 'form' | 'custom'
  authData?: any
  location?: string | string[]
}

// Map custom network settings to Lighthouse throttling constants if needed
// For now, we rely on Lighthouse's default presets but could customize

const runningTasks = new Map<string, AbortController>()

export const taskRunner = {
  addTask: (config: TaskConfig) => {
    queue.add(() => processTask(config))
  },
  cancelTask: async (taskId: string) => {
      // 1. Update DB status to 'cancelled' immediately
      await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', taskId)
      
      // 2. Force kill running process via AbortController
      const controller = runningTasks.get(taskId)
      if (controller) {
          console.log(`[Runner] Found controller for ${taskId}, sending abort signal...`)
          controller.abort()
          runningTasks.delete(taskId)
          console.log(`[Runner] Aborted running task ${taskId}`)
      } else {
          console.log(`[Runner] No active controller found for ${taskId}`)
      }
      
      console.log(`[Runner] Task ${taskId} marked as cancelled.`)
  }
}

async function processTask(config: TaskConfig) {
  const { taskId, urls, device: globalDevices, authType: globalAuthType, authData: globalAuthData, location: globalLocation } = config

  // Setup abort controller
  const controller = new AbortController()
  runningTasks.set(taskId, controller)
  const signal = controller.signal

  console.log(`[Task ${taskId}] Starting... Global Location: ${globalLocation || 'default'}`)
  
  try {
    // Check if already cancelled before starting
    const { data: currentTask } = await supabase.from('tasks').select('status').eq('id', taskId).single()
    if (currentTask?.status === 'cancelled' || signal.aborted) {
        console.log(`[Task ${taskId}] Cancelled before start.`)
        return
    }

    // Update task status to running
    await supabase
        .from('tasks')
        .update({ status: 'running', started_at: new Date().toISOString(), progress: 1 })
        .eq('id', taskId)

    let browser: Browser | null = null
    
    // Force close browser on abort
    signal.addEventListener('abort', async () => {
        console.log(`[Task ${taskId}] Abort signal received.`)
        if (browser) {
            console.log(`[Task ${taskId}] Force closing browser...`)
            try {
                await browser.close()
                browser = null
            } catch (e) {
                console.error(`[Task ${taskId}] Error closing browser on abort:`, e)
            }
        }
    })

    try {
        if (signal.aborted) throw new Error('Task Cancelled')

        // Launch Puppeteer
        // Use executablePath if in Docker (detected via ENV or default path)
        const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        ]

        browser = await puppeteer.launch({
        headless: true, // 'new' is now default true in recent versions
        args: launchArgs,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        })

        const page = await browser.newPage()

        // --- Audit Phase ---
        let completedCount = 0
        
        // Calculate accurate total runs
    let totalEstimate = 0
    for (const rawU of urls) {
        let u = rawU;
        if (typeof rawU === 'string' && rawU.trim().startsWith('{')) {
            try { u = JSON.parse(rawU) } catch (e) {}
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageConfig = (typeof u === 'string' ? {} : u) as any
        const devices = pageConfig.device || globalDevices
        const deviceList = Array.isArray(devices) ? devices : [devices]
        
        // Handle location
        const locations = pageConfig.location || globalLocation
        const locationList = Array.isArray(locations) ? locations : [locations || 'us-east']
        
        totalEstimate += (deviceList.length * locationList.length)
    }
        
        // Fallback if empty (shouldn't happen)
        if (totalEstimate === 0) totalEstimate = 1

        for (const rawUrlItem of urls) {
        // Check cancellation at start of each URL loop
        if (signal.aborted) throw new Error('Task Cancelled')
        
        const { data: checkTask } = await supabase.from('tasks').select('status').eq('id', taskId).single()
        if (checkTask?.status === 'cancelled') {
            console.log(`[Task ${taskId}] Cancelled during execution.`)
            throw new Error('Task Cancelled')
        }

        let urlItem = rawUrlItem;
        if (typeof rawUrlItem === 'string' && rawUrlItem.trim().startsWith('{')) {
            try {
                urlItem = JSON.parse(rawUrlItem)
            } catch {
                // ignore
            }
        }

        const url = typeof urlItem === 'string' ? urlItem : (urlItem as any).url
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageConfig = (typeof urlItem === 'string' ? {} : urlItem) as any
        
        // Merge config: Page > Global
        const devices = pageConfig.device || globalDevices
        const deviceList = Array.isArray(devices) ? devices : [devices]
        const authType = pageConfig.authType || globalAuthType
        const authData = pageConfig.authData || globalAuthData
        const locations = pageConfig.location || globalLocation
        const locationList = Array.isArray(locations) ? locations : [locations || 'us-east']
        
        // --- Authentication Phase (Per Page) ---
      if (authType && authType !== 'none') {
        console.log(`[Task ${taskId}] Authenticating for ${url} via ${authType}...`)
        try {
            await handleAuth(page, authType, authData, url)
        } catch (e) {
            console.error(`[Task ${taskId}] Auth failed for ${url}`, e)
        }
      }

      for (const currentLocation of locationList) {
        for (const currentDevice of deviceList) {
            if (signal.aborted) throw new Error('Task Cancelled')

            // Check cancellation before each device audit
            const { data: checkTaskDevice } = await supabase.from('tasks').select('status').eq('id', taskId).single()
            if (checkTaskDevice?.status === 'cancelled') {
                console.log(`[Task ${taskId}] Cancelled during execution (device loop).`)
                throw new Error('Task Cancelled')
            }

            // Create a report record first (status: pending)
            const { data: reportRecord, error: reportError } = await supabase.from('reports').insert({
                task_id: taskId,
                url,
                device: currentDevice,
                location: currentLocation,
                status: 'pending',
                lighthouse_data: {},
            }).select().single()

            if (reportError) {
                console.error(`[Task ${taskId}] Failed to create report record for ${url} (${currentDevice}):`, reportError)
                continue
            }

            try {
                if (signal.aborted) throw new Error('Task Cancelled')

                // Trim URL to avoid spaces
                const safeUrl = url.trim()
                console.log(`[Task ${taskId}] Auditing ${safeUrl} on ${currentDevice} from ${currentLocation}...`)
                
                // Run Lighthouse
                // We use the same port as the puppeteer browser
                const { port } = new URL(browser.wsEndpoint())
                
                // Add a timeout wrapper for Lighthouse
                const lhPromise = lighthouse(safeUrl, {
                    port: Number(port),
                    output: ['json', 'html'], // Generate both JSON and HTML
                    logLevel: 'info',
                    formFactor: currentDevice,
                    screenEmulation: currentDevice === 'mobile' ? undefined : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
                    throttling: {
                    // We could map network config here, but keeping default for simplicity
                    },
                    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
                })

                // Timeout after 120 seconds per page OR if aborted
                const timeoutPromise = new Promise((_, reject) => {
                    const timer = setTimeout(() => reject(new Error('Lighthouse execution timed out')), 120000)
                    signal.addEventListener('abort', () => {
                        clearTimeout(timer)
                        reject(new Error('Task Cancelled'))
                    })
                })

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const runnerResult: any = await Promise.race([lhPromise, timeoutPromise])

            if (!runnerResult) throw new Error('Lighthouse failed to produce result')

            const report = runnerResult.lhr
            const htmlReport = Array.isArray(runnerResult.report) ? runnerResult.report[1] : runnerResult.report
            const categories = report.categories

            // Calculate scores (0-100)
            const scores = {
                performance: Math.round((categories.performance?.score || 0) * 100),
                accessibility: Math.round((categories.accessibility?.score || 0) * 100),
                bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
                seo: Math.round((categories.seo?.score || 0) * 100),
            }

            // Extract Web Vitals & Metrics
            const audits = report.audits || {}
            const metrics = {
                fcp: audits['first-contentful-paint']?.numericValue,
                lcp: audits['largest-contentful-paint']?.numericValue,
                tbt: audits['total-blocking-time']?.numericValue,
                cls: audits['cumulative-layout-shift']?.numericValue,
                speed_index: audits['speed-index']?.numericValue,
                total_byte_weight: audits['total-byte-weight']?.numericValue
            }

            // Capture screenshot (Lighthouse has one, but let's take a fresh one or use LH's)
            const screenshot = report.audits['final-screenshot']?.details?.data

            // Update Report
            await supabase.from('reports').update({
                lighthouse_data: report, 
                html_report: htmlReport, // Use the extracted htmlReport string
                performance_score: scores.performance,
                accessibility_score: scores.accessibility,
                best_practices_score: scores.bestPractices,
                seo_score: scores.seo,
                // Add metrics
                fcp: metrics.fcp,
                lcp: metrics.lcp,
                tbt: metrics.tbt,
                cls: metrics.cls,
                speed_index: metrics.speed_index,
                total_byte_weight: metrics.total_byte_weight,
                
                status: 'completed',
                screenshot: screenshot, // Data URI
            }).eq('id', reportRecord.id)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                if (err.message === 'Task Cancelled') throw err
                console.error(`[Task ${taskId}] Failed to audit ${url}:`, err)
                await supabase.from('reports').update({
                    status: 'failed',
                    error_message: err.message,
                }).eq('id', reportRecord.id)
            }

            completedCount++
          const progress = Math.round((completedCount / totalEstimate) * 100)
          await supabase.from('tasks').update({ progress }).eq('id', taskId)
        }
      }
        }

        // Task Completed
        // Double check if cancelled before marking complete
        if (!signal.aborted) {
            const { data: finalCheck } = await supabase.from('tasks').select('status').eq('id', taskId).single()
            if (finalCheck?.status !== 'cancelled') {
                await supabase
                .from('tasks')
                .update({ 
                    status: 'completed', 
                    completed_at: new Date().toISOString(),
                    progress: 100 
                })
                .eq('id', taskId)

                console.log(`[Task ${taskId}] Finished.`)
            }
        }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        if (err.message === 'Task Cancelled' || signal.aborted) {
            console.log(`[Task ${taskId}] Execution stopped due to cancellation.`)
            // Ensure status remains cancelled (it should be already)
            return
        }
        console.error(`[Task ${taskId}] Fatal error:`, err)
        await supabase
        .from('tasks')
        .update({ status: 'failed' })
        .eq('id', taskId)
    } finally {
        if (browser) await browser.close()
    }
  } finally {
      runningTasks.delete(taskId)
  }
}

async function handleAuth(page: Page, type: string, data: any, contextUrl: string) {
  if (!data) return

  if (type === 'form') {
    const { username, password, loginUrl } = data
    if (loginUrl && username && password) {
      await page.goto(loginUrl, { waitUntil: 'networkidle0' })
      
      // Heuristic: find common input selectors
      // This is fragile and usually needs custom selectors per site
      // For now, we try standard selectors
      const userSelectors = ['input[type="email"]', 'input[name="email"]', 'input[name="username"]', '#username', '#email']
      const passSelectors = ['input[type="password"]', 'input[name="password"]', '#password']
      const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button']

      let userFound = false
      for (const sel of userSelectors) {
        if (await page.$(sel)) {
          await page.type(sel, username)
          userFound = true
          break
        }
      }

      let passFound = false
      for (const sel of passSelectors) {
        if (await page.$(sel)) {
          await page.type(sel, password)
          passFound = true
          break
        }
      }

      if (userFound && passFound) {
        for (const sel of submitSelectors) {
          const btn = await page.$(sel)
          if (btn) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle0' }),
              btn.click(),
            ]).catch(() => console.log('Navigation timeout or failed, continuing anyway'))
            break
          }
        }
      }
    }
  } else if (type === 'custom') {
    // 1. Handle Cookies
    if (data.cookies) {
        try {
            const cookies = typeof data.cookies === 'string' ? JSON.parse(data.cookies) : data.cookies
            if (Array.isArray(cookies)) {
                 // Ensure domain is set if missing (Puppeteer requires it)
                 const domain = new URL(contextUrl).hostname
                 const formattedCookies = cookies.map(c => ({
                     ...c,
                     domain: c.domain || domain,
                     url: c.url || contextUrl
                 }))
                 await page.setCookie(...formattedCookies)
            }
        } catch (e) {
            console.error('Failed to set cookies', e)
        }
    }

    // For Storage, we need to be on the page domain
    if (data.localStorage || data.sessionStorage) {
        await page.goto(contextUrl, { waitUntil: 'domcontentloaded' })
        
        // 2. Handle LocalStorage
        if (data.localStorage) {
             try {
                 const storage = typeof data.localStorage === 'string' ? JSON.parse(data.localStorage) : data.localStorage
                 await page.evaluate((items) => {
                     if (Array.isArray(items)) {
                         // Handle Array format: [{key, value}, ...]
                         items.forEach(item => {
                             if (item.key) localStorage.setItem(item.key, item.value || '')
                         })
                     } else {
                         // Handle Object format: { key: value }
                         for (const key in items) {
                             localStorage.setItem(key, items[key])
                         }
                     }
                 }, storage)
             } catch (e) { console.error('Failed to set localStorage', e) }
        }

        // 3. Handle SessionStorage
        if (data.sessionStorage) {
             try {
                 const storage = typeof data.sessionStorage === 'string' ? JSON.parse(data.sessionStorage) : data.sessionStorage
                 await page.evaluate((items) => {
                     if (Array.isArray(items)) {
                         items.forEach(item => {
                             if (item.key) sessionStorage.setItem(item.key, item.value || '')
                         })
                     } else {
                         for (const key in items) {
                             sessionStorage.setItem(key, items[key])
                         }
                     }
                 }, storage)
             } catch (e) { console.error('Failed to set sessionStorage', e) }
        }
    }
  }
}
