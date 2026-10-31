"""Product Radar bot: daily Amazon.in bestseller ranks + weekly IndiaMART wholesale prices.

Run:  python bot/radar_bot.py            (Amazon + due supplier prices)
      python bot/radar_bot.py amazon     (only Amazon)
      python bot/radar_bot.py suppliers  (only IndiaMART)
"""
import json
import os
import random
import re
import sqlite3
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "radar.sqlite"
SCHEMA = ROOT / "src" / "schema.sql"
SEED = Path(__file__).resolve().parent / "seed.json"
IST = timezone(timedelta(hours=5, minutes=30))
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "en-IN,en;q=0.9",
}
SUPPLIER_BATCH = 15
SUPPLIER_EVERY_DAYS = 7
UNITS = "Piece|Pieces|Pack|Set|Unit|Pair|Box|Kit"


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def today():
    return datetime.now(IST).strftime("%Y-%m-%d")


def env(key):
    value = os.environ.get(key)
    if value:
        return value
    path = ROOT / ".env"
    for line in path.read_text(encoding="utf-8").splitlines() if path.exists() else []:
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip()
    return None


class Database:
    """SQLite on the PC, Postgres (Neon) when DATABASE_URL is set; queries use ? placeholders."""

    def __init__(self):
        url = env("DATABASE_URL")
        schema = SCHEMA.read_text(encoding="utf-8")
        self.pg = bool(url)
        if self.pg:
            import psycopg
            self.conn = psycopg.connect(url)
            self.conn.execute(schema.replace("INTEGER PRIMARY KEY", "SERIAL PRIMARY KEY"))
        else:
            DB_PATH.parent.mkdir(exist_ok=True)
            self.conn = sqlite3.connect(DB_PATH, timeout=30)
            self.conn.execute("PRAGMA journal_mode = WAL")
            self.conn.executescript(schema)
        self.conn.commit()

    def execute(self, sql, args=()):
        return self.conn.execute(sql.replace("?", "%s") if self.pg else sql, args)

    def commit(self):
        self.conn.commit()


def connect():
    db = Database()
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    for p, n, name in seed["categories"]:
        db.execute("INSERT INTO categories (node, parent, name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", (f"{p}/{n}", p, name))
    for keyword, slug in seed["keywords"]:
        db.execute("INSERT INTO keywords (keyword, slug) VALUES (?, ?) ON CONFLICT DO NOTHING", (keyword, slug))
    db.commit()
    return db


def get(session, url):
    # One retry after a long pause when the site rate-limits us
    for attempt in range(2):
        r = session.get(url, headers=HEADERS, timeout=25)
        if r.status_code not in (429, 503):
            return r
        time.sleep(60)
    return r


def to_num(text):
    try:
        return float(text.replace(",", ""))
    except (AttributeError, ValueError):
        return None


def parse_bestsellers(html):
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for card in soup.select("div[data-asin]"):
        asin = card.get("data-asin")
        badge = card.select_one(".zg-bdg-text")
        img = card.select_one("img")
        if not asin or not badge or not img:
            continue
        price = card.select_one(".a-price .a-offscreen") or card.select_one("[class*=price]")
        stars = card.select_one("a[aria-label*='out of 5 stars']")
        rating = reviews = None
        if stars:
            m = re.search(r"([\d.]+) out of 5 stars, ([\d,]+)", stars["aria-label"])
            if m:
                rating, reviews = float(m.group(1)), int(m.group(2).replace(",", ""))
        p = to_num(re.sub(r"[^\d.,]", "", price.get_text())) if price else None
        items.append({
            "asin": asin,
            "rank": int(badge.get_text(strip=True).lstrip("#").replace(",", "")),
            "name": img.get("alt", "").strip()[:300],
            "image": img.get("src"),
            "price": p if p and p < 200000 else None,
            "rating": rating,
            "reviews": reviews,
        })
    return items


def run_amazon(db, session):
    day, saved, failed = today(), 0, []
    cats = db.execute("SELECT id, node, name FROM categories WHERE enabled = 1").fetchall()
    for cat_id, node, name in cats:
        status = "ok"
        for page in (1, 2):
            r = get(session, f"https://www.amazon.in/gp/bestsellers/{node}/?pg={page}")
            items = parse_bestsellers(r.text) if r.status_code == 200 else []
            if not items:
                status = f"failed ({r.status_code})"
                break
            for it in items:
                db.execute(
                    """INSERT INTO products (asin, name, image, category_id, first_seen, last_seen)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(asin) DO UPDATE SET name = excluded.name, image = excluded.image,
                       last_seen = excluded.last_seen""",
                    (it["asin"], it["name"], it["image"], cat_id, day, day),
                )
                db.execute(
                    """INSERT INTO ranks (asin, category_id, day, rank, price, rating, reviews)
                       VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT (asin, category_id, day) DO UPDATE SET rank = excluded.rank,
                       price = excluded.price, rating = excluded.rating, reviews = excluded.reviews""",
                    (it["asin"], cat_id, day, it["rank"], it["price"], it["rating"], it["reviews"]),
                )
                saved += 1
            time.sleep(random.uniform(4, 7))
        if status != "ok":
            failed.append(name)
        db.execute("UPDATE categories SET last_fetch = ?, last_status = ? WHERE id = ?", (now(), status, cat_id))
        db.commit()
        print(f"  {name}: {status}")
    return f"Amazon: {saved} ranks from {len(cats) - len(failed)}/{len(cats)} categories" + (
        f", failed: {', '.join(failed)}" if failed else "")


def parse_supplier_prices(html):
    prices = [to_num(p) for p, _ in re.findall(rf"₹\s?([\d,]+(?:\.\d+)?)\s*/\s*({UNITS})\b", html)]
    return sorted(p for p in prices if p and p > 0)


def run_suppliers(db, session):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=SUPPLIER_EVERY_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    due = db.execute(
        """SELECT slug FROM keywords WHERE checked_at IS NULL OR checked_at < ? OR status = 'blocked'
           GROUP BY slug ORDER BY MIN(COALESCE(checked_at, '')) LIMIT ?""",
        (cutoff, SUPPLIER_BATCH),
    ).fetchall()
    done = 0
    for (slug,) in due:
        r = get(session, f"https://dir.indiamart.com/impcat/{slug}.html")
        if r.status_code == 429:
            db.execute("UPDATE keywords SET status = 'blocked', checked_at = ? WHERE slug = ?", (now(), slug))
            db.commit()
            print("  IndiaMART rate limit hit, rest will run next time")
            break
        prices = parse_supplier_prices(r.text) if r.status_code == 200 else []
        if prices:
            row = ("ok", len(prices), prices[0], prices[len(prices) // 4], statistics.median(prices))
        else:
            row = ("missing", 0, None, None, None)
        db.execute(
            "UPDATE keywords SET status = ?, n = ?, min_price = ?, p25 = ?, median = ?, checked_at = ? WHERE slug = ?",
            (*row, now(), slug),
        )
        db.commit()
        done += 1
        print(f"  {slug}: {row[0]} ({row[1]} prices)")
        time.sleep(random.uniform(6, 10))
    return f"IndiaMART: {done}/{len(due)} supplier pages checked"


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    db = connect()
    run_id = db.execute(
        "INSERT INTO runs (started_at, status) VALUES (?, 'running') RETURNING id", (now(),)
    ).fetchone()[0]
    db.commit()
    session, notes, status = requests.Session(), [], "ok"
    try:
        if mode in ("all", "amazon"):
            notes.append(run_amazon(db, session))
        if mode in ("all", "suppliers"):
            notes.append(run_suppliers(db, session))
    except Exception as e:
        db.conn.rollback()
        status = "error"
        notes.append(f"Error: {e}")
    db.execute(
        "UPDATE runs SET finished_at = ?, status = ?, message = ? WHERE id = ?",
        (now(), status, " | ".join(notes), run_id),
    )
    db.commit()
    print(" | ".join(notes))


if __name__ == "__main__":
    main()
