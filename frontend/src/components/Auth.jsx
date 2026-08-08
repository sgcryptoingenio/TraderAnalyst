import React, { useState, useEffect } from 'react';
import API_BASE from '../api';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import './Auth.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'PON_TU_CLIENT_ID_AQUI';

const Auth = ({ onLogin, onCancel }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [inviteCodeFromUrl, setInviteCodeFromUrl] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setInviteCode(ref);
      setInviteCodeFromUrl(true);
      setIsLogin(false);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    try {
      const url = isLogin ? `${API_BASE}/api/login` : `${API_BASE}/api/register`;
      const bodyParams = isLogin 
        ? { username, password } 
        : { username, password, email, invite_code: inviteCode || null };
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyParams)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error en autenticación');
      
      if (isLogin) {
        onLogin(data.access_token, data.username, data.role);
      } else {
        setSuccessMsg('Registro exitoso. Ahora puedes iniciar sesión.');
        setIsLogin(true);
        setPassword('');
        setEmail('');
      }
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error en Google Login');
      onLogin(data.access_token, data.username, data.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Falló el inicio de sesión con Google');
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="auth-modal-overlay">
        <div className="auth-modal-content">
          {onCancel && (
            <button className="auth-close-btn" onClick={onCancel} aria-label="Cerrar">
              <X size={18} />
            </button>
          )}

          <div className="auth-header">
            <h2>{isLogin ? 'Bienvenido a Sabueso' : 'Crea tu cuenta'}</h2>
            <p>{isLogin ? 'Ingresa para continuar analizando' : 'Inicia tu prueba gratuita en segundos'}</p>
          </div>

          {successMsg && (
            <div className="auth-alert success">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}
          
          {error && (
            <div className="auth-alert error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-input-group">
              <input 
                className="auth-input"
                type="text" 
                placeholder="Usuario" 
                value={username} 
                onChange={e=>setUsername(e.target.value)} 
                required 
              />
            </div>

            {!isLogin && (
              <>
                <div className="auth-input-group">
                  <input 
                    className="auth-input"
                    type="email" 
                    placeholder="Correo Electrónico" 
                    value={email} 
                    onChange={e=>setEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div className="auth-input-group">
                  <input 
                    className="auth-input"
                    type="text" 
                    placeholder="Código de Academia (Opcional)" 
                    value={inviteCode} 
                    onChange={e=>setInviteCode(e.target.value)} 
                    readOnly={inviteCodeFromUrl}
                    style={{
                      background: inviteCodeFromUrl ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)',
                      color: inviteCodeFromUrl ? 'var(--primary)' : '#fff',
                      fontWeight: inviteCodeFromUrl ? 'bold' : 'normal'
                    }}
                  />
                </div>
              </>
            )}

            <div className="auth-input-group">
              <input 
                className="auth-input"
                type="password" 
                placeholder="Contraseña" 
                value={password} 
                onChange={e=>setPassword(e.target.value)} 
                required 
              />
            </div>

            <button type="submit" className="auth-btn-submit" disabled={isLoading}>
              {isLoading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Crear Cuenta')}
            </button>
          </form>
          
          <div className="auth-divider">o continuar con</div>
          
          <div className="auth-google-wrapper">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              useOneTap
              theme="filled_black"
              shape="rectangular"
              text={isLogin ? "signin_with" : "signup_with"}
            />
          </div>

          <div className="auth-switch-mode">
            {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
            <span onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? 'Regístrate aquí' : 'Inicia Sesión'}
            </span>
          </div>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
};
export default Auth;
