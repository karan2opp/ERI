import { pgTable, varchar, text, doublePrecision, integer, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users Table (Synced with Clerk Auth)
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  role: varchar('role', { length: 20 }).default('USER').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Registered Trees Table
export const trees = pgTable('trees', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  species: varchar('species', { length: 255 }).notNull(),
  description: text('description'),
  photoUrl: text('photo_url').notNull(),
  photoPublicId: varchar('photo_public_id', { length: 255 }),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  address: varchar('address', { length: 500 }),
  healthScore: integer('health_score').default(100).notNull(),
  lastWateredAt: timestamp('last_watered_at'),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Care History & Maintenance Logs Table
export const careLogs = pgTable('care_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  treeId: uuid('tree_id').notNull().references(() => trees.id, { onDelete: 'cascade' }),
  actionType: varchar('action_type', { length: 50 }).notNull().default('WATERED'),
  notes: text('notes'),
  photoUrl: text('photo_url'),
  photoPublicId: varchar('photo_public_id', { length: 255 }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  performedAt: timestamp('performed_at').defaultNow().notNull(),
});

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  trees: many(trees),
  careLogs: many(careLogs),
}));

export const treesRelations = relations(trees, ({ one, many }) => ({
  owner: one(users, {
    fields: [trees.userId],
    references: [users.id],
  }),
  careLogs: many(careLogs),
}));

export const careLogsRelations = relations(careLogs, ({ one }) => ({
  tree: one(trees, {
    fields: [careLogs.treeId],
    references: [trees.id],
  }),
  performer: one(users, {
    fields: [careLogs.userId],
    references: [users.id],
  }),
}));



// Global Drives Table
export const drives = pgTable('drives', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  date: varchar('date', { length: 20 }).notNull(),
  time: varchar('time', { length: 20 }).notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  address: varchar('address', { length: 500 }),
  googleMapsUrl: varchar('google_maps_url', { length: 1000 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Tree = typeof trees.$inferSelect;
export type NewTree = typeof trees.$inferInsert;
export type CareLog = typeof careLogs.$inferSelect;
export type NewCareLog = typeof careLogs.$inferInsert;
export type Drive = typeof drives.$inferSelect;
