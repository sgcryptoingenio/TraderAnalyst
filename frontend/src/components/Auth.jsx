import React, { useState } from 'react';
const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const url = isLogin ? 'http://localhost:8000/api/login' : 'http://localhost:8000/api/register';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error en autenticación');
      onLogin(data.access_token, data.username, data.role);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '400px', margin: '100px auto', textAlign: 'center' }}>
      <h2 style={{color: 'var(--primary)', marginBottom: '20px'}}>{isLogin ? 'Iniciar Sesión' : 'Registrarse'}</h2>
      {error && <p style={{color: 'var(--loss-color)', marginBottom: '15px'}}>{error}</p>}
      <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
        <input type="text" placeholder="Usuario" value={username} onChange={e=>setUsername(e.target.value)} required style={{padding: '10px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff'}} />
        <input type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} required style={{padding: '10px', borderRadius: '5px', border: '1px solid #333', background: '#222', color: '#fff'}} />
        <button type="submit" style={{padding: '10px', background: 'var(--primary)', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: 'pointer'}}>{isLogin ? 'Ingresar' : 'Crear Cuenta'}</button>
      </form>
      <p style={{marginTop: '20px', cursor: 'pointer', color: '#aaa'}} onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia Sesión'}
      </p>
    </div>
  );
};
export default Auth;
