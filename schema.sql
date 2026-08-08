-- Archivo SQL para ejecutar en el SQL Editor de Supabase
-- Esto crea la estructura de la base de datos de Sabueso

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    mentor_id INTEGER,
    invite_code TEXT UNIQUE,
    help_link TEXT,
    name TEXT,
    photo_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    exchange TEXT,
    total_trades INTEGER,
    win_rate REAL,
    avg_win_amt REAL,
    avg_loss_amt REAL,
    total_pnl REAL,
    total_fees REAL DEFAULT 0,
    risk_reward_ratio REAL,
    full_data TEXT,
    file_path TEXT,
    upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    exchange_source TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    symbol TEXT,
    contract_type TEXT,
    side TEXT,
    entry_time TIMESTAMP,
    exit_time TIMESTAMP,
    entry_price REAL,
    exit_price REAL,
    size REAL,
    reported_pnl REAL,
    fee REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('mentorship_link', 'https://calendly.com/') ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_session_id ON trades(session_id);
