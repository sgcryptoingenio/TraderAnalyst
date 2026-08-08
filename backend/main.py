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
from auth import verify_password, get_password_hash, create_access_token, decode_access_token, verify_google_token

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
    invite_code: Optional[str] = None

class GoogleAuth(BaseModel):
    credential: str

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
async def register(user: UserAuth, db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (user.username,))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    
    mentor_id = None
    if user.invite_code:
        cursor.execute("SELECT id FROM users WHERE invite_code = ?", (user.invite_code,))
        mentor = cursor.fetchone()
        if not mentor:
            raise HTTPException(status_code=400, detail="El código de academia no es válido")
        mentor_id = mentor['id']
    
    role = 'admin' if user.username.lower() in ['admin', 'profesor'] else 'user'
    hashed_password = await run_in_threadpool(get_password_hash, user.password[:72])
    
    cursor.execute(
        "INSERT INTO users (username, password_hash, role, email, mentor_id) VALUES (?, ?, ?, ?, ?)", 
        (user.username, hashed_password, role, user.email, mentor_id)
    )
    conn.commit()
    
    return {"success": True, "message": "Usuario registrado exitosamente"}

@app.post("/api/login")
async def login(user: UserAuth, db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT id, password_hash, role, mentor_id FROM users WHERE username = ?", (user.username,))
    db_user = cursor.fetchone()
    
    if not db_user:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
        
    is_valid = await run_in_threadpool(verify_password, user.password[:72], db_user["password_hash"])
    if not is_valid:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    access_token = create_access_token(data={
        "sub": str(db_user["id"]), 
        "username": user.username, 
        "role": db_user["role"],
        "mentor_id": db_user["mentor_id"]
    })
    return {"access_token": access_token, "token_type": "bearer", "username": user.username, "role": db_user["role"]}

@app.post("/api/auth/google")
async def google_auth(auth: GoogleAuth, db = Depends(get_db)):
    user_info = await run_in_threadpool(verify_google_token, auth.credential)
    if not user_info:
        raise HTTPException(status_code=401, detail="Token de Google inválido")
        
    email = user_info.get("email")
    name = user_info.get("name")
    if not email:
        raise HTTPException(status_code=400, detail="El token de Google no contiene email")
        
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, mentor_id FROM users WHERE email = ?", (email,))
    db_user = cursor.fetchone()
    
    if not db_user:
        # Create user if not exists
        username = email.split('@')[0]
        # Check if username is taken, append some random digits if so
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            import random
            username = f"{username}{random.randint(1000, 9999)}"
            
        hashed_password = await run_in_threadpool(get_password_hash, os.urandom(16).hex())
        cursor.execute(
            "INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, 'user', ?)",
            (username, hashed_password, email)
        )
        conn.commit()
        
        cursor.execute("SELECT id, username, role, mentor_id FROM users WHERE email = ?", (email,))
        db_user = cursor.fetchone()

    access_token = create_access_token(data={
        "sub": str(db_user["id"]),
        "username": db_user["username"],
        "role": db_user["role"],
        "mentor_id": db_user["mentor_id"]
    })
    
    return {"access_token": access_token, "token_type": "bearer", "username": db_user["username"], "role": db_user["role"]}

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

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    photo_data: Optional[str] = None

@app.get("/api/profile")
def get_profile(user_id: int = Depends(get_current_user), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    
    # Get user details
    cursor.execute("SELECT username, email, role, name, photo_data FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    # Get last 10 reports
    cursor.execute("SELECT id, filename, exchange, total_trades, win_rate, total_pnl, upload_time FROM reports WHERE user_id = ? ORDER BY upload_time DESC LIMIT 10", (user_id,))
    rows = cursor.fetchall()
    reports = [dict(row) for row in rows]
    
    return {
        "success": True, 
        "profile": dict(user),
        "reports": reports
    }

@app.put("/api/profile")
def update_profile(data: ProfileUpdate, user_id: int = Depends(get_current_user), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    
    cursor.execute("UPDATE users SET name = ?, photo_data = ? WHERE id = ?", (data.name, data.photo_data, user_id))
    conn.commit()
    return {"success": True, "message": "Perfil actualizado exitosamente"}

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

def require_mentor(authorization: str = Header(None), token: str = None):
    if not authorization and not token:
        raise HTTPException(status_code=401, detail="No autenticado")

    if authorization and authorization.startswith("Bearer "):
        token_str = authorization.split(" ")[1]
    else:
        token_str = token

    payload = decode_access_token(token_str)
    if not payload or payload.get("role") not in ["admin", "mentor", "profesor"]:
        raise HTTPException(status_code=403, detail="Permisos de mentor requeridos")
    return payload

@app.get("/api/admin/users")
def get_all_users(admin_payload: dict = Depends(require_admin), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, mentor_id, invite_code, created_at FROM users")
    rows = cursor.fetchall()
    
    return {"success": True, "users": [dict(row) for row in rows]}

@app.get("/api/mentor/students")
def get_mentor_students(mentor_payload: dict = Depends(require_mentor), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    mentor_id = int(mentor_payload["sub"])
    
    # Fetch students assigned to this mentor
    cursor.execute("""
        SELECT u.id, u.username, u.created_at, 
               (SELECT total_pnl FROM reports r WHERE r.user_id = u.id ORDER BY upload_time DESC LIMIT 1) as last_pnl,
               (SELECT win_rate FROM reports r WHERE r.user_id = u.id ORDER BY upload_time DESC LIMIT 1) as last_win_rate
        FROM users u 
        WHERE u.mentor_id = ?
    """, (mentor_id,))
    rows = cursor.fetchall()
    
    return {"success": True, "students": [dict(row) for row in rows]}

@app.get("/api/mentor/students/{student_id}/reports")
def get_mentor_student_reports(student_id: int, mentor_payload: dict = Depends(require_mentor), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    mentor_id = int(mentor_payload["sub"])
    
    # Verify student belongs to this mentor
    cursor.execute("SELECT id FROM users WHERE id = ? AND mentor_id = ?", (student_id, mentor_id))
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="El estudiante no pertenece a tu academia")
        
    cursor.execute("SELECT id, filename, exchange, total_trades, win_rate, total_pnl, upload_time FROM reports WHERE user_id = ? ORDER BY upload_time DESC", (student_id,))
    rows = cursor.fetchall()
    
    return {"success": True, "reports": [dict(row) for row in rows]}

@app.get("/api/admin/reports")
def get_all_reports(admin_payload: dict = Depends(require_admin), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.id, r.user_id, r.filename, r.exchange, r.total_trades, r.win_rate, r.total_pnl, r.upload_time, u.username 
        FROM reports r 
        JOIN users u ON r.user_id = u.id 
        ORDER BY r.upload_time DESC
    """)
    rows = cursor.fetchall()
    
    return {"success": True, "reports": [dict(row) for row in rows]}

@app.get("/api/analyze")
async def get_analysis(
    session_id: Optional[int] = None,
    target_symbol: Optional[str] = None,
    timeframe: Optional[str] = None,
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
        df['entry_time'] = pd.to_datetime(df['entry_time'], errors='coerce')
        if hasattr(df['entry_time'].dt, 'tz') and df['entry_time'].dt.tz is not None:
            df['entry_time'] = df['entry_time'].dt.tz_localize(None)
    if 'exit_time' in df.columns:
        df['exit_time'] = pd.to_datetime(df['exit_time'], errors='coerce')
        if hasattr(df['exit_time'].dt, 'tz') and df['exit_time'].dt.tz is not None:
            df['exit_time'] = df['exit_time'].dt.tz_localize(None)
        df = df.dropna(subset=['exit_time'])
        
    metrics = await analyze_trades(df, target_symbol, timeframe)
    
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
    timeframe: str = Form(None),
    start_time: str = Form(None),
    end_time: str = Form(None),
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
            df = await run_in_threadpool(ingest_file, temp_file_path, db, user_id, file.filename)
        else:
            df = await run_in_threadpool(ingest_file, temp_file_path)
            
        if 'entry_time' in df.columns and hasattr(df['entry_time'].dt, 'tz') and df['entry_time'].dt.tz is not None:
            df['entry_time'] = df['entry_time'].dt.tz_localize(None)
        if 'exit_time' in df.columns and hasattr(df['exit_time'].dt, 'tz') and df['exit_time'].dt.tz is not None:
            df['exit_time'] = df['exit_time'].dt.tz_localize(None)
            
        if start_time:
            st = pd.to_datetime(start_time)
            if st.tzinfo is not None:
                st = st.tz_localize(None)
            df = df[df['exit_time'] >= st]
        if end_time:
            et = pd.to_datetime(end_time)
            if et.tzinfo is not None:
                et = et.tz_localize(None)
            df = df[df['exit_time'] <= et]
            
        metrics = await analyze_trades(df, target_symbol, timeframe)

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
                INSERT INTO reports (user_id, filename, exchange, total_trades, win_rate, avg_win_amt, avg_loss_amt, total_pnl, total_fees, risk_reward_ratio, full_data, file_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, 
                file.filename, 
                exchange_name, 
                int(metrics.get('total_trades', 0)),
                clean_metric(metrics.get('win_rate', 0)),
                clean_metric(metrics.get('avg_win_amt_usd', 0)),
                clean_metric(metrics.get('avg_loss_amt_usd', 0)),
                clean_metric(metrics.get('total_pnl_usd', 0)),
                clean_metric(metrics.get('total_fees_usd', 0)),
                clean_metric(metrics.get('risk_reward_ratio', 0)),
                json.dumps(jsonable_encoder(metrics)),
                perm_file_path
            ))
            
            conn.commit()
            
            # Limitar a 10 reportes por usuario
            cursor.execute("SELECT id, file_path FROM reports WHERE user_id = ? ORDER BY upload_time DESC LIMIT 1000 OFFSET 10", (user_id,))
            old_reports = cursor.fetchall()
            for old_rep in old_reports:
                old_id = old_rep['id']
                old_fp = old_rep['file_path']
                if old_fp and os.path.exists(old_fp):
                    try:
                        os.remove(old_fp)
                    except:
                        pass
                cursor.execute("DELETE FROM reports WHERE id = ?", (old_id,))
            
            if old_reports:
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
    
    is_authorized = False
    if user:
        if user['role'] == 'admin' or report['user_id'] == user_id:
            is_authorized = True
        elif user['role'] in ['mentor', 'profesor']:
            cursor.execute("SELECT mentor_id FROM users WHERE id = ?", (report['user_id'],))
            student = cursor.fetchone()
            if student and student['mentor_id'] == user_id:
                is_authorized = True
                
    if not is_authorized:
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

class RoleUpdate(BaseModel):
    role: str
    invite_code: Optional[str] = None

@app.put("/api/admin/users/{target_id}/role")
async def change_user_role(target_id: int, role_data: RoleUpdate, user_id: int = Depends(get_current_user), db = Depends(get_db)):
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

    new_role = role_data.role
    if new_role not in ['user', 'admin', 'mentor']:
        raise HTTPException(status_code=400, detail="Rol inválido")
        
    if new_role == 'mentor':
        if not role_data.invite_code:
            raise HTTPException(status_code=400, detail="Se requiere un código de invitación para el mentor")
        # Check if code is already taken by someone else
        cursor.execute("SELECT id FROM users WHERE invite_code = ? AND id != ?", (role_data.invite_code, target_id))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="El código de invitación ya está en uso")
            
        cursor.execute("UPDATE users SET role = ?, invite_code = ? WHERE id = ?", (new_role, role_data.invite_code, target_id))
    else:
        cursor.execute("UPDATE users SET role = ?, invite_code = NULL WHERE id = ?", (new_role, target_id))
        
    conn.commit()
    return {"success": True, "new_role": new_role}

class SettingsUpdate(BaseModel):
    mentorship_link: str

def get_current_user_optional(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        return None
    return payload

@app.get("/api/settings")
def get_settings(user_payload: Optional[dict] = Depends(get_current_user_optional), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    
    # Si hay usuario, vemos si tiene un mentor o si es mentor
    if user_payload:
        mentor_id = user_payload.get("mentor_id")
        user_id = user_payload.get("sub")
        role = user_payload.get("role")
        
        target_mentor = mentor_id
        if role == 'mentor':
            target_mentor = user_id
            
        if target_mentor:
            cursor.execute("SELECT help_link FROM users WHERE id = ?", (target_mentor,))
            mentor = cursor.fetchone()
            if mentor and mentor["help_link"]:
                return {"success": True, "mentorship_link": mentor["help_link"]}
                
    # Fallback to global admin settings
    cursor.execute("SELECT value FROM settings WHERE key = 'mentorship_link'")
    row = cursor.fetchone()
    
    return {"success": True, "mentorship_link": row["value"] if row else ""}

class MentorProfileUpdate(BaseModel):
    help_link: str

@app.get("/api/mentor/profile")
def get_mentor_profile(mentor_payload: dict = Depends(require_mentor), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    mentor_id = int(mentor_payload["sub"])
    cursor.execute("SELECT invite_code, help_link FROM users WHERE id = ?", (mentor_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return {"success": True, "invite_code": row["invite_code"], "help_link": row["help_link"] or ""}

@app.put("/api/mentor/profile")
def update_mentor_profile(profile: MentorProfileUpdate, mentor_payload: dict = Depends(require_mentor), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    mentor_id = int(mentor_payload["sub"])
    cursor.execute("UPDATE users SET help_link = ? WHERE id = ?", (profile.help_link, mentor_id))
    conn.commit()
    return {"success": True}

@app.put("/api/admin/settings")
def update_settings(settings: SettingsUpdate, admin_payload: dict = Depends(require_admin), db = Depends(get_db)):
    conn = db
    cursor = conn.cursor()
    cursor.execute("UPDATE settings SET value = ? WHERE key = 'mentorship_link'", (settings.mentorship_link,))
    conn.commit()
    
    return {"success": True}

class AnalyzeRequest(BaseModel):
    target_symbol: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    timeframe: Optional[str] = None

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
    
    is_authorized = False
    if user:
        if user['role'] == 'admin' or report['user_id'] == user_id:
            is_authorized = True
        elif user['role'] in ['mentor', 'profesor']:
            cursor.execute("SELECT mentor_id FROM users WHERE id = ?", (report['user_id'],))
            student = cursor.fetchone()
            if student and student['mentor_id'] == user_id:
                is_authorized = True
                
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    file_path = report['file_path']
    
    try:
        cursor = db.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = 'mentorship_link'")
        row = cursor.fetchone()
        mentorship_link = row['value'] if row else ""
        
        # If the file exists, we can parse it directly
        if file_path and os.path.exists(file_path):
            df = await run_in_threadpool(ingest_file, file_path)
        else:
            # Fallback to database
            query = """
                SELECT t.* 
                FROM trades t
                JOIN upload_sessions s ON t.session_id = s.id
                WHERE s.user_id = ? AND s.filename = ?
                ORDER BY s.id DESC
            """
            df = pd.read_sql_query(query, conn, params=(report['user_id'], report['filename']))
            if df.empty:
                raise HTTPException(status_code=404, detail="El archivo original ya no está disponible y no se encontraron operaciones en la base de datos.")
            
            if 'entry_time' in df.columns:
                df['entry_time'] = pd.to_datetime(df['entry_time'], errors='coerce', utc=True).dt.tz_localize(None)
            if 'exit_time' in df.columns:
                df['exit_time'] = pd.to_datetime(df['exit_time'], errors='coerce', utc=True).dt.tz_localize(None)

        # Filter by date range if provided
        if req.start_time:
            st = pd.to_datetime(req.start_time)
            if st.tzinfo is not None:
                st = st.tz_localize(None)
            df = df[df['exit_time'] >= st]
        if req.end_time:
            et = pd.to_datetime(req.end_time)
            if et.tzinfo is not None:
                et = et.tz_localize(None)
            df = df[df['exit_time'] <= et]
        
        metrics = await analyze_trades(df, req.target_symbol, req.timeframe)

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
