"""
Migration Phase 2: create quotes, quote_items, invoices, counters tables.
Run with: python -m services.migrate2
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
from database import init_db

DB_PATH = "data/melvin.db"


def run():
    init_db()  # creates all missing tables via SQLAlchemy
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute("SELECT COUNT(*) FROM counters WHERE name IN ('quote','invoice')")
        if cur.fetchone()[0] == 0:
            conn.execute("INSERT INTO counters (name, value) VALUES ('quote', 0)")
            conn.execute("INSERT INTO counters (name, value) VALUES ('invoice', 0)")
            conn.commit()
            print("  Counters initialized: quote=0, invoice=0")
        else:
            print("  Counters already exist.")
    finally:
        conn.close()
    print("Migration 2 complete.")


if __name__ == "__main__":
    run()
