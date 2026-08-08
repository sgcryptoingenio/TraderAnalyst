import sqlite3
import pandas as pd
conn = sqlite3.connect("sabueso.db")
print("TRADES:")
try:
    df = pd.read_sql_query("SELECT id, session_id, symbol, entry_time, exit_time FROM trades LIMIT 10", conn)
    print(df)
except Exception as e:
    print(e)
print("\nUPLOAD_SESSIONS:")
try:
    print(pd.read_sql_query("SELECT * FROM upload_sessions LIMIT 5", conn))
except Exception as e:
    print(e)
