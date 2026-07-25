import sqlite3
import os

db_path = "sabueso.db"
if not os.path.exists(db_path):
    print(f"No DB found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, file_path, filename FROM reports ORDER BY id DESC LIMIT 5")
    rows = cur.fetchall()
    for r in rows:
        print(f"Report ID: {r['id']}, File: {r['filename']}, Path: {r['file_path']}")
