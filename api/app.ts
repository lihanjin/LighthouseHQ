/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import taskRoutes from './routes/tasks.js'
import reportRoutes from './routes/reports.js'
import { db } from './db.js'
import { sql } from 'drizzle-orm'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

// Run one-time migrations
db.execute(sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS source varchar(20) DEFAULT 'local'`)
  .catch((e) => console.error('[Migration] Failed to add source column:', e))

db.execute(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_text varchar(500)`)
  .catch((e) => console.error('[Migration] Failed to add status_text column:', e))

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/reports', reportRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * Production Static Files
 */
if (process.env.NODE_ENV === 'production') {
  // when using tsx api/server.ts, __dirname is /app/api, so dist is at /app/dist (../dist)
  const distPath = path.join(__dirname, '../dist')
  
  // Serve static files
  app.use(express.static(distPath))

  // Handle SPA routing - return index.html for all non-API routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next()
    }
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
