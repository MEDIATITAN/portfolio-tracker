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
  cash_type       TEXT CHECK (cash_type IN ('CHECKING','SAVINGS','PHYSICAL','FOREIGN','WORK')),
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

CREATE TABLE IF NOT EXISTS intraday_prices (
  identifier      TEXT NOT NULL,
  asset_class     TEXT NOT NULL,
  ts              TEXT NOT NULL,
  price           REAL NOT NULL,
  currency        TEXT NOT NULL,
  PRIMARY KEY (identifier, ts)
);
CREATE INDEX IF NOT EXISTS idx_intraday_prices_ts ON intraday_prices(ts);

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

-- Monatliche Einnahmen und Fixkosten. Bewusst OHNE Bezug zu den Positionen: hier geht es um
-- den laufenden Geldfluss, nicht um Vermögen. Ein Gehalt ist kein Vermögenswert.
-- Die Spalte heißt period und nicht interval - letzteres ist in manchen SQL-Dialekten ein
-- Schlüsselwort, und der Name soll auch bei einem späteren Wechsel tragen.
CREATE TABLE IF NOT EXISTS budget_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL CHECK (type IN ('INCOME','EXPENSE')),
  name        TEXT NOT NULL,
  amount      REAL NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  period      TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (period IN ('MONTHLY','QUARTERLY','YEARLY')),
  category    TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Tatsächlich auf ein Konto gebuchte Monatsraten eines Budgetpostens.
-- UNIQUE über Posten und Monat ist die eigentliche Absicherung: derselbe Monat kann nicht zweimal
-- abgebucht werden, auch nicht wenn der Kursabruf mehrfach am Tag läuft.
CREATE TABLE IF NOT EXISTS budget_bookings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_item_id  INTEGER NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  position_id     INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  month           TEXT NOT NULL,
  amount          REAL NOT NULL,
  -- Gesetzt, wenn die Buchung zurückgenommen wurde. Die Zeile bleibt bewusst stehen: sie ist der
  -- Beleg, dass dieser Monat schon behandelt wurde, und verhindert ein sofortiges Neubuchen.
  reverted_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (budget_item_id, month)
);
CREATE INDEX IF NOT EXISTS idx_budget_bookings_month ON budget_bookings(month);

-- Sparpläne. Anders als ein Budgetposten hängt ein Sparplan an einer Position - er kauft ein
-- bestimmtes Wertpapier, und aus jeder Ausführung wird eine Buchung im Ledger.
-- execution_day ist auf 1 bis 28 begrenzt: den 29. bis 31. gibt es nicht in jedem Monat, und ein
-- Plan, der im Februar ausfällt, wäre ein schwer zu findender Fehler.
CREATE TABLE IF NOT EXISTS savings_plans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id    INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  amount         REAL NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  period         TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (period IN ('MONTHLY','QUARTERLY','YEARLY')),
  execution_day  INTEGER NOT NULL DEFAULT 1 CHECK (execution_day BETWEEN 1 AND 28),
  execution_time TEXT,
  start_date     TEXT NOT NULL,
  end_date       TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_savings_plans_position_id ON savings_plans(position_id);

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

-- Kursreihen der Vergleichsmaßstäbe (S&P 500, Anleihen, Gold, Rohstoffe) für den Analyse-Bereich.
-- Bewusst eine eigene Tabelle statt historical_prices mitzubenutzen: der Kanal historical:list
-- schickt jene Tabelle bei jedem Dashboard-Aufruf vollständig an den Renderer, und dort haben
-- Reihen, die zu keiner Position gehören, nichts zu suchen.
-- Die Kurse sind ausschüttungsbereinigt (Yahoo adjclose), also Total Return. Ohne das wäre der
-- Anleihenteil jedes Modells grob falsch: AGG steht seit 2020 beim reinen Kurs bei -14,6 %,
-- mit wiederangelegten Ausschüttungen bei +4,0 %.
CREATE TABLE IF NOT EXISTS benchmark_prices (
  identifier      TEXT NOT NULL,
  date            TEXT NOT NULL,
  price           REAL NOT NULL,
  currency        TEXT NOT NULL,
  PRIMARY KEY (identifier, date)
);
CREATE INDEX IF NOT EXISTS idx_benchmark_prices_identifier ON benchmark_prices(identifier);

-- Selbst angelegte Vergleichsmodelle des Analyse-Bereichs: ein Name und die Gewichte je Baustein.
-- Die Gewichte stehen als JSON in einer Spalte statt in eigenen Zeilen je Baustein. Sie werden
-- immer nur vollständig gelesen und vollständig ersetzt, nie einzeln abgefragt oder summiert -
-- eine zweite Tabelle mit Fremdschlüssel brächte hier nur Aufwand. Welche Schlüssel gültig sind,
-- gibt der Typ BenchmarkComponent vor; geschrieben wird ausschließlich über customModelRepo.
CREATE TABLE IF NOT EXISTS custom_benchmark_models (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  weights    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`

export const SEED_SETTINGS: Record<string, string> = {
  base_currency: 'EUR',
  auto_refresh_enabled: '1',
  auto_refresh_interval_minutes: '60'
}
