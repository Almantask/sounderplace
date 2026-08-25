-- Sunderplace v1 catalog + auth + commerce, with v2 seller/duplicate hooks.
PRAGMA foreign_keys = ON;

CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX session_user_id_idx ON session(user_id);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX account_user_id_idx ON account(user_id);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ambience', 'fx')),
  category TEXT NOT NULL,
  owner_type TEXT NOT NULL DEFAULT 'platform' CHECK (owner_type IN ('platform', 'user')),
  owner_user_id TEXT REFERENCES user(id),
  listing_status TEXT NOT NULL DEFAULT 'live' CHECK (
    listing_status IN ('draft', 'pending_review', 'approved', 'rejected', 'live')
  ),
  listing_fee_cents_paid INTEGER NOT NULL DEFAULT 0,
  commission_bps INTEGER NOT NULL DEFAULT 0,
  review_notes TEXT,
  price_snapshot_cents INTEGER NOT NULL DEFAULT 0,
  price_update_pass_cents INTEGER NOT NULL DEFAULT 0,
  featured_eligible INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX packs_kind_category_idx ON packs(kind, category);
CREATE INDEX packs_owner_idx ON packs(owner_type, owner_user_id);
CREATE INDEX packs_listing_status_idx ON packs(listing_status);

CREATE TABLE pack_versions (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  changelog TEXT NOT NULL DEFAULT 'Initial release',
  zip_r2_key TEXT,
  published_at INTEGER NOT NULL,
  UNIQUE (pack_id, version)
);

CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  pack_version_id TEXT NOT NULL REFERENCES pack_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 8,
  full_r2_key TEXT,
  preview_r2_key TEXT,
  content_sha256 TEXT,
  chromaprint TEXT,
  clap_vector_id TEXT,
  duplicate_of_track_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX tracks_sha256_idx ON tracks(content_sha256);
CREATE INDEX tracks_chromaprint_idx ON tracks(chromaprint);
CREATE INDEX tracks_pack_version_idx ON tracks(pack_version_id);

CREATE TABLE track_tags (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('mood', 'instrument')),
  value TEXT NOT NULL
);
CREATE INDEX track_tags_track_idx ON track_tags(track_id);
CREATE INDEX track_tags_value_idx ON track_tags(kind, value);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  license TEXT NOT NULL CHECK (license IN ('snapshot', 'update_pass')),
  snapshot_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, pack_id)
);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  pack_id TEXT NOT NULL REFERENCES packs(id),
  license TEXT NOT NULL CHECK (license IN ('snapshot', 'update_pass')),
  amount_cents INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX purchases_pack_idx ON purchases(pack_id);

CREATE TABLE download_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX download_events_pack_user_idx ON download_events(pack_id, user_id, created_at);

CREATE TABLE donations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id),
  amount_cents INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE listing_reviews (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  duplicate_hits INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
