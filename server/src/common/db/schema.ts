import { pgTable, varchar, text, doublePrecision, integer, timestamp, uuid, boolean, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Users Table (Synced with Clerk Auth)
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  // USER (default), TEAM_MEMBER, ADMIN or SUPER_ADMIN
  role: varchar('role', { length: 20 }).default('USER').notNull(),
  avatarUrl: text('avatar_url'),
  // Optional phone number in international form (+919876543210). Not verified; only the person and admins can see it.
  phone: varchar('phone', { length: 20 }),
  // Email me about drives (people can turn this off in Account > Notifications)
  emailDrives: boolean('email_drives').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// A browser or phone that turned on push notifications (one person can have several)
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// App-wide switches admins can change (key, then 'true' or 'false')
export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 50 }).primaryKey(),
  value: text('value').notNull(),
  updatedBy: varchar('updated_by', { length: 255 }),
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
  // When the tree was actually planted (its "birth date"); can be earlier than when it was added to the map
  plantedAt: timestamp('planted_at').defaultNow().notNull(),
  // Last WATERED care log
  lastWateredAt: timestamp('last_watered_at'),
  // Last care of any kind (watered, fed, pruned, checked, grass removed)
  lastCaredAt: timestamp('last_cared_at'),
  // Last time it was fertilised, and last time the grass around it was removed
  lastFertilizedAt: timestamp('last_fertilized_at'),
  lastWeededAt: timestamp('last_weeded_at'),
  // Care schedule: how many days between each task (set when planting, editable later)
  waterEveryDays: integer('water_every_days').default(7).notNull(),
  fertilizeEveryDays: integer('fertilize_every_days').default(60).notNull(),
  weedEveryDays: integer('weed_every_days').default(30).notNull(),
  // VERIFIED trees are on the map. PENDING ones wait for an admin to check the photo (the automatic check wasn't sure).
  verificationStatus: varchar('verification_status', { length: 10 }).default('VERIFIED').notNull(),
  // Why it is pending, for the admin reviewing it
  verificationNote: varchar('verification_note', { length: 255 }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // The map asks for "verified trees in this area": a location index over verified trees only
  index('trees_verified_location_idx').on(t.latitude, t.longitude).where(sql`verification_status = 'VERIFIED'`),
  // "Mine" filters and per-person counts
  index('trees_user_id_idx').on(t.userId),
]);

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
  // PLANTATION (a tree plantation drive) or CLEANUP (a clean-up drive)
  type: varchar('type', { length: 20 }).default('PLANTATION').notNull(),
  // Who can see it: ALL (everyone, even signed-out visitors) or TEAM (team members and admins).
  // Admins always see every drive. New drives default to TEAM so nothing is public by accident.
  visibility: varchar('visibility', { length: 10 }).default('TEAM').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Tree = typeof trees.$inferSelect;
export type NewTree = typeof trees.$inferInsert;
export type CareLog = typeof careLogs.$inferSelect;
export type NewCareLog = typeof careLogs.$inferInsert;
export type Drive = typeof drives.$inferSelect;
