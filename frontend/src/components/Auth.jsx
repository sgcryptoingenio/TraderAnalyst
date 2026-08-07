import React, { useState, useEffect } from 'react';
import API_BASE from '../api';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'PON_TU_CLIENT_ID_AQUI';

const Auth = ({ onLogin }) => {
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
      <div className="glass-card" style={{ maxWidth: '400px', margin: '100px auto', textAlign: 'center' }}>
        <h2 style={{color: 'var(--primary)', marginBottom: '20px'}}>{isLogin ? 'Iniciar Sesión' : 'Registrarse'}</h2>
        {successMsg && <div style={{background: 'rgba(0, 255, 127, 0.1)', border: '1px solid var(--primary)', padding: '10px', borderRadius: '5px', color: 'var(--primary)', marginBottom: '15px'}}>{successMsg}</div>}
      {error && <p style={{color: 'var(--loss-color)', marginBottom: '15px'}}>{error}</p>}
      <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
        <input type="text" placeholder="Usuario" value={username} onChange={e=>setUsername(e.target.value)} required style={{padding: '10px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff'}} />
        {!isLogin && (
          <>
            <input type="email" placeholder="Correo Electrónico" value={email} onChange={e=>setEmail(e.target.value)} required style={{padding: '10px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff'}} />
            <input 
              type="text" 
              placeholder="Código de Academia (Opcional)" 
              value={inviteCode} 
              onChange={e=>setInviteCode(e.target.value)} 
              readOnly={inviteCodeFromUrl}
              style={{
                padding: '10px', 
                borderRadius: '5px', 
                border: '1px solid #333', 
                background: inviteCodeFromUrl ? '#111' : '#222', 
                color: inviteCodeFromUrl ? 'var(--primary)' : '#fff',
                fontWeight: inviteCodeFromUrl ? 'bold' : 'normal'
              }} 
            />
          </>
        )}
        <input type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} required style={{padding: '10px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff'}} />
        <button type="submit" disabled={isLoading} style={{padding: '10px', background: 'var(--primary)', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1}}>
          {isLoading ? 'Cargando...' : (isLogin ? 'Ingresar' : 'Crear Cuenta')}
        </button>
      </form>
      
      <div style={{ marginTop: '20px', marginBottom: '10px' }}>
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          useOneTap
          theme="filled_black"
          shape="rectangular"
        />
      </div>

      <p style={{marginTop: '20px', cursor: 'pointer', color: '#aaa'}} onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia Sesión'}
      </p>
      </div>
    </GoogleOAuthProvider>
  );
};
export default Auth;
