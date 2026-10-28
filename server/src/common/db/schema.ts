import { pgTable, varchar, text, doublePrecision, integer, timestamp, uuid, boolean, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
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
},
// Two people can never have the same name, whatever the capital letters (an empty name doesn't count)
(t) => [uniqueIndex('users_name_lower_unique').on(sql`lower(${t.name})`)]);

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

// A password reset code that was emailed (one per person; stored as a hash, never the code itself)
export const passwordResetCodes = pgTable('password_reset_codes', {
  userId: varchar('user_id', { length: 255 }).primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  // Wrong guesses so far: the code stops working after a few
  attempts: integer('attempts').default(0).notNull(),
  lastSentAt: timestamp('last_sent_at').defaultNow().notNull(),
});

// App-wide switches admins can change (key, then 'true' or 'false')
export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 50 }).primaryKey(),
  value: text('value').notNull(),
  updatedBy: varchar('updated_by', { length: 255 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Kinds of tree that people choose from when planting. Admins manage them.
export const treeCategories = pgTable('tree_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: varchar('description', { length: 500 }),
  createdBy: varchar('created_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Registered Trees Table
export const trees = pgTable('trees', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  // The kind of tree, by name (kept in step with its category's name)
  species: varchar('species', { length: 255 }).notNull(),
  // The category it was planted under; empty for trees that were planted before categories existed
  categoryId: uuid('category_id').references(() => treeCategories.id, { onDelete: 'set null' }),
  description: text('description'),
  photoUrl: text('photo_url').notNull(),
  photoPublicId: varchar('photo_public_id', { length: 255 }),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  address: varchar('address', { length: 500 }),
  healthScore: integer('health_score').default(100).notNull(),
  // An old tree: planted before the app, marked on the map later. It is already part of the home page's starting number, so it does not add to the count.
  isOld: boolean('is_old').default(false).notNull(),
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
  // "Trees in this category"
  index('trees_category_id_idx').on(t.categoryId),
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
}, (t) => [
  // A tree's care history (newest first) and the cascade when a tree is deleted
  index('care_logs_tree_idx').on(t.treeId, t.performedAt),
]);

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
  // SCHEDULED until an admin marks it COMPLETED. The summary and pictures are only shown to
  // people who can see the drive once it is completed (admins see them while preparing).
  status: varchar('status', { length: 10 }).default('SCHEDULED').notNull(),
  summary: text('summary'),
  // Kilograms of waste collected at a clean-up drive, entered when an admin completes it (counts toward the home page total only while the drive is COMPLETED)
  wasteKg: integer('waste_kg'),
  completedAt: timestamp('completed_at'),
  completedBy: varchar('completed_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Pictures an admin adds to a drive
export const drivePhotos = pgTable(
  'drive_photos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    driveId: uuid('drive_id').references(() => drives.id, { onDelete: 'cascade' }).notNull(),
    url: text('url').notNull(),
    publicId: varchar('public_id', { length: 255 }),
    uploadedBy: varchar('uploaded_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('drive_photos_drive_idx').on(t.driveId, t.createdAt)]
);

// The bell in the app: one row per person per notification
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Who it is for
    userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    // DRIVE_SCHEDULED, USER_JOINED, TREE_PLANTED or PLACE_SUGGESTED
    type: varchar('type', { length: 30 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    // Where tapping it goes, inside the site ("/?drive=...", "/map?tree=...")
    link: varchar('link', { length: 500 }),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_user_unread_idx').on(t.userId).where(sql`read_at is null`),
  ]
);

// A form an admin puts up asking people where we could plant trees or hold a clean-up drive
export const placeForms = pgTable(
  'place_forms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    // What the places are for: PLANTATION, CLEANUP or EITHER (then each person says which)
    kind: varchar('kind', { length: 20 }).default('PLANTATION').notNull(),
    // OPEN takes suggestions, CLOSED doesn't (it stays visible)
    status: varchar('status', { length: 10 }).default('OPEN').notNull(),
    // Up to two extra questions the admin asks; every one has to be answered
    questions: jsonb('questions').$type<string[]>().default([]).notNull(),
    createdBy: varchar('created_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('place_forms_status_created_idx').on(t.status, t.createdAt)]
);

// One place someone sent through a form
export const placeSuggestions = pgTable(
  'place_suggestions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    formId: uuid('form_id').notNull().references(() => placeForms.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
    // PLANTATION or CLEANUP
    kind: varchar('kind', { length: 20 }).notNull(),
    // The pin on our map; empty when only a Google Maps link without coordinates was given
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    googleMapsUrl: varchar('google_maps_url', { length: 1000 }),
    landmark: varchar('landmark', { length: 255 }).notNull(),
    // Each question as it was asked, with the answer (so editing the form later doesn't change old answers)
    answers: jsonb('answers').$type<{ question: string; answer: string }[]>().default([]).notNull(),
    // Up to 5 pictures of the place
    photos: jsonb('photos').$type<{ url: string; publicId: string }[]>().default([]).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('place_suggestions_form_created_idx').on(t.formId, t.createdAt)]
);

// A photo slot handed out to someone who is about to upload straight to Cloudinary. The slot is used up when the photo
// is attached to a tree, care entry, drive or place, so a photo can only be used once and only by the person it was
// issued to. Slots nobody used (and the photos uploaded into them) are removed by common/services/uploadSweeper.ts.
export const uploadTickets = pgTable(
  'upload_tickets',
  {
    // The photo's full Cloudinary id, chosen by the server: plantree/<kind>/<user id>/<random>
    publicId: varchar('public_id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    // TREE, CARE, DRIVE or PLACE
    kind: varchar('kind', { length: 10 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('upload_tickets_user_idx').on(t.userId), index('upload_tickets_created_idx').on(t.createdAt)]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Tree = typeof trees.$inferSelect;
export type NewTree = typeof trees.$inferInsert;
export type CareLog = typeof careLogs.$inferSelect;
export type NewCareLog = typeof careLogs.$inferInsert;
export type Drive = typeof drives.$inferSelect;
export type DrivePhoto = typeof drivePhotos.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type PlaceForm = typeof placeForms.$inferSelect;
export type PlaceSuggestion = typeof placeSuggestions.$inferSelect;
