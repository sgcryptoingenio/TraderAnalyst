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

def fetch_historical_data_range(symbol, start_time, end_time, timeframe='1h'):
    """
    Descarga todo el rango histórico en bloques para evitar hacer peticiones individuales.
    """
    try:
        cache_key = f"{symbol}_{start_time.timestamp()}_{end_time.timestamp()}_{timeframe}"
        with sqlite3.connect(CACHE_DB) as conn:
            cursor = conn.execute('SELECT data FROM ohlcv_cache WHERE cache_key = ?', (cache_key,))
            row = cursor.fetchone()
            if row:
                cached_df = pickle.loads(row[0])
                if not cached_df.empty:
                    cols_to_num = ['open', 'high', 'low', 'close', 'volume']
                    existing_cols = [c for c in cols_to_num if c in cached_df.columns]
                    if existing_cols:
                        cached_df[existing_cols] = cached_df[existing_cols].apply(pd.to_numeric, errors='coerce')
                return cached_df

        since_ms = int(start_time.timestamp() * 1000)
        end_ms = int(end_time.timestamp() * 1000)
        
        clean_symbol = symbol.replace('USD', 'USDT')
        if '/' not in clean_symbol:
            clean_symbol = clean_symbol.replace('USDT', '/USDT')
            
        exchanges_to_try = GLOBAL_EXCHANGES
        
        all_ohlcv = []
        
        # Hacemos iteraciones seguras (máximo 30 para evitar timeouts si el rango es bestial pero permitir 300 días en 15m)
        for _ in range(30):
            ohlcv = None
            for ex in exchanges_to_try:
                try:
                    ohlcv = ex.fetch_ohlcv(clean_symbol, timeframe, since=since_ms, limit=1000)
                    if ohlcv and len(ohlcv) > 0:
                        break
                except Exception:
                    continue
                    
            if not ohlcv or len(ohlcv) == 0:
                for ex in exchanges_to_try:
                    try:
                        ohlcv = ex.fetch_ohlcv('BTC/USDT', timeframe, since=since_ms, limit=1000)
                        if ohlcv and len(ohlcv) > 0:
                            break
                    except Exception:
                        continue
                    
            if not ohlcv or len(ohlcv) == 0:
                break
                
            all_ohlcv.extend(ohlcv)
            
            # El último timestamp devuelto
            last_ts = ohlcv[-1][0]
            if last_ts >= end_ms:
                break
                
            # Avanzamos el puntero (sumamos 1 milisegundo para no repetir vela)
            since_ms = last_ts + 1
            
        if not all_ohlcv:
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
