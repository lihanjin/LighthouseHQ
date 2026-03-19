#!/usr/bin/env node
/**
 * PSI Proxy - runs on the host machine to proxy PageSpeed Insights API requests.
 * The Docker container cannot reach PSI API directly due to NAT/IP issues.
 * Start with: node psi-proxy.mjs
 */
import http from 'node:http'
import https from 'node:https'

const PORT = 7788

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' || !req.url.startsWith('/psi?')) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const params = new URL(req.url, 'http://localhost').searchParams
  const targetUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`

  console.log(`[PSI Proxy] → ${params.get('url')} (${params.get('strategy')})`)

  const chunks = []
  const preq = https.get(targetUrl, { timeout: 120000 }, (pres) => {
    console.log(`[PSI Proxy] ← status ${pres.statusCode}`)
    pres.on('data', c => chunks.push(c))
    pres.on('end', () => {
      const body = Buffer.concat(chunks)
      res.writeHead(pres.statusCode, { 'Content-Type': 'application/json' })
      res.end(body)
      console.log(`[PSI Proxy] ✓ ${body.length} bytes`)
    })
    pres.on('error', e => {
      console.error(`[PSI Proxy] response error: ${e.message}`)
      res.writeHead(502)
      res.end(JSON.stringify({ error: e.message }))
    })
  })

  preq.on('error', e => {
    console.error(`[PSI Proxy] request error: ${e.message}`)
    res.writeHead(502)
    res.end(JSON.stringify({ error: e.message }))
  })

  preq.on('timeout', () => {
    preq.destroy()
    res.writeHead(504)
    res.end(JSON.stringify({ error: 'PSI request timed out' }))
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PSI Proxy listening on http://0.0.0.0:${PORT}`)
  console.log('Docker containers can reach it at http://host.docker.internal:7788')
})
