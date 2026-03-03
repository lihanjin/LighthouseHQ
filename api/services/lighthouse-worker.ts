import puppeteer from 'puppeteer'
import lighthouse from 'lighthouse'
import { URL } from 'url'
import { db } from '../db.js'
import { reports, tasks } from '../schema.js'
import { eq, sql } from 'drizzle-orm'

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
    const currentTaskRows = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    const currentTask = currentTaskRows[0]
    if (currentTask?.status === 'cancelled' || cancelled) {
      console.log(`[Worker Task ${taskId}] Cancelled before start.`)
      return { taskId, status: 'cancelled' }
    }

    await db.execute(sql`
      update tasks
      set status = 'running', started_at = now(), progress = 1
      where id = ${taskId}
    `)

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

      const checkTaskRows = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1)
      const checkTask = checkTaskRows[0]
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

          const checkTaskDeviceRows = await db
            .select({ status: tasks.status })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1)
          const checkTaskDevice = checkTaskDeviceRows[0]
          if (checkTaskDevice?.status === 'cancelled') {
            console.log(`[Worker Task ${taskId}] Cancelled during execution (device loop).`)
            throw new Error('Task Cancelled')
          }

          const normalizedLocation = Array.isArray(currentLocation)
            ? currentLocation[0]
            : typeof currentLocation === 'string'
              ? (currentLocation.trim().startsWith('[') ? (() => { try { const parsed = JSON.parse(currentLocation); return Array.isArray(parsed) ? parsed[0] : currentLocation } catch { return currentLocation } })() : currentLocation)
              : String(currentLocation || 'us-east')

          const created = (await db.execute(sql`
            insert into reports (task_id, url, device, location, status, lighthouse_data)
            values (${taskId}, ${url}, ${currentDevice}, ${normalizedLocation}, 'pending', ${JSON.stringify({})}::jsonb)
            returning id
          `)) as unknown as { rows: Array<{ id: string }> }

          const reportRecord = created.rows?.[0]
          if (!reportRecord?.id) {
            console.error(`[Worker Task ${taskId}] Failed to create report record for ${url} (${currentDevice})`)
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

            await db.execute(sql`
              update reports
              set
                lighthouse_data = ${JSON.stringify(report)}::jsonb,
                html_report = ${String(htmlReport)},
                performance_score = ${scores.performance},
                accessibility_score = ${scores.accessibility},
                best_practices_score = ${scores.bestPractices},
                seo_score = ${scores.seo},
                fcp = ${metrics.fcp ?? null},
                lcp = ${metrics.lcp ?? null},
                tbt = ${metrics.tbt ?? null},
                cls = ${metrics.cls ?? null},
                speed_index = ${metrics.speed_index ?? null},
                total_byte_weight = ${metrics.total_byte_weight ?? null},
                status = 'completed',
                screenshot = ${screenshot ?? null},
                error_message = null
              where id = ${reportRecord.id}
            `)
          } catch (err: any) {
            if (err?.message === 'Task Cancelled') throw err
            console.error(`[Worker Task ${taskId}] Failed to audit ${url}:`, err)
            await db.execute(sql`
              update reports
              set status = 'failed', error_message = ${err?.message || String(err)}
              where id = ${reportRecord.id}
            `)
          }

          completedCount++
          const progress = Math.round((completedCount / totalEstimate) * 100)
          await db.execute(sql`
            update tasks set progress = ${progress} where id = ${taskId}
          `)
        }
      }
    }

    if (!cancelled) {
      const finalCheckRows = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1)
      const finalCheck = finalCheckRows[0]
      if (finalCheck?.status !== 'cancelled') {
        await db.execute(sql`
          update tasks
          set status = 'completed', completed_at = now(), progress = 100
          where id = ${taskId}
        `)
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
    await db.execute(sql`update tasks set status = 'failed' where id = ${taskId}`)
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
