import jwt
from datetime import datetime, timedelta
import os
from passlib.context import CryptContext

# Secret key for JWT. In production, use an environment variable.
SECRET_KEY = os.getenv("SABUESO_SECRET_KEY", "sabueso_super_secret_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4)

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    # Check if it's a legacy SHA256 hash (doesn't start with bcrypt's '$')
    if not hashed_password.startswith("$"):
        import hashlib
        return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError as e:
        print(f"JWT Decode Error: {e}")
        return None

try:
    from google.oauth2 import id_token
    from google.auth.transport import requests
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
except ImportError:
    id_token = None

def verify_google_token(token: str):
    if not id_token:
        print("Google Auth no está instalado. Ejecuta: pip install google-auth")
        return None
    try:
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        return idinfo
    except ValueError as e:
        print(f"Error verificando token de Google: {e}")
        return None
