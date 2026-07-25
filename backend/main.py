from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import os
import json
import time
from typing import Optional
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool
import pandas as pd

from ingestor import ingest_file
from analyzer import analyze_trades
from database import get_db
from auth import verify_password, get_password_hash, create_access_token, decode_access_token

app = FastAPI()

frontend_url = os.getenv("FRONTEND_URL")
origins = [frontend_url] if frontend_url else ["*"]

from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        err_msg = traceback.format_exc()
        print("\n=== CRASH TRACEBACK ===")
        print(err_msg)
        print("=======================\n")
        with open("crash.log", "w", encoding="utf-8") as f:
            f.write(err_msg)
        return JSONResponse(status_code=500, content={"detail": f"Error capturado: {str(exc)}. Revisa crash.log."})

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from typing import Optional

class UserAuth(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

def get_current_user(authorization: str = Header(None), token: str = None):
    if not authorization and not token:
        raise HTTPException(status_code=401, detail="No autenticado")

    if authorization and authorization.startswith("Bearer "):
        token_str = authorization.split(" ")[1]
    else:
        token_str = token

    payload = decode_access_token(token_str)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return int(payload["sub"])

@app.post("/api/register")
def register(user: UserAuth, db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (user.username,))
    if cursor.fetchone():

        raise HTTPException(status_code=400, detail="El usuario ya existe")
    
    role = 'admin' if user.username.lower() in ['admin', 'profesor'] else 'user'
    hashed_password = get_password_hash(user.password)
    cursor.execute("INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)", (user.username, hashed_password, role, user.email))
    conn.commit()
    
    return {"success": True, "message": "Usuario registrado exitosamente"}

@app.post("/api/login")
def login(user: UserAuth, db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT id, password_hash, role FROM users WHERE username = ?", (user.username,))
    db_user = cursor.fetchone()
    
    
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    access_token = create_access_token(data={"sub": str(db_user["id"]), "username": user.username, "role": db_user["role"]})
    return {"access_token": access_token, "token_type": "bearer", "username": user.username, "role": db_user["role"]}

@app.post("/api/change-password")
def change_password(
    req: ChangePasswordRequest, 
    user_id: int = Depends(get_current_user), 
    db = Depends(get_db)
):
    conn = db
    cursor = conn.cursor()
    
    cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    db_user = cursor.fetchone()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    if not verify_password(req.old_password, db_user["password_hash"]):
        raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")
        
    hashed_new_password = get_password_hash(req.new_password)
    
    cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed_new_password, user_id))
    conn.commit()
    
    return {"success": True, "message": "Contraseña actualizada exitosamente"}

@app.get("/api/history")
def get_history(user_id: int = Depends(get_current_user), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT id, filename, exchange, total_trades, win_rate, total_pnl, upload_time FROM reports WHERE user_id = ? ORDER BY upload_time DESC", (user_id,))
    rows = cursor.fetchall()
    
    reports = [dict(row) for row in rows]
    return {"success": True, "reports": reports}

def require_admin(authorization: str = Header(None), token: str = None):
    if not authorization and not token:
        raise HTTPException(status_code=401, detail="No autenticado")

    if authorization and authorization.startswith("Bearer "):
        token_str = authorization.split(" ")[1]
    else:
        token_str = token

    payload = decode_access_token(token_str)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Permisos de administrador requeridos")
    return payload

@app.get("/api/admin/users")
def get_all_users(admin_payload: dict = Depends(require_admin), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, created_at FROM users")
    rows = cursor.fetchall()
    
    return {"success": True, "users": [dict(row) for row in rows]}

@app.get("/api/admin/reports")
def get_all_reports(admin_payload: dict = Depends(require_admin), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.*, u.username 
        FROM reports r 
        JOIN users u ON r.user_id = u.id 
        ORDER BY r.upload_time DESC
    """)
    rows = cursor.fetchall()
    
    reports_list = []
    for row in rows:
        r = dict(row)
        r['full_data'] = json.loads(r['full_data']) if r['full_data'] else {}
        reports_list.append(r)
    return {"success": True, "reports": reports_list}

@app.get("/api/analyze")
async def get_analysis(
    session_id: Optional[int] = None,
    target_symbol: Optional[str] = None,
    user_id: int = Depends(get_current_user),
    db = Depends(get_db)
):
    conn = db
    
    if session_id:
        cursor = conn.cursor()
        cursor.execute("SELECT id, exchange_source FROM upload_sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
        session = cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
            
        exchange_name = session['exchange_source']
        query = "SELECT * FROM trades WHERE session_id = ?"
        params = (session_id,)
    else:
        exchange_name = "Consolidado Global"
        query = """
            SELECT t.* 
            FROM trades t
            JOIN upload_sessions s ON t.session_id = s.id
            WHERE s.user_id = ?
        """
        params = (user_id,)
        
    df = pd.read_sql_query(query, conn, params=params)
    
    if df.empty:
        raise HTTPException(status_code=404, detail="No se encontraron operaciones para analizar. Sube un archivo primero.")
        
    if 'entry_time' in df.columns:
        df['entry_time'] = pd.to_datetime(df['entry_time'])
    if 'exit_time' in df.columns:
        df['exit_time'] = pd.to_datetime(df['exit_time'])
        
    metrics = await analyze_trades(df, target_symbol)
    
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = 'mentorship_link'")
    row = cursor.fetchone()
    mentorship_link = row['value'] if row else ""
    
    return {
        "success": True,
        "exchange": exchange_name,
        "metrics": metrics,
        "mentorship_link": mentorship_link,
        "active_symbol": target_symbol
    }

@app.get("/api/market-data/{symbol:path}")
def get_market_data(symbol: str):
    from market_data import fetch_ohlcv, compute_indicators
    import numpy as np
    import pandas as pd
    
    df = fetch_ohlcv(symbol, timeframe='15m', limit=500)
    if df.empty:
        # Fallback
        df = fetch_ohlcv('BTC/USDT', timeframe='15m', limit=500)
        if df.empty:
            raise HTTPException(status_code=404, detail="No data found")
        
    df = compute_indicators(df)
    
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.where(pd.notnull(df), None)
    
    data = []
    for _, row in df.iterrows():
        t = int(row['timestamp'].timestamp())
        data.append({
            'time': t,
            'open': row['open'],
            'high': row['high'],
            'low': row['low'],
            'close': row['close'],
            'EMA_9': row.get('EMA_9'),
            'EMA_21': row.get('EMA_21'),
            'RSI_14': row.get('RSI_14'),
            'MACD': row.get('MACD'),
            'MACD_Signal': row.get('MACD_Signal'),
            'MACD_Hist': row.get('MACD_Hist')
        })
        
    return {"success": True, "data": data}

@app.post("/api/analyze")
async def analyze_history(
    file: UploadFile = File(...),
    target_symbol: str = Form(None),
    user_id: int = Depends(get_current_user),
    db = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No se proporcionó ningún archivo")

    import uuid
    import re
    _, ext = os.path.splitext(file.filename)
    ext = re.sub(r'[^a-zA-Z0-9.]', '', ext)
    safe_filename = f"doc_{uuid.uuid4().hex}{ext}"
    temp_file_path = f"temp_{safe_filename}"
    
    try:
        cursor = db.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = 'mentorship_link'")
        row = cursor.fetchone()
        mentorship_link = row['value'] if row else ""
        
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
        # Solo pasar conexión de BD si es una carga global, para que se guarde el upload_session
        # Usamos `not target_symbol` para atrapar tanto None como strings vacíos ("")
        if not target_symbol:
            df = ingest_file(temp_file_path, db, user_id, file.filename)
        else:
            df = ingest_file(temp_file_path)
            
        metrics = await analyze_trades(df, target_symbol)

        exchange_name = df['exchange'].iloc[0] if not df.empty else "Desconocido"

        # Only save to history if it's the global analysis (no specific target symbol)
        # to avoid flooding the history with individual pair clicks
        if not target_symbol and metrics and 'total_trades' in metrics:
            os.makedirs("uploads", exist_ok=True)
            perm_file_path = f"uploads/{user_id}_{int(time.time())}_{safe_filename}"
            shutil.move(temp_file_path, perm_file_path)
    
            conn = db
            cursor = conn.cursor()
            
            # Limpiar strings de % o $ si es necesario para cast a REAL
            def clean_metric(val):
                if isinstance(val, str):
                    return float(val.replace('%','').replace('$','').replace(',','').strip() or 0)
                return float(val or 0)

            cursor.execute("""
                INSERT INTO reports (user_id, filename, exchange, total_trades, win_rate, avg_win_amt, avg_loss_amt, total_pnl, risk_reward_ratio, full_data, file_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, 
                file.filename, 
                exchange_name, 
                int(metrics.get('total_trades', 0)),
                clean_metric(metrics.get('win_rate', 0)),
                clean_metric(metrics.get('avg_win_amt_usd', 0)),
                clean_metric(metrics.get('avg_loss_amt_usd', 0)),
                clean_metric(metrics.get('total_pnl_usd', 0)),
                clean_metric(metrics.get('risk_reward_ratio', 0)),
                json.dumps(jsonable_encoder(metrics)),
                perm_file_path
            ))
            
            conn.commit()
    

        return {
            "success": True,
            "exchange": exchange_name,
            "metrics": metrics,
            "mentorship_link": mentorship_link,
            "active_symbol": target_symbol
        }

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.get("/api/report/{report_id}")
async def get_report_details(report_id: int, user_id: int = Depends(get_current_user), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
    report = cursor.fetchone()
    
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user or (user['role'] != 'admin' and report['user_id'] != user_id):
        raise HTTPException(status_code=403, detail="Acceso denegado")

    return {
        "success": True,
        "report": {
            "id": report['id'],
            "exchange": report['exchange'],
            "metrics": json.loads(report['full_data']) if report['full_data'] else {},
            "active_symbol": None
        }
    }

@app.delete("/api/admin/users/{target_id}")
async def admin_delete_user(target_id: int, user_id: int = Depends(get_current_user), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    
    # Check if admin
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user or user['role'] != 'admin':

        raise HTTPException(status_code=403, detail="Acceso denegado")

    if user_id == target_id:

        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    # Delete physical files
    cursor.execute("SELECT file_path FROM reports WHERE user_id = ?", (target_id,))
    reports = cursor.fetchall()
    for rep in reports:
        fp = rep['file_path']
        if fp and os.path.exists(fp):
            try:
                os.remove(fp)
            except:
                pass
        
    # Cascade delete (reports then user)
    cursor.execute("DELETE FROM reports WHERE user_id = ?", (target_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (target_id,))
    conn.commit()
    
    
    return {"success": True}

@app.put("/api/admin/users/{target_id}/role")
async def change_user_role(target_id: int, user_id: int = Depends(get_current_user), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    # Check if admin
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user or user['role'] != 'admin':

        raise HTTPException(status_code=403, detail="Acceso denegado")

    if target_id == user_id:

        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol")

    cursor.execute("SELECT role FROM users WHERE id = ?", (target_id,))
    target = cursor.fetchone()
    if not target:

        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    new_role = 'admin' if target['role'] == 'user' else 'user'
    
    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, target_id))
    conn.commit()
    
    
    return {"success": True, "new_role": new_role}

class SettingsUpdate(BaseModel):
    mentorship_link: str

@app.get("/api/settings")
def get_settings(db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = 'mentorship_link'")
    row = cursor.fetchone()
    
    return {"success": True, "mentorship_link": row["value"] if row else ""}

@app.put("/api/admin/settings")
def update_settings(settings: SettingsUpdate, admin_payload: dict = Depends(require_admin), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("UPDATE settings SET value = ? WHERE key = 'mentorship_link'", (settings.mentorship_link,))
    conn.commit()
    
    return {"success": True}

class AnalyzeRequest(BaseModel):
    target_symbol: str

@app.post("/api/report/{report_id}/analyze")
async def analyze_report_symbol(report_id: int, req: AnalyzeRequest, user_id: int = Depends(get_current_user), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
    report = cursor.fetchone()
    
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user or (user['role'] != 'admin' and report['user_id'] != user_id):
        raise HTTPException(status_code=403, detail="Acceso denegado")

    file_path = report['file_path']
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="El archivo original ya no está disponible en el servidor")

    try:
        cursor = db.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = 'mentorship_link'")
        row = cursor.fetchone()
        mentorship_link = row['value'] if row else ""
        
        df = await run_in_threadpool(ingest_file, file_path)
        metrics = await analyze_trades(df, req.target_symbol)

        return {
            "success": True,
            "exchange": report['exchange'],
            "metrics": metrics,
            "mentorship_link": mentorship_link,
            "active_symbol": req.target_symbol
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/report/{report_id}/download")
async def download_report(report_id: int, user_id: int = Depends(get_current_user), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    
    cursor.execute("SELECT user_id, file_path, filename FROM reports WHERE id = ?", (report_id,))
    report = cursor.fetchone()
    
    if not report:

        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    
    if not user or (user['role'] != 'admin' and report['user_id'] != user_id):
        raise HTTPException(status_code=403, detail="Acceso denegado")

    file_path = report['file_path']
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo original no disponible en el servidor")

    return FileResponse(path=file_path, filename=report['filename'])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
