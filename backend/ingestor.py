import pandas as pd
import numpy as np
import re
import csv

def safe_read_csv(file_path):
    try:
        return pd.read_csv(file_path, encoding='utf-8', sep=None, engine='python')
    except Exception:
        try:
            return pd.read_csv(file_path, encoding='latin1', sep=None, engine='python')
        except Exception:
            try:
                return pd.read_csv(file_path, encoding='utf-8', quoting=csv.QUOTE_NONE, on_bad_lines='skip')
            except Exception:
                return pd.read_csv(file_path, encoding='latin1', quoting=csv.QUOTE_NONE, on_bad_lines='skip')

def clean_numeric(val):
    if pd.isna(val): return 0.0
    if isinstance(val, (int, float)): return float(val)
    # Remove any letters (like ETH, BTC), commas, spaces
    val_str = str(val).replace(',', '').strip()
    match = re.search(r'-?[\d\.]+', val_str)
    if match:
        return float(match.group(0))
    return 0.0

def find_column(columns, candidates):
    # First pass: Exact match
    for cand in candidates:
        for col in columns:
            if cand == col:
                return col
    # Second pass: Regex word boundary match
    for cand in candidates:
        for col in columns:
            if re.search(r'\b' + re.escape(cand) + r'\b', col):
                return col
    return None

def is_trade_level_csv(df):
    clean_cols = [str(c).lower().strip() for c in df.columns]
    # Si tiene type, token, px y amount, probablemente es Hyperliquid
    if 'type' in clean_cols and 'token' in clean_cols and 'px' in clean_cols and 'amount' in clean_cols:
        return True
    return False

def reconstruct_positions_from_trades(df):
    """
    Convierte un historial de trades individuales (como Hyperliquid)
    en un historial de posiciones agrupadas.
    """
    # Usar time_iso para ordenar cronológicamente (de más antiguo a más nuevo)
    if 'time_iso' in df.columns:
        df['parsed_time'] = pd.to_datetime(df['time_iso'], errors='coerce')
    elif 'time' in df.columns:
        df['parsed_time'] = pd.to_datetime(df['time'], unit='ms', errors='coerce')
    else:
        raise ValueError("No se encontró columna de tiempo para ordenar los trades.")
        
    df = df.dropna(subset=['parsed_time'])
    df = df.sort_values(by='parsed_time', ascending=True)
    
    positions = []
    ledger = {}
    
    for _, row in df.iterrows():
        token = row.get('token', 'UNKNOWN')
        trade_type = str(row.get('type', '')).strip()
        amount = clean_numeric(row.get('amount', 0))
        price = clean_numeric(row.get('px', 0))
        fee = clean_numeric(row.get('fee', 0))
        time_val = row['parsed_time']
        
        abs_amount = abs(amount)
        if abs_amount == 0 or pd.isna(price): continue
            
        if 'Open' in trade_type:
            side = 'Long' if amount > 0 else 'Short'
            
            if token not in ledger:
                ledger[token] = {
                    'side': side,
                    'amount': abs_amount,
                    'cost_basis': abs_amount * price,
                    'entry_time': time_val,
                    'accumulated_fee': fee
                }
            else:
                # Agregar a posición existente (Averaging in)
                ledger[token]['amount'] += abs_amount
                ledger[token]['cost_basis'] += (abs_amount * price)
                ledger[token]['accumulated_fee'] += fee
                
        elif 'Close' in trade_type:
            if token in ledger:
                pos = ledger[token]
                avg_entry = pos['cost_basis'] / pos['amount'] if pos['amount'] > 0 else 0
                close_qty = min(abs_amount, pos['amount'])
                
                if pos['side'] == 'Long':
                    gross_pnl = (price - avg_entry) * close_qty
                else:
                    gross_pnl = (avg_entry - price) * close_qty
                    
                net_pnl = gross_pnl - fee - pos['accumulated_fee']
                
                symbol = str(token).replace('-', '')
                
                positions.append({
                    'exchange': 'Hyperliquid',
                    'symbol': symbol,
                    'contract_type': 'USDT-M',
                    'side': pos['side'],
                    'entry_time': pos['entry_time'],
                    'exit_time': time_val,
                    'entry_price': avg_entry,
                    'exit_price': price,
                    'size': close_qty,
                    'reported_pnl': net_pnl
                })
                
                pos['amount'] -= close_qty
                pos['cost_basis'] -= (close_qty * avg_entry)
                pos['accumulated_fee'] = 0 # Fee ya se descontó
                
                if pos['amount'] <= 1e-6:
                    del ledger[token]
                    
    return pd.DataFrame(positions)

def smart_parse(df):
    """
    Motor heurístico que identifica automáticamente las columnas usando palabras clave.
    """
    # Lowercase and clean column names for matching
    original_cols = list(df.columns)
    clean_cols = [str(c).lower().strip() for c in original_cols]
    col_map = dict(zip(clean_cols, original_cols))
    
    # Heuristics
    sym_col = find_column(clean_cols, ['symbol', 'futures', 'símbolo', 'pair', 'par', 'price unit'])
    side_col = find_column(clean_cols, ['side', 'direction', 'dirección', 'long/short'])
    entry_p_col = find_column(clean_cols, ['entry price', 'precio entrada', 'avg entry', 'entry', 'average entry price', 'avg. entry price'])
    exit_p_col = find_column(clean_cols, ['exit price', 'precio salida', 'avg close', 'exit', 'average closing price', 'avg. exit price'])
    entry_t_col = find_column(clean_cols, ['open time', 'entry time', 'opening time', 'fecha entrada', 'time'])
    exit_t_col = find_column(clean_cols, ['close time', 'exit time', 'fecha salida', 'cerrado', 'closed time'])
    size_col = find_column(clean_cols, ['closed amount', 'size', 'closing qty', 'closed position', 'cantidad'])
    pnl_col = find_column(clean_cols, ['realized pnl', 'pnl', 'pnl usd', 'pnl %', 'beneficio', 'ganancia', 'profit'])
    
    # Required columns logic
    if not pnl_col and not exit_p_col:
        raise ValueError("No se pudo identificar una columna de ganancias (PnL) o de precio de salida en el archivo.")
        
    standard_data = []
    
    for _, row in df.iterrows():
        # Get raw values
        raw_sym = str(row[col_map[sym_col]]) if sym_col else "UNKNOWN"
        
        # Parse symbol and contract type
        parts = raw_sym.split(' ')
        symbol = parts[0]
        contract_type = 'USDT-M' if 'USDT' in symbol.upper() else 'COIN-M'
        
        # Parse side
        raw_side = str(row[col_map[side_col]]).upper() if side_col else ""
        if 'LONG' in raw_side or 'LONG' in raw_sym.upper():
            side = 'Long'
        elif 'SHORT' in raw_side or 'SHORT' in raw_sym.upper():
            side = 'Short'
        else:
            # Infer from entry vs exit if possible
            entry_p = clean_numeric(row[col_map[entry_p_col]]) if entry_p_col else 0.0
            exit_p = clean_numeric(row[col_map[exit_p_col]]) if exit_p_col else 0.0
            pnl_val = clean_numeric(row[col_map[pnl_col]]) if pnl_col else 0.0
            if (exit_p >= entry_p and pnl_val >= 0) or (exit_p < entry_p and pnl_val < 0):
                side = 'Long'
            else:
                side = 'Short'
        
        # Parse Dates safely
        try:
            entry_time = pd.to_datetime(row[col_map[entry_t_col]], errors='coerce') if entry_t_col else pd.NaT
        except:
            entry_time = pd.NaT
            
        try:
            exit_time = pd.to_datetime(row[col_map[exit_t_col]], errors='coerce') if exit_t_col else pd.NaT
        except:
            exit_time = pd.NaT
            
        # Compile standardized row
        standard_data.append({
            'exchange': 'Smart_Parser',
            'symbol': symbol,
            'contract_type': contract_type,
            'side': side,
            'entry_time': entry_time,
            'exit_time': exit_time,
            'entry_price': clean_numeric(row[col_map[entry_p_col]]) if entry_p_col else 0.0,
            'exit_price': clean_numeric(row[col_map[exit_p_col]]) if exit_p_col else 0.0,
            'size': clean_numeric(row[col_map[size_col]]) if size_col else 0.0,
            'reported_pnl': clean_numeric(row[col_map[pnl_col]]) if pnl_col else 0.0
        })
        
    return pd.DataFrame(standard_data)

def ingest_file(file_path, db_conn=None, user_id=None, original_filename=None):
    try:
        if file_path.lower().endswith('.csv'):
            df = safe_read_csv(file_path)
        else:
            try:
                df = pd.read_excel(file_path)
                df = df.dropna(how='all') 
                if any('Unnamed' in str(c) for c in df.columns):
                    valid_rows = df.notna().sum(axis=1)
                    best_row_idx = valid_rows.idxmax()
                    df.columns = df.loc[best_row_idx]
                    df = df.drop(index=range(0, best_row_idx + 1)).reset_index(drop=True)
            except Exception as e:
                 df = pd.read_excel(file_path) 
                 
        if is_trade_level_csv(df):
            df = reconstruct_positions_from_trades(df)
        else:
            df = smart_parse(df)
            
        exchange_name = df['exchange'].iloc[0] if not df.empty else "Desconocido"
        
        # Guardar en base de datos solo si se envían los parámetros (en carga nueva)
        if db_conn is not None and user_id is not None and original_filename:
            try:
                cursor = db_conn.cursor()
                cursor.execute("""
                    INSERT INTO upload_sessions (user_id, filename, exchange_source)
                    VALUES (?, ?, ?)
                """, (user_id, original_filename, exchange_name))
                session_id = cursor.lastrowid
                
                if not df.empty:
                    for _, row in df.iterrows():
                        entry_t = row.get('entry_time')
                        exit_t = row.get('exit_time')
                        
                        # Validar de forma segura si tiene isoformat y no es NaN
                        e_time = entry_t.isoformat() if pd.notna(entry_t) and hasattr(entry_t, 'isoformat') else None
                        x_time = exit_t.isoformat() if pd.notna(exit_t) and hasattr(exit_t, 'isoformat') else None
                        
                        cursor.execute("""
                            INSERT INTO trades (session_id, symbol, contract_type, side, entry_time, exit_time, entry_price, exit_price, size, reported_pnl)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            session_id,
                            str(row.get('symbol', '')),
                            str(row.get('contract_type', '')),
                            str(row.get('side', '')),
                            e_time,
                            x_time,
                            float(row.get('entry_price', 0.0) or 0.0),
                            float(row.get('exit_price', 0.0) or 0.0),
                            float(row.get('size', 0.0) or 0.0),
                            float(row.get('reported_pnl', 0.0) or 0.0)
                        ))
                
                db_conn.commit()
            except Exception as db_err:
                # Si falla la inserción, imprimimos y relanzamos para que no pase silenciosamente
                print(f"Error CRÍTICO al guardar en DB: {db_err}")
                raise ValueError(f"Fallo al guardar en base de datos: {db_err}")
            
        return df
        
    except ValueError as ve:
        raise ve
    except Exception as e:
        raise ValueError(f"Error parseando el archivo: {e}")
