export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS positions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_class     TEXT NOT NULL CHECK (asset_class IN ('STOCK_ETF','CRYPTO','COMMODITY','CASH_OTHER')),
  security_type   TEXT CHECK (security_type IN ('STOCK','ETF')),
  name            TEXT NOT NULL,
  symbol          TEXT,
  identifier      TEXT,
  isin            TEXT,
  quantity        REAL NOT NULL DEFAULT 1,
  quantity_unit   TEXT CHECK (quantity_unit IN ('GRAM','KG','TROY_OUNCE')),
  currency        TEXT NOT NULL DEFAULT 'EUR',
  avg_cost_basis  REAL,
  manual_value    REAL,
  sector          TEXT,
  region          TEXT,
  sub_type        TEXT CHECK (sub_type IN ('CASH','BOND','REAL_ESTATE','OTHER')),
  purchase_date   TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS price_cache (
  identifier      TEXT PRIMARY KEY,
  asset_class     TEXT NOT NULL,
  price           REAL NOT NULL,
  currency        TEXT NOT NULL,
  fetched_at      TEXT NOT NULL,
  fetch_error     TEXT
);

CREATE TABLE IF NOT EXISTS fx_rates (
  base            TEXT NOT NULL,
  quote           TEXT NOT NULL,
  rate            REAL NOT NULL,
  fetched_at      TEXT NOT NULL,
  PRIMARY KEY (base, quote)
);

CREATE TABLE IF NOT EXISTS historical_prices (
  identifier      TEXT NOT NULL,
  asset_class     TEXT NOT NULL,
  date            TEXT NOT NULL,
  price           REAL NOT NULL,
  currency        TEXT NOT NULL,
  PRIMARY KEY (identifier, date)
);
CREATE INDEX IF NOT EXISTS idx_historical_prices_identifier ON historical_prices(identifier);

CREATE TABLE IF NOT EXISTS historical_fx_rates (
  base            TEXT NOT NULL,
  quote           TEXT NOT NULL,
  date            TEXT NOT NULL,
  rate            REAL NOT NULL,
  PRIMARY KEY (base, quote, date)
);

CREATE TABLE IF NOT EXISTS value_snapshots (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at          TEXT NOT NULL,
  total_value_eur   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id   INTEGER NOT NULL REFERENCES value_snapshots(id) ON DELETE CASCADE,
  asset_class   TEXT NOT NULL,
  value_eur     REAL NOT NULL,
  UNIQUE (snapshot_id, asset_class)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_items_snapshot_id ON snapshot_items(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_value_snapshots_taken_at ON value_snapshots(taken_at);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS etf_composition (
  identifier  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('SECTOR','COUNTRY')),
  label       TEXT NOT NULL,
  weight      REAL NOT NULL,
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (identifier, kind, label)
);
CREATE INDEX IF NOT EXISTS idx_etf_composition_identifier ON etf_composition(identifier);

CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id     INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('BUY','SELL')),
  quantity        REAL NOT NULL,
  price           REAL NOT NULL,
  currency        TEXT NOT NULL,
  date            TEXT NOT NULL,
  broker          TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_position_id ON transactions(position_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
`

export const SEED_SETTINGS: Record<string, string> = {
  base_currency: 'EUR',
  auto_refresh_enabled: '1',
  auto_refresh_interval_minutes: '60'
}
