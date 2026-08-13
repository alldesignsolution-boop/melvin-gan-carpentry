"""
Migration: Phase 1.5 schema updates.
Safe to run multiple times (checks before altering).
Run with: python -m services.migrate
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
import hashlib
from datetime import datetime
from database import init_db, engine

DB_PATH = "data/melvin.db"

NEW_COLUMNS = [
    ("leads", "lost_reason",    "TEXT"),
    ("leads", "source_channel", "TEXT"),
    ("leads", "project_type",   "TEXT"),
    ("leads", "last_follow_up", "DATETIME"),
]


def column_exists(conn, table, col):
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(row[1] == col for row in cur.fetchall())


def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def run():
    # 1. Create any missing tables (User, etc.)
    init_db()

    conn = sqlite3.connect(DB_PATH)
    try:
        # 2. Add new columns to leads
        for table, col, col_type in NEW_COLUMNS:
            if not column_exists(conn, table, col):
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
                print(f"  Added column: {table}.{col}")
            else:
                print(f"  Already exists: {table}.{col}")
        conn.commit()

        # 3. Seed default users if none exist
        cur = conn.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] == 0:
            users = [
                ("melvin", hash_pw("hoga@2026"),        "Melvin",          "admin"),
                ("sales2", hash_pw("hoga_sales2_2024"), "Sales 2",         "sales"),
                ("sales3", hash_pw("hoga_sales3_2024"), "Sales 3",         "sales"),
            ]
            now = datetime.utcnow().isoformat()
            conn.executemany(
                "INSERT INTO users (username, password_hash, full_name, role, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                [(u[0], u[1], u[2], u[3], now) for u in users]
            )
            conn.commit()
            print("\n  Default users created:")
            print("    melvin    / hoga@2026       (admin - sees all leads)")
            print("    sales2    / hoga_sales2_2024 (sales)")
            print("    sales3    / hoga_sales3_2024 (sales)")
        else:
            print("  Users table already has data, skipping seed.")

    finally:
        conn.close()

    print("\nMigration complete.")


if __name__ == "__main__":
    run()
