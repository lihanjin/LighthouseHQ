import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * users 表（只定义 projects 路由用到的字段）
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * projects 表
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  defaultConfig: jsonb('default_config').$type<Record<string, unknown>>().notNull(),
  // urls 列在最新迁移中已经改成 jsonb，这里与数据库类型保持一致
  urls: jsonb('urls').$type<(string | { url: string; title?: string })[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * tasks 表（只包含目前路由用到的字段）
 */
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  userId: uuid('user_id').notNull(),
  projectId: uuid('project_id').notNull(),
  urls: text('urls').array().notNull(), // text[]
  device: text('device').array().notNull(), // text[]
  network: varchar('network', { length: 20 }).notNull(),
  authType: varchar('auth_type', { length: 20 }).notNull(),
  authData: jsonb('auth_data').$type<Record<string, unknown> | null>().notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  progress: integer('progress').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  location: text('location').notNull(),
})

/**
 * reports 表（只包含目前路由用到的字段）
 */
export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  taskId: uuid('task_id').notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  device: text('device'),
  location: text('location'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  lighthouseData: jsonb('lighthouse_data').notNull(),
  htmlReport: text('html_report'),
  performanceScore: integer('performance_score'),
  accessibilityScore: integer('accessibility_score'),
  bestPracticesScore: integer('best_practices_score'),
  seoScore: integer('seo_score'),
  fcp: numeric('fcp'),
  lcp: numeric('lcp'),
  tbt: numeric('tbt'),
  cls: numeric('cls'),
  speedIndex: numeric('speed_index'),
  totalByteWeight: numeric('total_byte_weight'),
  screenshot: text('screenshot'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})



