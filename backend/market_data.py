import ccxt
import pandas as pd
import sqlite3
import os
import pickle

# Instancias globales síncronas para evitar reiniciar la caché de markets y agilizar peticiones
CACHE_DB = os.path.join(os.path.dirname(__file__), 'market_cache.db')

def _init_cache_db():
    with sqlite3.connect(CACHE_DB) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS ohlcv_cache (
                cache_key TEXT PRIMARY KEY,
                data BLOB
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS price_cache (
                cache_key TEXT PRIMARY KEY,
                price REAL
            )
        ''')
        # Nueva arquitectura Time-Series base 5 minutos
        conn.execute('''
            CREATE TABLE IF NOT EXISTS market_candles_5m (
                symbol TEXT,
                timestamp INTEGER,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                volume REAL,
                PRIMARY KEY (symbol, timestamp)
            )
        ''')

_init_cache_db()
binance_ex = ccxt.binance({'enableRateLimit': False, 'timeout': 10000})
bybit_ex = ccxt.bybit({'enableRateLimit': False, 'timeout': 10000})
okx_ex = ccxt.okx({'enableRateLimit': False, 'timeout': 10000})
kucoin_ex = ccxt.kucoin({'enableRateLimit': False, 'timeout': 10000})

GLOBAL_EXCHANGES = [binance_ex, bybit_ex, okx_ex, kucoin_ex]

def fetch_ohlcv(symbol, timeframe='15m', limit=1000, since=None):
    """
    Descarga velas históricas usando CCXT.
    Implementa fallbacks secuenciales (Binance -> Bybit -> OKX) para evadir
    bloqueos geográficos de IP (muy comunes en servidores de nube como Render en US).
    """
    try:
        since_ms = None
        if since and pd.notna(since):
            try:
                since_ms = int(since.timestamp() * 1000)
            except (OSError, ValueError, AttributeError):
                since_ms = None
        
        clean_symbol = symbol.replace('USD', 'USDT')
        if '/' not in clean_symbol:
            clean_symbol = clean_symbol.replace('USDT', '/USDT')
            
        exchanges_to_try = GLOBAL_EXCHANGES
        
        ohlcv = None
        last_error = None
        
        for ex in exchanges_to_try:
            try:
                ohlcv = ex.fetch_ohlcv(clean_symbol, timeframe, since=since_ms, limit=limit)
                if ohlcv and len(ohlcv) > 0:
                    break # Éxito
            except Exception as e:
                last_error = e
                continue
                
        # Fallback final a BTC/USDT si el símbolo original falló en todos los exchanges
        if not ohlcv or len(ohlcv) == 0:
            for ex in exchanges_to_try:
                try:
                    ohlcv = ex.fetch_ohlcv('BTC/USDT', timeframe, since=since_ms, limit=limit)
                    if ohlcv and len(ohlcv) > 0:
                        break
                except Exception as e:
                    continue

        if not ohlcv or len(ohlcv) == 0:
            print(f"Error crítico: No se pudo obtener data de ningún exchange. Último error: {last_error}")
            return pd.DataFrame()
            
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df[['open', 'high', 'low', 'close', 'volume']] = df[['open', 'high', 'low', 'close', 'volume']].astype(float)
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True).dt.tz_localize(None)
        return df
    except Exception as e:
        print(f"Error fatal fetching data: {e}")
        return pd.DataFrame()


def resample_ohlcv(df_5m, timeframe):
    if timeframe == '5m' or df_5m.empty:
        return df_5m
    
    tf_map = {
        '1m': '1min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '1h',
        '4h': '4h',
        '1d': '1D'
    }
    rule = tf_map.get(timeframe)
    if not rule:
        return df_5m
        
    df = df_5m.copy()
    if pd.api.types.is_numeric_dtype(df['timestamp']):
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True).dt.tz_localize(None)
        
    df = df.set_index('timestamp')
    resampled = df.resample(rule).agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum'
    }).dropna().reset_index()
    return resampled

def fetch_and_cache_5m(symbol, start_time, end_time):
    start_ts = int(start_time.timestamp() * 1000)
    end_ts = int(end_time.timestamp() * 1000)
    
    with sqlite3.connect(CACHE_DB) as conn:
        df_db = pd.read_sql_query(
            "SELECT * FROM market_candles_5m WHERE symbol = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC",
            conn, params=(symbol, start_ts, end_ts)
        )
    
    expected_candles = max(1, (end_ts - start_ts) / 300000)
    
    if len(df_db) >= expected_candles * 0.95:
        df_db['timestamp'] = pd.to_datetime(df_db['timestamp'], unit='ms', utc=True).dt.tz_localize(None)
        return df_db
        
    clean_symbol = symbol.replace('USD', 'USDT')
    if '/' not in clean_symbol:
        clean_symbol = clean_symbol.replace('USDT', '/USDT')
        
    all_ohlcv = []
    since_ms = start_ts
    
    for _ in range(150):
        ohlcv = None
        for ex in GLOBAL_EXCHANGES:
            try:
                ohlcv = ex.fetch_ohlcv(clean_symbol, '5m', since=since_ms, limit=1000)
                if ohlcv and len(ohlcv) > 0:
                    break
            except Exception:
                continue
        
        if not ohlcv or len(ohlcv) == 0:
            for ex in GLOBAL_EXCHANGES:
                try:
                    ohlcv = ex.fetch_ohlcv('BTC/USDT', '5m', since=since_ms, limit=1000)
                    if ohlcv and len(ohlcv) > 0:
                        break
                except Exception:
                    continue
        
        if not ohlcv or len(ohlcv) == 0:
            break
            
        all_ohlcv.extend(ohlcv)
        last_ts = ohlcv[-1][0]
        if last_ts >= end_ts:
            break
        since_ms = last_ts + 1
        
    if not all_ohlcv:
        if not df_db.empty:
            df_db['timestamp'] = pd.to_datetime(df_db['timestamp'], unit='ms', utc=True).dt.tz_localize(None)
        return df_db
        
    df_new = pd.DataFrame(all_ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df_new['symbol'] = symbol
    df_new = df_new.drop_duplicates(subset=['timestamp'])
    
    records = df_new[['symbol', 'timestamp', 'open', 'high', 'low', 'close', 'volume']].values.tolist()
    with sqlite3.connect(CACHE_DB) as conn:
        conn.executemany('''
            INSERT OR REPLACE INTO market_candles_5m (symbol, timestamp, open, high, low, close, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', records)
        
    with sqlite3.connect(CACHE_DB) as conn:
        df_final = pd.read_sql_query(
            "SELECT * FROM market_candles_5m WHERE symbol = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC",
            conn, params=(symbol, start_ts, end_ts)
        )
    df_final['timestamp'] = pd.to_datetime(df_final['timestamp'], unit='ms', utc=True).dt.tz_localize(None)
    return df_final

def fetch_historical_data_range(symbol, start_time, end_time, timeframe='1h'):
    try:
        df_5m = fetch_and_cache_5m(symbol, start_time, end_time)
        if df_5m.empty:
            return df_5m
            
        resampled_df = resample_ohlcv(df_5m, timeframe)
        return resampled_df
    except Exception as e:
        print(f"Error fetching data range: {e}")
        return pd.DataFrame()

            
        df = pd.DataFrame(all_ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df[['open', 'high', 'low', 'close', 'volume']] = df[['open', 'high', 'low', 'close', 'volume']].astype(float)
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True).dt.tz_localize(None)
        
        # Limpiar duplicados por si acaso
        df = df.drop_duplicates(subset=['timestamp']).reset_index(drop=True)
        
        # Guardar en caché
        with sqlite3.connect(CACHE_DB) as conn:
            conn.execute('INSERT OR REPLACE INTO ohlcv_cache (cache_key, data) VALUES (?, ?)', (cache_key, pickle.dumps(df)))
            
        return df
        
    except Exception as e:
        print(f"Error fetching data range: {e}")
        return pd.DataFrame()

def get_historical_price(symbol, timestamp):
    """
    Obtiene el precio de cierre de la vela de 1m más cercana (hacia atrás) al timestamp dado.
    Ideal para calcular equivalencias USD de PnL en contratos COIN-M.
    """
    try:
        cache_key = f"{symbol}_{timestamp.timestamp()}"
        with sqlite3.connect(CACHE_DB) as conn:
            cursor = conn.execute('SELECT price FROM price_cache WHERE cache_key = ?', (cache_key,))
            row = cursor.fetchone()
            if row:
                return row[0]

        since_ms = int(timestamp.timestamp() * 1000) - 60000 # 1 minute before
        
        clean_symbol = symbol.replace('USD', 'USDT')
        if '/' not in clean_symbol:
            clean_symbol = clean_symbol.replace('USDT', '/USDT')
            
        ohlcv = None
        for ex in GLOBAL_EXCHANGES:
            try:
                ohlcv = ex.fetch_ohlcv(clean_symbol, '1m', since=since_ms, limit=2)
                if ohlcv and len(ohlcv) > 0:
                    break
            except:
                continue
            
        if ohlcv and len(ohlcv) > 0:
            # ohlcv[0] is [timestamp, open, high, low, close, volume]
            # ohlcv[-1] ensures we get the closest to the target time
            price = float(ohlcv[-1][4]) # close price
            with sqlite3.connect(CACHE_DB) as conn:
                conn.execute('INSERT OR REPLACE INTO price_cache (cache_key, price) VALUES (?, ?)', (cache_key, price))
            return price
        return None
    except Exception as e:
        print(f"Error fetching historical price for {symbol}: {e}")
        return None

def compute_indicators(df):
    """
    Calcula indicadores usando pandas puro para máxima compatibilidad
    """
    if df.empty:
        return df
        
    try:
        # RSI 14 (Wilder's Smoothing)
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        avg_gain = gain.ewm(alpha=1/14, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1/14, adjust=False).mean()
        rs = avg_gain / avg_loss
        df['RSI_14'] = 100 - (100 / (1 + rs))
        
        # Bollinger Bands 20
        df['SMA_20'] = df['close'].rolling(window=20).mean()
        std = df['close'].rolling(window=20).std()
        df['BBU_20'] = df['SMA_20'] + (std * 2)
        df['BBL_20'] = df['SMA_20'] - (std * 2)
        
        # EMAs
        df['EMA_9'] = df['close'].ewm(span=9, adjust=False).mean()
        df['EMA_21'] = df['close'].ewm(span=21, adjust=False).mean()
        df['EMA_50'] = df['close'].ewm(span=50, adjust=False).mean()
        df['EMA_200'] = df['close'].ewm(span=200, adjust=False).mean()
        
        # Nuevos Indicadores: Donchian Channels (Breakouts) y SMA de Volumen
        df['High_20'] = df['high'].rolling(window=20).max()
        df['Low_20'] = df['low'].rolling(window=20).min()
        df['Vol_SMA_20'] = df['volume'].rolling(window=20).mean()
        
        # MACD (12, 26, 9)
        ema_12 = df['close'].ewm(span=12, adjust=False).mean()
        ema_26 = df['close'].ewm(span=26, adjust=False).mean()
        df['MACD'] = ema_12 - ema_26
        df['MACD_Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
        df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']
        
        # VWAP (Daily Resets)
        df['Typical_Price'] = (df['high'] + df['low'] + df['close']) / 3
        df['Volume_TP'] = df['Typical_Price'] * df['volume']
        # Usamos cumsum por día
        df['date'] = df['timestamp'].dt.date
        df['Cum_Vol'] = df.groupby('date')['volume'].cumsum()
        df['Cum_Vol_TP'] = df.groupby('date')['Volume_TP'].cumsum()
        df['VWAP'] = df['Cum_Vol_TP'] / df['Cum_Vol']
        
        return df
    except Exception as e:
        print(f"Error computing indicators: {e}")
        return df
