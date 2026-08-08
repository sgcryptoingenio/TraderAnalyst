import sqlite3
import os
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL")
DB_FILE = "sabueso.db"

class PostgresCursorAdapter:
    """
    Envoltura (Wrapper) para que el cursor de psycopg2 se comporte como el de sqlite3:
    1. Traduce '?' a '%s'.
    2. Emula 'cursor.lastrowid' usando 'RETURNING id'.
    """
    def __init__(self, cursor):
        self._cursor = cursor
        self._lastrowid = None

    def execute(self, query, params=None):
        # Traducir sintaxis de placeholders de SQLite a Postgres
        if params is not None:
            query = query.replace("?", "%s")
        
        # Si es un INSERT, Postgres no tiene un .lastrowid nativo
        # Añadimos RETURNING id para poder simularlo
        is_insert = query.strip().upper().startswith("INSERT")
        if is_insert and "RETURNING" not in query.upper():
            query = query.rstrip("; \n\r\t")
            query += " RETURNING id"

        self._cursor.execute(query, params)
        
        if is_insert:
            try:
                row = self._cursor.fetchone()
                if row:
                    self._lastrowid = row['id'] if 'id' in row else row[0]
            except Exception:
                pass
                
        return self

    @property
    def lastrowid(self):
        return self._lastrowid

    def fetchone(self): return self._cursor.fetchone()
    def fetchall(self): return self._cursor.fetchall()
    def fetchmany(self, size): return self._cursor.fetchmany(size)
    
    def __getattr__(self, name):
        return getattr(self._cursor, name)

class PostgresConnAdapter:
    """Envoltura para la conexión de Postgres"""
    def __init__(self, conn):
        self._conn = conn
    
    def cursor(self):
        return PostgresCursorAdapter(self._conn.cursor())
        
    def commit(self):
        self._conn.commit()
        
    def close(self):
        self._conn.close()

def init_db():
    if DATABASE_URL:
        # En Postgres (Supabase), se espera que el usuario corra el script SQL 
        # manualmente en su panel. No ejecutamos sentencias DDL (CREATE TABLE)
        # aquí para evitar conflictos con roles y permisos de nube.
        pass
    else:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                mentor_id INTEGER,
                invite_code TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN mentor_id INTEGER")
        except sqlite3.OperationalError:
            pass
            
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN invite_code TEXT")
        except sqlite3.OperationalError:
            pass
            
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN help_link TEXT")
        except sqlite3.OperationalError:
            pass
            
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN name TEXT")
        except sqlite3.OperationalError:
            pass
            
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN photo_data TEXT")
        except sqlite3.OperationalError:
            pass
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                exchange TEXT,
                total_trades INTEGER,
                win_rate REAL,
                avg_win_amt REAL,
                avg_loss_amt REAL,
                total_pnl REAL,
                risk_reward_ratio REAL,
                full_data TEXT,
                file_path TEXT,
                upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS upload_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                exchange_source TEXT,
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                symbol TEXT,
                contract_type TEXT,
                side TEXT,
                entry_time TIMESTAMP,
                exit_time TIMESTAMP,
                entry_price REAL,
                exit_price REAL,
                size REAL,
                reported_pnl REAL,
                fee REAL,
                FOREIGN KEY (session_id) REFERENCES upload_sessions (id) ON DELETE CASCADE
            )
        """)
        
        try:
            cursor.execute("ALTER TABLE trades ADD COLUMN fee REAL")
        except sqlite3.OperationalError:
            pass
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('mentorship_link', 'https://calendly.com/')")
        
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id ON upload_sessions(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_session_id ON trades(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        
        conn.commit()
        
        # Migración automática: Intentar agregar la columna email si no existe
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN email TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            # La columna probablemente ya existe
            pass
            
        conn.close()

def get_db_connection():
    if DATABASE_URL:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        # RealDictCursor permite acceder a los campos de la BD por nombre de columna
        # igual que con sqlite3.Row
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        return PostgresConnAdapter(conn)
    else:
        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

def get_db():
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()

# Inicializar Base de Datos en la importación
init_db()
