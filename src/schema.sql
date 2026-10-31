CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    node TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    parent TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_fetch TEXT,
    last_status TEXT
);
CREATE TABLE IF NOT EXISTS products (
    asin TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    buy_price REAL,
    note TEXT
);
CREATE TABLE IF NOT EXISTS ranks (
    asin TEXT NOT NULL REFERENCES products(asin) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    day TEXT NOT NULL,
    rank INTEGER NOT NULL,
    price REAL,
    rating REAL,
    reviews INTEGER,
    PRIMARY KEY (asin, category_id, day)
);
CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY,
    keyword TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    n INTEGER NOT NULL DEFAULT 0,
    min_price REAL,
    p25 REAL,
    median REAL,
    checked_at TEXT
);
CREATE TABLE IF NOT EXISTS watch (
    asin TEXT PRIMARY KEY,
    added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    message TEXT
);
CREATE INDEX IF NOT EXISTS idx_ranks_day ON ranks(day);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
