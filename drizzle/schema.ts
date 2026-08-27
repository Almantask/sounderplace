import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
)

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
})

export const packs = sqliteTable(
  'packs',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    kind: text('kind', { enum: ['ambience', 'fx'] }).notNull(),
    category: text('category').notNull(),
    ownerType: text('owner_type', { enum: ['platform', 'user'] }).notNull().default('platform'),
    ownerUserId: text('owner_user_id').references(() => user.id),
    listingStatus: text('listing_status', {
      enum: ['draft', 'pending_review', 'approved', 'rejected', 'live'],
    })
      .notNull()
      .default('live'),
    listingFeeCentsPaid: integer('listing_fee_cents_paid').notNull().default(0),
    commissionBps: integer('commission_bps').notNull().default(0),
    reviewNotes: text('review_notes'),
    priceSnapshotCents: integer('price_snapshot_cents').notNull().default(0),
    priceUpdatePassCents: integer('price_update_pass_cents').notNull().default(0),
    featuredEligible: integer('featured_eligible', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('packs_kind_category_idx').on(table.kind, table.category),
    index('packs_owner_idx').on(table.ownerType, table.ownerUserId),
    index('packs_listing_status_idx').on(table.listingStatus),
  ],
)

export const packVersions = sqliteTable(
  'pack_versions',
  {
    id: text('id').primaryKey(),
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    changelog: text('changelog').notNull().default('Initial release'),
    zipR2Key: text('zip_r2_key'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('pack_versions_pack_version_uidx').on(table.packId, table.version)],
)

export const tracks = sqliteTable(
  'tracks',
  {
    id: text('id').primaryKey(),
    packVersionId: text('pack_version_id')
      .notNull()
      .references(() => packVersions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    durationSeconds: integer('duration_seconds').notNull().default(8),
    fullR2Key: text('full_r2_key'),
    previewR2Key: text('preview_r2_key'),
    contentSha256: text('content_sha256'),
    chromaprint: text('chromaprint'),
    clapVectorId: text('clap_vector_id'),
    duplicateOfTrackId: text('duplicate_of_track_id'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('tracks_sha256_idx').on(table.contentSha256),
    index('tracks_chromaprint_idx').on(table.chromaprint),
    index('tracks_pack_version_idx').on(table.packVersionId),
  ],
)

export const trackTags = sqliteTable(
  'track_tags',
  {
    id: text('id').primaryKey(),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['mood', 'instrument'] }).notNull(),
    value: text('value').notNull(),
  },
  (table) => [index('track_tags_track_idx').on(table.trackId), index('track_tags_value_idx').on(table.kind, table.value)],
)

export const entitlements = sqliteTable(
  'entitlements',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id, { onDelete: 'cascade' }),
    license: text('license', { enum: ['snapshot', 'update_pass'] }).notNull(),
    snapshotVersion: text('snapshot_version').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('entitlements_user_pack_uidx').on(table.userId, table.packId)],
)

export const purchases = sqliteTable(
  'purchases',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id),
    license: text('license', { enum: ['snapshot', 'update_pass'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    stripeSessionId: text('stripe_session_id').unique(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('purchases_pack_idx').on(table.packId)],
)

export const downloadEvents = sqliteTable(
  'download_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('download_events_pack_user_idx').on(table.packId, table.userId, table.createdAt)],
)

export const donations = sqliteTable('donations', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => user.id),
  amountCents: integer('amount_cents').notNull(),
  stripeSessionId: text('stripe_session_id').unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const listingReviews = sqliteTable('listing_reviews', {
  id: text('id').primaryKey(),
  packId: text('pack_id')
    .notNull()
    .references(() => packs.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  duplicateHits: integer('duplicate_hits').notNull().default(0),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name'),
    email: text('email'),
    category: text('category', { enum: ['bug', 'idea', 'question', 'other'] })
      .notNull()
      .default('other'),
    message: text('message').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('feedback_created_at_idx').on(table.createdAt)],
)
