import pandas as pd
import numpy as np
from datetime import datetime
from market_data import fetch_ohlcv, compute_indicators, get_historical_price, fetch_historical_data_range
from fastapi.concurrency import run_in_threadpool

def get_dynamic_timeframe(median_duration_secs, start_time, end_time):
    """
    Decide la temporalidad óptima basada en el estilo de trading y previene timeouts 
    limitando la precisión si el rango de fechas es muy extenso.
    """
    if pd.isna(start_time) or pd.isna(end_time):
        return '1h'
        
    total_days = (end_time - start_time).total_seconds() / 86400.0
    
    ideal_tf = '1h'
    if median_duration_secs > 0:
        if median_duration_secs <= 7200: # <= 2 horas (Scalper)
            ideal_tf = '5m'
        elif median_duration_secs <= 259200: # <= 3 días (Day Trader)
            ideal_tf = '15m'
            
    # Protección anti-timeout (Limitar según días totales)
    if ideal_tf == '5m' and total_days > 40:
        ideal_tf = '15m'
    if ideal_tf == '15m' and total_days > 120:
        ideal_tf = '1h'
    if total_days > 500:
        ideal_tf = '4h'
        
    return ideal_tf

async def analyze_trades(df, target_symbol=None, selected_timeframe=None):
    """
    Extraces behavioral metrics from a standardized trades DataFrame.
    """
    if df.empty:
        return {}
        
    available_symbols = df['symbol'].unique().tolist()
    
    if target_symbol and target_symbol in available_symbols:
        df = df[df['symbol'] == target_symbol].copy()
        
    # Agresivo cast a numérico para evitar errores str - str
    for col in ['entry_price', 'exit_price', 'size', 'reported_pnl', 'fee']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
            
    # Convert dates early
    if 'entry_time' in df.columns:
        df['entry_time'] = pd.to_datetime(df['entry_time'], errors='coerce', utc=True).dt.tz_localize(None)
    if 'exit_time' in df.columns:
        df['exit_time'] = pd.to_datetime(df['exit_time'], errors='coerce', utc=True).dt.tz_localize(None)
        
    # Calculate median duration early to dictate timeframe
    median_duration_secs = 0
    median_duration = pd.Timedelta(seconds=0)
    avg_duration_str = "N/A"
    
    if df['entry_time'].notna().any() and df['exit_time'].notna().any():
        df['duration'] = df['exit_time'] - df['entry_time']
        median_duration = df['duration'].median()
        if pd.notna(median_duration):
            median_duration_secs = median_duration.total_seconds()
            
        avg_duration = df['duration'].mean()
        avg_duration_str = str(avg_duration).split('.')[0] if pd.notna(avg_duration) else "N/A"
        
    # Reconstrucción de Precios Faltantes (Interpolación Histórica)
    missing_prices_mask = ((df['entry_price'] == 0) | (df['exit_price'] == 0)) & df['entry_time'].notna() & df['exit_time'].notna()
    
    if missing_prices_mask.any():
        symbols_missing = df.loc[missing_prices_mask, 'symbol'].unique()
        for sym in symbols_missing:
            sym_missing_trades = df[missing_prices_mask & (df['symbol'] == sym)]
            if sym_missing_trades.empty: continue
            
            start_t = sym_missing_trades['entry_time'].min() - pd.Timedelta(hours=1)
            end_t = sym_missing_trades['exit_time'].max() + pd.Timedelta(hours=1)
            
            if pd.notna(start_t) and pd.notna(end_t):
                # Usamos 15m para tener un buen balance entre precisión de precio y velocidad de descarga
                market_df = await run_in_threadpool(fetch_historical_data_range, sym, start_t, end_t, timeframe='15m')
                
                if not market_df.empty:
                    market_df = market_df.sort_values('timestamp')
                    market_df['timestamp'] = pd.to_datetime(market_df['timestamp'], utc=True).dt.tz_localize(None).astype('datetime64[ns]')
                    
                    # Interpolar entry_price
                    entry_df = pd.DataFrame({
                        'time': pd.to_datetime(sym_missing_trades['entry_time'], utc=True).dt.tz_localize(None).astype('datetime64[ns]'), 
                        'idx': sym_missing_trades.index
                    }).sort_values('time')
                    entry_matches = pd.merge_asof(entry_df, market_df[['timestamp', 'close']], left_on='time', right_on='timestamp', direction='nearest').set_index('idx')
                    
                    # Interpolar exit_price
                    exit_df = pd.DataFrame({
                        'time': pd.to_datetime(sym_missing_trades['exit_time'], utc=True).dt.tz_localize(None).astype('datetime64[ns]'), 
                        'idx': sym_missing_trades.index
                    }).sort_values('time')
                    exit_matches = pd.merge_asof(exit_df, market_df[['timestamp', 'close']], left_on='time', right_on='timestamp', direction='nearest').set_index('idx')
                    
                    df.loc[entry_matches.index, 'entry_price'] = np.where(df.loc[entry_matches.index, 'entry_price'] == 0, entry_matches['close'], df.loc[entry_matches.index, 'entry_price'])
                    df.loc[exit_matches.index, 'exit_price'] = np.where(df.loc[exit_matches.index, 'exit_price'] == 0, exit_matches['close'], df.loc[exit_matches.index, 'exit_price'])

    # Recalculate true PNL % (Vectorized)
    entry = df['entry_price']
    exit = df['exit_price']
    is_long = df['side'] == 'Long'
    is_usdt = df['contract_type'] == 'USDT-M'
    
    safe_entry = np.where(entry == 0, np.nan, entry)
    safe_exit = np.where(exit == 0, np.nan, exit)
    
    # Calculate percentage move (USDT-M)
    long_diff_pct = (exit - safe_entry) / safe_entry
    short_diff_pct = (safe_entry - exit) / safe_entry
    price_diff_pct = np.where(is_long, long_diff_pct, short_diff_pct)
    
    # Calculate percentage move (COIN-M)
    coin_long_diff_pct = (exit - safe_entry) / safe_exit
    coin_short_diff_pct = (safe_entry - exit) / safe_exit
    coin_diff_pct = np.where(is_long, coin_long_diff_pct, coin_short_diff_pct)
    
    # Combine
    df['true_pnl_pct'] = np.where(is_usdt, price_diff_pct * 100.0, coin_diff_pct * 100.0)
    df['true_pnl_pct'] = df['true_pnl_pct'].fillna(0.0)
    
    # Recalcular el PNL absoluto matemáticamente (independiente del exchange)
    calc_long_pnl = (exit - safe_entry) * df['size']
    calc_short_pnl = (safe_entry - exit) * df['size']
    calculated_pnl = np.where(is_long, calc_long_pnl, calc_short_pnl).astype(float)
    
    # Reemplazar PNL reportado si el exchange falló y reportó 0, siempre que tengamos un tamaño válido
    df['reported_pnl'] = np.where((df['reported_pnl'] == 0) & (df['size'] > 0), calculated_pnl, df['reported_pnl'])
    
    df['reported_pnl'] = df['reported_pnl'].fillna(0.0)
    
    # Fetch historical prices for COIN-M USD conversion (Bulk Vectorized)
    df['pnl_usd'] = df['reported_pnl'] # Predeterminado para USDT-M
    
    coin_m_df = df[df['contract_type'] == 'COIN-M'].copy()
    if not coin_m_df.empty and coin_m_df['exit_time'].notna().any():
        symbols = coin_m_df['symbol'].unique()
        
        for sym in symbols:
            sym_trades = coin_m_df[(coin_m_df['symbol'] == sym) & coin_m_df['exit_time'].notna()].copy()
            if sym_trades.empty: continue
                
            start_t = sym_trades['exit_time'].min() - pd.Timedelta(hours=1)
            end_t = sym_trades['exit_time'].max() + pd.Timedelta(hours=1)
            
            # Use dynamic timeframe (though for USD conversion 1h is usually fine, we respect the limits)
            tf = get_dynamic_timeframe(median_duration_secs, start_t, end_t)
            # Para conversiones de dinero no necesitamos 5m si es muy largo, usamos el tf seguro
            
            market_df = await run_in_threadpool(fetch_historical_data_range, sym, start_t, end_t, timeframe=tf)
            
            if not market_df.empty:
                sym_trades = sym_trades.sort_values('exit_time')
                market_df = market_df.sort_values('timestamp')
                
                sym_trades['exit_time'] = pd.to_datetime(sym_trades['exit_time'], utc=True).dt.tz_localize(None).astype('datetime64[ns]')
                market_df['timestamp'] = pd.to_datetime(market_df['timestamp'], utc=True).dt.tz_localize(None).astype('datetime64[ns]')
                
                merged = pd.merge_asof(
                    sym_trades,
                    market_df[['timestamp', 'close']],
                    left_on='exit_time',
                    right_on='timestamp',
                    direction='nearest'
                )
                
                merged['calc_pnl_usd'] = merged['reported_pnl'] * merged['close']
                merged.index = sym_trades.index
                df.loc[merged.index, 'pnl_usd'] = merged['calc_pnl_usd'].fillna(merged['reported_pnl'])
    
    # Sort chronologically for cumulative calculations
    if df['exit_time'].notna().any():
        df = df.sort_values(by='exit_time').reset_index(drop=True)
    else:
        df = df.reset_index(drop=True)
    
    # Cumulative PNL % (Equity Curve)
    df['cumulative_pnl'] = df['true_pnl_pct'].cumsum()
    df['cumulative_pnl_amt'] = df['pnl_usd'].cumsum()
    equity_curve = df[['exit_time', 'cumulative_pnl', 'cumulative_pnl_amt']].copy()
    
    # Format exit_time for equity curve
    if equity_curve['exit_time'].notna().any():
        equity_curve['exit_time'] = equity_curve['exit_time'].apply(
            lambda x: f"{x.year:04d}-{x.month:02d}-{x.day:02d} {x.hour:02d}:{x.minute:02d}" if pd.notna(x) else 'Unknown'
        )
    else:
        equity_curve['exit_time'] = [f"Trade {i+1}" for i in range(len(equity_curve))]
    
    equity_curve['exit_time'] = equity_curve['exit_time'].fillna('Unknown')
    equity_data = equity_curve.to_dict('records')
    
    # Win / Loss
    wins = df[df['reported_pnl'] > 0]
    losses = df[df['reported_pnl'] < 0]
    win_rate = len(wins) / len(df) if len(df) > 0 else 0
    
    valid_pct_wins = wins[wins['true_pnl_pct'] > 0]
    avg_win_pct = valid_pct_wins['true_pnl_pct'].mean() if not valid_pct_wins.empty else 0
    
    valid_pct_losses = losses[losses['true_pnl_pct'] < 0]
    avg_loss_pct = valid_pct_losses['true_pnl_pct'].mean() if not valid_pct_losses.empty else 0
    
    risk_reward = abs(avg_win_pct / avg_loss_pct) if avg_loss_pct != 0 else float('inf')
    
    # Absolute amounts
    total_pnl = df['reported_pnl'].sum()
    total_pnl_usd = df['pnl_usd'].sum()
    avg_win_amt = wins['pnl_usd'].mean() if not wins.empty else 0
    avg_loss_amt = losses['pnl_usd'].mean() if not losses.empty else 0
    
    # Trade duration
    # (Calculated at the top now)
        
    # Trading Style Profiler and Advice
    trading_style = "Desconocido"
    advice = []
    
    if avg_duration_str != "N/A" and pd.notna(median_duration):
        duration_secs = median_duration.total_seconds()
        
        if duration_secs <= 1800: # <= 30 minutes
            trading_style = "Scalper Agresivo"
            advice.append(f"Tus datos indican que eres un Scalper Agresivo, con operaciones muy veloces (mediana de {duration_secs/60:.0f} minutos). Operar en esta intensidad exige nervios de acero y comisiones (fees) muy bajas para ser rentable.")
        elif duration_secs <= 7200: # <= 2 hours
            trading_style = "Scalper"
            advice.append(f"Tu perfil es de Scalper. Tus operaciones duran habitualmente (mediana de {duration_secs/60:.0f} minutos). Manejas bien las temporalidades bajas, pero cuida la sobre-operatividad (overtrading).")
        elif duration_secs < 57600: # < 16 hours
            trading_style = "Scalp Prolongado"
            advice.append(f"Practicas un Scalp Prolongado (mediana de {duration_secs/3600:.1f} horas). Tratas de capturar movimientos intradiarios extendidos sin dejar posiciones abiertas al dormir.")
        elif duration_secs < 259200: # < 72 hours
            trading_style = "Day Trader"
            advice.append(f"Eres un Day Trader o trader de corto plazo. Operas en un rango de hasta 3 días (mediana de {duration_secs/3600:.1f} horas), asumiendo un ligero riesgo overnight pero sin buscar tendencias largas.")
        elif duration_secs < 604800: # < 7 days
            trading_style = "Swing Trader"
            advice.append(f"Tu estilo es de Swing Trader. Tus operaciones duran varios días (mediana de {duration_secs/86400:.1f} días). Buscas macrotendencias, pero asegúrate de ajustar tu riesgo para soportar gaps de mercado.")
        else:
            trading_style = "Position Trader"
            advice.append(f"Eres un Position Trader. Mantienes tus operaciones por semanas ({duration_secs/86400:.1f} días). Tu paciencia exige una gestión de capital robusta para soportar amplios drawdowns.")

    if win_rate > 0.6 and risk_reward < 0.8:
        advice.append("Técnicamente tienes buen % de aciertos, pero tus pérdidas son más grandes que tus ganancias. Estás cortando ganancias y dejando correr pérdidas.")
    if win_rate < 0.4 and risk_reward < 1.5:
        advice.append("Tu ratio de aciertos es bajo y el riesgo-beneficio no lo compensa. Probablemente estás forzando entradas sin una ventaja matemática clara.")
    if "Scalp" in trading_style and avg_loss_pct < -2.0:
        advice.append(f"Como {trading_style}, tus pérdidas porcentuales promedio (> {abs(avg_loss_pct):.2f}%) son demasiado altas. Ajusta tus Stop Loss para que sean más quirúrgicos.")
    if not advice:
        advice.append("Tus métricas de comportamiento reflejan consistencia. Sigue tu plan de trading.")
        
    # Long vs Short
    longs = df[df['side'] == 'Long']
    shorts = df[df['side'] == 'Short']
    long_rate = len(longs) / len(df) if len(df) > 0 else 0
    
    # Top Trades
    top_winners = df.nlargest(10, 'reported_pnl')[['symbol', 'side', 'true_pnl_pct', 'reported_pnl', 'exit_time']].copy()
    if top_winners['exit_time'].notna().any():
        top_winners['exit_time'] = top_winners['exit_time'].apply(
            lambda x: pd.to_datetime(x).strftime('%Y-%m-%d %H:%M') if pd.notna(x) and str(x).strip() != '' else 'N/A'
        )
    top_winners['exit_time'] = top_winners['exit_time'].fillna('N/A')

    top_losers = df.nsmallest(10, 'reported_pnl')[['symbol', 'side', 'true_pnl_pct', 'reported_pnl', 'exit_time']].copy()
    if top_losers['exit_time'].notna().any():
        top_losers['exit_time'] = top_losers['exit_time'].apply(
            lambda x: pd.to_datetime(x).strftime('%Y-%m-%d %H:%M') if pd.notna(x) and str(x).strip() != '' else 'N/A'
        )
    top_losers['exit_time'] = top_losers['exit_time'].fillna('N/A')
    
    # -- MARKET DATA AND STRATEGY DETECTION --
    ohlcv_data = []
    markers = []
    strategy_scores = {
        "Reversión a la media (RSI)": 0,
        "Trend Following (Mejor EMA)": 0,
        "Ruptura de Bollinger": 0,
        "MACD Momentum": 0,
        "Rebote VWAP": 0,
        "SMC / Liquidación (Rechazo)": 0,
        "Breakout de Rango (Ruptura)": 0,
        "Pullback Dinámico a EMAs": 0,
        "Momentum / Volume Spikes": 0,
        "Fading (Caza-Reversiones)": 0
    }
    
    if df['entry_time'].notna().any():
        try:
            symbol_to_fetch = df['symbol'].value_counts().idxmax()
            start_time = df['entry_time'].min() - pd.Timedelta(days=2) # Dar un poco de margen para EMAs
            end_time = df['exit_time'].max() if df['exit_time'].notna().any() else datetime.now()
            
            # --- PROTECCIÓN DE RENDIMIENTO ---
            # Si el CSV tiene trades muy antiguos (ej. varios años), la descarga de velas de 5m tardaría horas y sobrecargaría CCXT.
            # Limitamos la reconstrucción gráfica a los últimos 90 días de la operativa subida.
            if (end_time - start_time).days > 90:
                start_time = end_time - pd.Timedelta(days=90)
                advice.append("⚠️ Aviso de Rendimiento: Tu historial abarca un rango extenso. Para garantizar un buen tiempo de carga, la reconstrucción gráfica y el análisis Quant se limitaron a los últimos 90 días de tus operaciones. (Tus métricas globales y de PnL sí incluyen toda tu historia).")
            
            dynamic_tf = get_dynamic_timeframe(median_duration_secs, start_time, end_time)
            quant_tf = selected_timeframe if selected_timeframe else dynamic_tf
            
            if selected_timeframe and selected_timeframe != dynamic_tf:
                advice.append(f"Diagnóstico de Temporalidad: Estás analizando tu estrategia en {selected_timeframe}, pero basándonos en la duración promedio de tus operaciones, tu marco temporal óptimo sugerido es {dynamic_tf}. Analizar en el marco incorrecto puede hacer que tus entradas parezcan desfasadas.")
            
            # Uso de la función masiva con timeframe dinámico (5m, 15m, 1h)
            market_df = await run_in_threadpool(fetch_historical_data_range, symbol_to_fetch, start_time, end_time, timeframe=quant_tf)
            
            if not market_df.empty:
                market_df = compute_indicators(market_df)
                market_df.dropna(subset=['open', 'high', 'low', 'close'], inplace=True)
                
                def safe_val(val):
                    return None if pd.isna(val) else float(val)

                # Vectorized OHLCV formatting ha sido movido al endpoint específico de /api/trade-chart para no sobrecargar.
                ohlcv_data = []
                
                symbol_trades = df[(df['symbol'] == symbol_to_fetch) & df['entry_time'].notna()].copy()
                
                # Markers generation (movido a /api/trade-chart)
                markers = []

                
                total_symbol_trades = len(symbol_trades)
                
                if total_symbol_trades > 0:
                    # Vectorized merge_asof for matching trades to nearest preceding candle
                    symbol_trades['merge_time'] = pd.to_datetime(symbol_trades['entry_time'], utc=True).dt.tz_localize(None).astype('datetime64[ns]')
                    market_df['merge_time'] = pd.to_datetime(market_df['timestamp'], utc=True).dt.tz_localize(None).astype('datetime64[ns]')
                    
                    symbol_trades = symbol_trades.sort_values('merge_time')
                    market_df = market_df.sort_values('merge_time')
                    
                    merged = pd.merge_asof(
                        symbol_trades, 
                        market_df, 
                        on='merge_time', 
                        direction='backward'
                    )
                    
                    # Ensure we only calculate where we actually matched a candle
                    valid_matches = merged['timestamp'].notna()
                    merged = merged[valid_matches]
                    
                    if not merged.empty:
                        # Vectorized strategy logic
                        is_long = merged['side'] == 'Long'
                        is_short = merged['side'] == 'Short'
                        
                        range_len = merged['high'] - merged['low']
                        open_close_min = np.minimum(merged['open'], merged['close'])
                        open_close_max = np.maximum(merged['open'], merged['close'])
                        
                        is_long_rejection = (range_len > 0) & (open_close_min > merged['low'] + (range_len * 0.7))
                        is_short_rejection = (range_len > 0) & (open_close_max < merged['high'] - (range_len * 0.7))
                        
                        # Hit counters
                        rsi_hits = ((is_long & (merged['RSI_14'] < 40)) | (is_short & (merged['RSI_14'] > 60))).sum()
                        bb_hits = ((is_long & (merged['close'] <= merged['BBL_20'] * 1.01)) | (is_short & (merged['close'] >= merged['BBU_20'] * 0.99))).sum()
                        macd_hits = ((is_long & (merged['MACD_Hist'] > 0)) | (is_short & (merged['MACD_Hist'] < 0))).sum()
                        vwap_hits = (
                            (is_long & (merged['low'] <= merged['VWAP'] * 1.005) & (merged['close'] >= merged['VWAP'] * 0.995)) |
                            (is_short & (merged['high'] >= merged['VWAP'] * 0.995) & (merged['close'] <= merged['VWAP'] * 1.005))
                        ).sum()
                        smc_hits = ((is_long & is_long_rejection) | (is_short & is_short_rejection)).sum()
                        
                        # --- New Strategy Hits (NaN-safe, pandas modern syntax) ---
                        high20 = merged['High_20'].bfill().fillna(merged['high'])
                        low20  = merged['Low_20'].bfill().fillna(merged['low'])
                        breakout_hits = int((
                            (is_long & (merged['close'] >= high20 * 0.995)) |
                            (is_short & (merged['close'] <= low20 * 1.005))
                        ).sum())

                        uptrend   = merged['EMA_50'] > merged['EMA_200']
                        downtrend = merged['EMA_50'] < merged['EMA_200']
                        pullback_hits = int((
                            (is_long  & uptrend   & (merged['low']  <= merged['EMA_21'] * 1.008) & (merged['close'] > merged['EMA_21'])) |
                            (is_long  & uptrend   & (merged['low']  <= merged['EMA_50'] * 1.008) & (merged['close'] > merged['EMA_50'])) |
                            (is_short & downtrend & (merged['high'] >= merged['EMA_21'] * 0.992) & (merged['close'] < merged['EMA_21'])) |
                            (is_short & downtrend & (merged['high'] >= merged['EMA_50'] * 0.992) & (merged['close'] < merged['EMA_50']))
                        ).sum())

                        vol_sma = merged['Vol_SMA_20'].bfill().fillna(merged['volume'].mean())
                        vol_spike_hits = int((merged['volume'] > (vol_sma * 1.5)).sum())

                        heavy_red   = (merged['close'] < merged['open']) & ((merged['open'] - merged['close']) > (range_len * 0.55))
                        heavy_green = (merged['close'] > merged['open']) & ((merged['close'] - merged['open']) > (range_len * 0.55))
                        fading_hits = int(((is_long & heavy_red) | (is_short & heavy_green)).sum())

                        print(f"[DEBUG] Strategy hits — breakout:{breakout_hits} pullback:{pullback_hits} vol_spike:{vol_spike_hits} fading:{fading_hits} | total_trades:{total_symbol_trades}")
                        
                        ema_9_21 = ((is_long & (merged['EMA_9'] > merged['EMA_21'])) | (is_short & (merged['EMA_9'] < merged['EMA_21']))).sum()
                        ema_21_50 = ((is_long & (merged['EMA_21'] > merged['EMA_50'])) | (is_short & (merged['EMA_21'] < merged['EMA_50']))).sum()
                        ema_50_200 = ((is_long & (merged['EMA_50'] > merged['EMA_200'])) | (is_short & (merged['EMA_50'] < merged['EMA_200']))).sum()
                        
                        # Assign scores
                        strategy_scores["Reversión a la media (RSI)"] = int((rsi_hits / total_symbol_trades) * 100)
                        strategy_scores["Ruptura de Bollinger"] = int((bb_hits / total_symbol_trades) * 100)
                        strategy_scores["MACD Momentum"] = int((macd_hits / total_symbol_trades) * 100)
                        strategy_scores["Rebote VWAP"] = int((vwap_hits / total_symbol_trades) * 100)
                        strategy_scores["SMC / Liquidación (Rechazo)"] = int((smc_hits / total_symbol_trades) * 100)
                        strategy_scores["Breakout de Rango (Ruptura)"] = int((breakout_hits / total_symbol_trades) * 100)
                        strategy_scores["Pullback Dinámico a EMAs"] = int((pullback_hits / total_symbol_trades) * 100)
                        strategy_scores["Momentum / Volume Spikes"] = int((vol_spike_hits / total_symbol_trades) * 100)
                        strategy_scores["Fading (Caza-Reversiones)"] = int((fading_hits / total_symbol_trades) * 100)
                        
                        emas = {
                            "EMA Crossover (9/21) Corto Plazo": ema_9_21,
                            "EMA Crossover (21/50) Medio Plazo": ema_21_50,
                            "EMA Crossover (50/200) Largo Plazo": ema_50_200
                        }
                        best_ema_name = max(emas, key=emas.get)
                        best_ema_score = emas[best_ema_name]
                        
                        del strategy_scores["Trend Following (Mejor EMA)"]
                        strategy_scores[best_ema_name] = int((best_ema_score / total_symbol_trades) * 100)
                        
        except Exception as e:
            print(f"[ERROR] Strategy detection failed: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()

    # Expose raw hit counts as top-level fields for the frontend
    _n = len(df) if len(df) > 0 else 1
    raw_hits = {
        'breakout_hits':    strategy_scores.get('Breakout de Rango (Ruptura)', 0),
        'pullback_hits':    strategy_scores.get('Pullback Din\u00e1mico a EMAs', 0),
        'vol_spike_hits':   strategy_scores.get('Momentum / Volume Spikes', 0),
        'fading_hits':      strategy_scores.get('Fading (Caza-Reversiones)', 0),
        'rsi_hits':         strategy_scores.get('Reversi\u00f3n a la media (RSI)', 0),
        'smc_hits':         strategy_scores.get('SMC / Liquidaci\u00f3n (Rechazo)', 0),
    }

    # Calculate fees
    total_fees = df['fee'].sum() if 'fee' in df.columns else 0.0
    fees_included = 'fee' in df.columns and (df['fee'] != 0).any()

    # Prepare list of all trades to send to frontend
    all_trades = df[['symbol', 'side', 'entry_time', 'exit_time', 'true_pnl_pct', 'reported_pnl']].copy()
    if 'duration' in df.columns:
        all_trades['duration'] = df['duration']
    else:
        all_trades['duration'] = pd.Series([None]*len(all_trades))

    if all_trades['entry_time'].notna().any():
        all_trades['entry_time'] = all_trades['entry_time'].dt.strftime('%Y-%m-%d %H:%M:%S')
    if all_trades['exit_time'].notna().any():
        all_trades['exit_time'] = all_trades['exit_time'].dt.strftime('%Y-%m-%d %H:%M:%S')
        
    if 'duration' in all_trades.columns:
        all_trades['duration'] = all_trades['duration'].apply(lambda x: str(x).split('.')[0] if pd.notna(x) else "N/A")
        
    all_trades = all_trades.fillna('N/A').to_dict('records')

    return {
        'available_symbols': available_symbols,
        'total_trades': len(df),
        'trading_style': trading_style,
        'advice': advice,
        'win_rate': f"{win_rate * 100:.2f}%",
        'avg_win_pct': f"{avg_win_pct:.2f}%",
        'avg_loss_pct': f"{avg_loss_pct:.2f}%",
        'avg_win_amt_usd': f"{avg_win_amt:.2f}",
        'avg_loss_amt_usd': f"{avg_loss_amt:.2f}",
        'total_pnl_base': f"{total_pnl:.6f}",
        'total_pnl_usd': f"{total_pnl_usd:.2f}",
        'total_fees_usd': f"{total_fees:.2f}",
        'fees_included': bool(fees_included),
        'risk_reward_ratio': f"{risk_reward:.2f}",
        'avg_duration': avg_duration_str,
        'long_preference': f"{long_rate * 100:.0f}% Longs / {(1-long_rate) * 100:.0f}% Shorts",
        'equity_curve': equity_data,
        'top_winners': top_winners.to_dict('records'),
        'top_losers': top_losers.to_dict('records'),
        'all_trades': all_trades,
        'tv_data': {
            'ohlcv': ohlcv_data,
            'markers': markers
        },
        'strategies': strategy_scores,
        'analyzed_timeframe': quant_tf if 'quant_tf' in locals() else selected_timeframe or "1h",
        **raw_hits
    }
