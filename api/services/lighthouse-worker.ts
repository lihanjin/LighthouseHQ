import puppeteer from 'puppeteer'
import lighthouse from 'lighthouse'
import { supabase } from '../lib/supabase.ts'
import { URL } from 'url'

const CRUX_API_KEY = process.env.CRUX_API_KEY || process.env.GOOGLE_API_KEY

let currentBrowser: any = null
let cancelled = false

function normalizeToOrigin(inputUrl: string) {
  try {
    const u = new URL(inputUrl)
    return `${u.protocol}//${u.host}`
  } catch {
    return inputUrl
  }
}

async function fetchCruxMetrics(url: string) {
  if (!CRUX_API_KEY) return null

  const origin = normalizeToOrigin(url)

  try {
    const resp = await fetch(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(CRUX_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin }),
      },
    )

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { origin, error: `HTTP ${resp.status} ${text}` }
    }

    const json: any = await resp.json()
    const metrics = json?.record?.metrics || {}

    const getP75 = (m: any) => m?.percentiles?.p75

    return {
      origin,
      lcp_p75: getP75(metrics.largest_contentful_paint),
      inp_p75: getP75(metrics.interaction_to_next_paint),
      cls_p75: getP75(metrics.cumulative_layout_shift),
      collectionPeriod: json?.record?.collectionPeriod || null,
    }
  } catch (e: any) {
    return { origin, error: e?.message || String(e) }
  }
}

async function runTask(config: any) {
  const { taskId, urls, device: globalDevices, authType: globalAuthType, authData: globalAuthData, location: globalLocation } = config

  cancelled = false

  console.log(`[Worker Task ${taskId}] Starting... Global Location: ${globalLocation || 'default'}`)

  try {
    const { data: currentTask } = await supabase.from('tasks').select('status').eq('id', taskId).single()
    if (currentTask?.status === 'cancelled' || cancelled) {
      console.log(`[Worker Task ${taskId}] Cancelled before start.`)
      return { taskId, status: 'cancelled' }
    }

    await supabase
      .from('tasks')
      .update({ status: 'running', started_at: new Date().toISOString(), progress: 1 })
      .eq('id', taskId)

    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']

    currentBrowser = await puppeteer.launch({
      headless: true,
      args: launchArgs,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    })

    const page = await currentBrowser.newPage()

    let completedCount = 0

    let totalEstimate = 0
    for (const rawU of urls) {
      let u = rawU
      if (typeof rawU === 'string' && rawU.trim().startsWith('{')) {
        try {
          u = JSON.parse(rawU)
        } catch {}
      }
      const pageConfig = typeof u === 'string' ? {} : u
      const devices = pageConfig.device || globalDevices
      const deviceList = Array.isArray(devices) ? devices : [devices]

      const locations = pageConfig.location || globalLocation
      const locationList = Array.isArray(locations) ? locations : [locations || 'us-east']

      totalEstimate += deviceList.length * locationList.length
    }
    if (totalEstimate === 0) totalEstimate = 1

    for (const rawUrlItem of urls) {
      if (cancelled) throw new Error('Task Cancelled')

      const { data: checkTask } = await supabase.from('tasks').select('status').eq('id', taskId).single()
      if (checkTask?.status === 'cancelled') {
        console.log(`[Worker Task ${taskId}] Cancelled during execution.`)
        throw new Error('Task Cancelled')
      }

      let urlItem = rawUrlItem
      if (typeof rawUrlItem === 'string' && rawUrlItem.trim().startsWith('{')) {
        try {
          urlItem = JSON.parse(rawUrlItem)
        } catch {}
      }

      const url = typeof urlItem === 'string' ? urlItem : urlItem.url
      const pageConfig = typeof urlItem === 'string' ? {} : urlItem

      const devices = pageConfig.device || globalDevices
      const deviceList = Array.isArray(devices) ? devices : [devices]
      const authType = pageConfig.authType || globalAuthType
      const authData = pageConfig.authData || globalAuthData
      const locations = pageConfig.location || globalLocation
      const locationList = Array.isArray(locations) ? locations : [locations || 'us-east']

      if (authType && authType !== 'none') {
        console.log(`[Worker Task ${taskId}] Authenticating for ${url} via ${authType}...`)
        try {
          await handleAuth(page, authType, authData, url)
        } catch (e) {
          console.error(`[Worker Task ${taskId}] Auth failed for ${url}`, e)
        }
      }

      if (CRUX_API_KEY) {
        const crux = await fetchCruxMetrics(url)
        if (crux?.error) {
          console.log(`[Worker Task ${taskId}] CrUX(${crux.origin}) error: ${crux.error}`)
        } else if (crux) {
          console.log(
            `[Worker Task ${taskId}] CrUX(${crux.origin}) p75: LCP=${crux.lcp_p75} INP=${crux.inp_p75} CLS=${crux.cls_p75}`,
          )
        }
      } else {
        console.log(`[Worker Task ${taskId}] CrUX skipped: missing CRUX_API_KEY/GOOGLE_API_KEY`)
      }

      for (const currentLocation of locationList) {
        for (const currentDevice of deviceList) {
          if (cancelled) throw new Error('Task Cancelled')

          const { data: checkTaskDevice } = await supabase.from('tasks').select('status').eq('id', taskId).single()
          if (checkTaskDevice?.status === 'cancelled') {
            console.log(`[Worker Task ${taskId}] Cancelled during execution (device loop).`)
            throw new Error('Task Cancelled')
          }

          const normalizedLocation = Array.isArray(currentLocation)
            ? currentLocation[0]
            : typeof currentLocation === 'string'
              ? (currentLocation.trim().startsWith('[') ? (() => { try { const parsed = JSON.parse(currentLocation); return Array.isArray(parsed) ? parsed[0] : currentLocation } catch { return currentLocation } })() : currentLocation)
              : String(currentLocation || 'us-east')

          const { data: reportRecord, error: reportError } = await supabase
            .from('reports')
            .insert({
              task_id: taskId,
              url,
              device: currentDevice,
              location: normalizedLocation,
              status: 'pending',
              lighthouse_data: {},
            })
            .select()
            .single()

          if (reportError) {
            console.error(`[Worker Task ${taskId}] Failed to create report record for ${url} (${currentDevice}):`, reportError)
            continue
          }

          try {
            const safeUrl = url.trim()
            console.log(`[Worker Task ${taskId}] Auditing ${safeUrl} on ${currentDevice} from ${currentLocation}...`)

            // Ensure browser is healthy before each audit
            if (!currentBrowser || !currentBrowser.connected) {
              console.log(`[Worker Task ${taskId}] Browser disconnected or missing, launching new instance...`)
              const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
              currentBrowser = await puppeteer.launch({
                headless: true,
                args: launchArgs,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
              })
            }

            const { port } = new URL(currentBrowser.wsEndpoint())

            const lhPromise = lighthouse(safeUrl, {
              port: Number(port),
              output: ['json', 'html'],
              logLevel: 'info',
              formFactor: currentDevice as any,
              screenEmulation:
                currentDevice === 'mobile'
                  ? undefined
                  : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
              throttling: {},
              onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
              locale: 'zh',
            })

            let timer: NodeJS.Timeout | undefined
            let cancelCheck: NodeJS.Timeout | undefined

            const cleanupTimers = () => {
              if (timer) clearTimeout(timer)
              if (cancelCheck) clearInterval(cancelCheck)
              timer = undefined
              cancelCheck = undefined
            }

            const timeoutPromise = new Promise((_, reject) => {
              // Hard timeout of 90 seconds per audit
              timer = setTimeout(() => {
                cleanupTimers()
                reject(new Error('Lighthouse execution timed out'))
              }, 90000)

              cancelCheck = setInterval(() => {
                if (cancelled) {
                  cleanupTimers()
                  reject(new Error('Task Cancelled'))
                }
              }, 250)
            })

            let runnerResult: any
            try {
              runnerResult = await Promise.race([lhPromise, timeoutPromise])
            } catch (err: any) {
              cleanupTimers()
              // If timed out, try to force close browser to prevent ghost processes
              if (err.message === 'Lighthouse execution timed out') {
                console.log(`[Worker Task ${taskId}] Audit timed out for ${url}, force restarting browser...`)
                try {
                  await currentBrowser.close()
                } catch {}
                currentBrowser = null // Trigger re-launch on next loop
              }
              throw err
            } finally {
              cleanupTimers()
            }
            if (!runnerResult) throw new Error('Lighthouse failed to produce result')

            const report = runnerResult.lhr
            const htmlReport = Array.isArray(runnerResult.report) ? runnerResult.report[1] : runnerResult.report
            const categories = report.categories

            const scores = {
              performance: Math.round((categories.performance?.score || 0) * 100),
              accessibility: Math.round((categories.accessibility?.score || 0) * 100),
              bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
              seo: Math.round((categories.seo?.score || 0) * 100),
            }

            const audits = report.audits || {}
            const metrics = {
              fcp: audits['first-contentful-paint']?.numericValue,
              lcp: audits['largest-contentful-paint']?.numericValue,
              tbt: audits['total-blocking-time']?.numericValue,
              cls: audits['cumulative-layout-shift']?.numericValue,
              speed_index: audits['speed-index']?.numericValue,
              total_byte_weight: audits['total-byte-weight']?.numericValue,
            }

            const screenshot = report.audits['final-screenshot']?.details?.data

            await supabase
              .from('reports')
              .update({
                lighthouse_data: report,
                html_report: htmlReport,
                performance_score: scores.performance,
                accessibility_score: scores.accessibility,
                best_practices_score: scores.bestPractices,
                seo_score: scores.seo,
                fcp: metrics.fcp,
                lcp: metrics.lcp,
                tbt: metrics.tbt,
                cls: metrics.cls,
                speed_index: metrics.speed_index,
                total_byte_weight: metrics.total_byte_weight,
                status: 'completed',
                screenshot,
              })
              .eq('id', reportRecord.id)
          } catch (err: any) {
            if (err?.message === 'Task Cancelled') throw err
            console.error(`[Worker Task ${taskId}] Failed to audit ${url}:`, err)
            await supabase
              .from('reports')
              .update({ status: 'failed', error_message: err?.message || String(err) })
              .eq('id', reportRecord.id)
          }

          completedCount++
          const progress = Math.round((completedCount / totalEstimate) * 100)
          await supabase.from('tasks').update({ progress }).eq('id', taskId)
        }
      }
    }

    if (!cancelled) {
      const { data: finalCheck } = await supabase.from('tasks').select('status').eq('id', taskId).single()
      if (finalCheck?.status !== 'cancelled') {
        await supabase
          .from('tasks')
          .update({ status: 'completed', completed_at: new Date().toISOString(), progress: 100 })
          .eq('id', taskId)
        console.log(`[Worker Task ${taskId}] Finished.`)
      }
    }

    return { taskId, status: cancelled ? 'cancelled' : 'completed' }
  } catch (err: any) {
    if (err?.message === 'Task Cancelled' || cancelled) {
      console.log(`[Worker Task ${taskId}] Execution stopped due to cancellation.`)
      return { taskId, status: 'cancelled' }
    }

    console.error(`[Worker Task ${taskId}] Fatal error:`, err)
    await supabase.from('tasks').update({ status: 'failed' }).eq('id', taskId)
    return { taskId, status: 'failed', error: err?.message || String(err) }
  } finally {
    try {
      if (currentBrowser) await currentBrowser.close()
    } finally {
      currentBrowser = null
    }
  }
}

async function handleAuth(page: any, type: string, data: any, contextUrl: string) {
  if (!data) return

  if (type === 'form') {
    const { username, password, loginUrl } = data
    if (loginUrl && username && password) {
      await page.goto(loginUrl, { waitUntil: 'networkidle0' })

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
            await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), btn.click()]).catch(() => {
              console.log('Navigation timeout or failed, continuing anyway')
            })
            break
          }
        }
      }
    }
  } else if (type === 'custom') {
    if (data.cookies) {
      try {
        const cookies = typeof data.cookies === 'string' ? JSON.parse(data.cookies) : data.cookies
        if (Array.isArray(cookies)) {
          const domain = new URL(contextUrl).hostname
          const formattedCookies = cookies.map((c) => ({
            ...c,
            domain: c.domain || domain,
            url: c.url || contextUrl,
          }))
          await page.setCookie(...formattedCookies)
        }
      } catch (e) {
        console.error('Failed to set cookies', e)
      }
    }

    if (data.localStorage || data.sessionStorage) {
      await page.goto(contextUrl, { waitUntil: 'domcontentloaded' })

      if (data.localStorage) {
        try {
          const storage = typeof data.localStorage === 'string' ? JSON.parse(data.localStorage) : data.localStorage
          await page.evaluate((items: any) => {
            if (Array.isArray(items)) {
              items.forEach((item) => {
                if (item.key) localStorage.setItem(item.key, item.value || '')
              })
            } else {
              for (const key in items) {
                localStorage.setItem(key, items[key])
              }
            }
          }, storage)
        } catch (e) {
          console.error('Failed to set localStorage', e)
        }
      }

      if (data.sessionStorage) {
        try {
          const storage = typeof data.sessionStorage === 'string' ? JSON.parse(data.sessionStorage) : data.sessionStorage
          await page.evaluate((items: any) => {
            if (Array.isArray(items)) {
              items.forEach((item) => {
                if (item.key) sessionStorage.setItem(item.key, item.value || '')
              })
            } else {
              for (const key in items) {
                sessionStorage.setItem(key, items[key])
              }
            }
          }, storage)
        } catch (e) {
          console.error('Failed to set sessionStorage', e)
        }
      }
    }
  }
}

// IPC handler
process.on('message', async (msg: any) => {
  if (msg?.type === 'cancel') {
    cancelled = true
    try {
      if (currentBrowser) await currentBrowser.close()
    } catch {}
    return
  }

  if (msg?.type === 'run') {
    const result = await runTask(msg.payload)
    if (process.send) {
      process.send({ type: 'done', result })
    }
    process.exit(0)
  }
})
