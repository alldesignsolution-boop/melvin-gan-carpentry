"""
Migration Phase 3: add followup_flag and status_changed_at to leads.
Run with: python -m services.migrate3
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
from database import init_db

DB_PATH = "data/melvin.db"


def run():
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    existing = {row[1] for row in cur.execute("PRAGMA table_info(leads)")}

    added = []
    if "followup_flag" not in existing:
        conn.execute("ALTER TABLE leads ADD COLUMN followup_flag INTEGER DEFAULT 0")
        added.append("followup_flag")
    if "status_changed_at" not in existing:
        conn.execute("ALTER TABLE leads ADD COLUMN status_changed_at DATETIME")
        added.append("status_changed_at")

    conn.commit()
    conn.close()

    if added:
        print(f"  Added columns: {', '.join(added)}")
    else:
        print("  Columns already exist, skipping.")
    print("Migration 3 complete.")


if __name__ == "__main__":
    run()
