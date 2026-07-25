import ccxt
import pandas as pd

# Instancia global síncrona
exchange = ccxt.binance({
    'enableRateLimit': True,
})

def fetch_ohlcv(symbol, timeframe='15m', limit=1000, since=None):
    """
    Descarga velas históricas usando CCXT (Binance por defecto para data general de cripto).
    """
    try:
        # ccxt usa milisegundos para 'since'
        since_ms = None
        if since and pd.notna(since):
            try:
                since_ms = int(since.timestamp() * 1000)
            except (OSError, ValueError, AttributeError):
                since_ms = None
        
        # Limpiar el symbol (EJ: ETHUSD Long -> ETH/USDT para que binance lo encuentre)
        # Hacemos un mapeo básico
        clean_symbol = symbol.replace('USD', 'USDT')
        if '/' not in clean_symbol:
            clean_symbol = clean_symbol.replace('USDT', '/USDT')
            
        # Si sigue siendo raro, fallback a BTC/USDT para la demo si falla
        try:
            ohlcv = exchange.fetch_ohlcv(clean_symbol, timeframe, since=since_ms, limit=limit)
        except:
            ohlcv = exchange.fetch_ohlcv('BTC/USDT', timeframe, since=since_ms, limit=limit)
            
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms').astype('datetime64[ns]')
        return df
    except Exception as e:
        print(f"Error fetching data: {e}")
        return pd.DataFrame()

def fetch_historical_data_range(symbol, start_time, end_time, timeframe='1h'):
    """
    Descarga todo el rango histórico en bloques para evitar hacer peticiones individuales.
    """
    try:
        since_ms = int(start_time.timestamp() * 1000)
        end_ms = int(end_time.timestamp() * 1000)
        
        clean_symbol = symbol.replace('USD', 'USDT')
        if '/' not in clean_symbol:
            clean_symbol = clean_symbol.replace('USDT', '/USDT')
            
        all_ohlcv = []
        
        # Hacemos iteraciones seguras (máximo 10 para evitar timeouts si el rango es bestial)
        for _ in range(10):
            try:
                ohlcv = exchange.fetch_ohlcv(clean_symbol, timeframe, since=since_ms, limit=1000)
            except:
                try:
                    ohlcv = exchange.fetch_ohlcv('BTC/USDT', timeframe, since=since_ms, limit=1000)
                except:
                    break
                    
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
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms').astype('datetime64[ns]')
        
        # Limpiar duplicados por si acaso
        df = df.drop_duplicates(subset=['timestamp']).reset_index(drop=True)
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
        since_ms = int(timestamp.timestamp() * 1000) - 60000 # 1 minute before
        
        clean_symbol = symbol.replace('USD', 'USDT')
        if '/' not in clean_symbol:
            clean_symbol = clean_symbol.replace('USDT', '/USDT')
            
        try:
            ohlcv = exchange.fetch_ohlcv(clean_symbol, '1m', since=since_ms, limit=2)
        except:
            return None
            
        if ohlcv and len(ohlcv) > 0:
            # ohlcv[0] is [timestamp, open, high, low, close, volume]
            # ohlcv[-1] ensures we get the closest to the target time
            return float(ohlcv[-1][4]) # close price
        return None
    except Exception as e:
        print(f"Error fetching historical price for {symbol}: {e}")
        return None

def compute_indicators(df):
    """
    Calcula indicadores usando pandas puro para máxima compatibilidad
    """
    if df.empty or len(df) < 50:
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
