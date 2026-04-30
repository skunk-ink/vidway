PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS listings (
  id              TEXT PRIMARY KEY,            -- uuid v4
  share_url       TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  duration_sec    REAL NOT NULL,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  thumbnail       BLOB NOT NULL,
  thumbnail_mime  TEXT NOT NULL DEFAULT 'image/jpeg',

  uploader_pubkey TEXT NOT NULL,               -- "ed25519:..." string
  valid_until     INTEGER NOT NULL,            -- unix seconds, denormalized from share_url
  created_at      INTEGER NOT NULL,            -- unix seconds
  updated_at      INTEGER NOT NULL,            -- unix seconds

  -- Probe state (Phase 3)
  probe_status    TEXT NOT NULL DEFAULT 'unknown',  -- 'alive' | 'dead' | 'unknown'
  probed_at       INTEGER
);

CREATE INDEX IF NOT EXISTS listings_uploader  ON listings(uploader_pubkey);
CREATE INDEX IF NOT EXISTS listings_created   ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS listings_status    ON listings(probe_status, valid_until);

-- Full-text search over title + description
CREATE VIRTUAL TABLE IF NOT EXISTS listings_fts USING fts5(
  title, description,
  content='listings', content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS listings_ai AFTER INSERT ON listings BEGIN
  INSERT INTO listings_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS listings_ad AFTER DELETE ON listings BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, title, description)
    VALUES('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS listings_au AFTER UPDATE ON listings BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, title, description)
    VALUES('delete', old.rowid, old.title, old.description);
  INSERT INTO listings_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;

-- Used nonces, for replay protection. Pruned to last 24h by the worker.
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce       TEXT PRIMARY KEY,
  pubkey      TEXT NOT NULL,
  used_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS used_nonces_used_at ON used_nonces(used_at);

-- Flags from viewers (lightweight moderation). Stored, not auto-acted on.
-- An operator reviews via the admin CLI. ip_hash is sha256(ip + daily salt)
-- so we can detect spam without storing real IPs.
CREATE TABLE IF NOT EXISTS flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,                       -- 'illegal' | 'spam' | 'broken' | 'other'
  detail      TEXT,
  created_at  INTEGER NOT NULL,
  ip_hash     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS flags_listing ON flags(listing_id);
CREATE INDEX IF NOT EXISTS flags_created ON flags(created_at DESC);
