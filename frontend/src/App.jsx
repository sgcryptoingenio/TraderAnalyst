import React, { useState, useRef, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import Auth from './components/Auth';
import History from './components/History';
import AdminPanel from './components/AdminPanel';
import ChangePasswordModal from './components/ChangePasswordModal';
import API_BASE from './api';
import './index.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState(localStorage.getItem('username') || null);
  const [role, setRole] = useState(localStorage.getItem('role') || 'user');
  const [view, setView] = useState('upload'); // 'upload', 'dashboard', 'history', 'admin'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [loadingText, setLoadingText] = useState('Analizando patrones matemáticos...');
  const inputRef = useRef(null);

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    let interval;
    if (loading) {
      const messages = [
        "Procesando archivo e identificando columnas...",
        "Calculando PnL Real y Estadísticas...",
        "Conectando con Binance para descargar histórico de velas...",
        "Aplicando cruces de EMA y Bandas de Bollinger...",
        "Evaluando zonas de RSI...",
        "Generando tablero de análisis..."
      ];
      let i = 0;
      setLoadingText(messages[0]);
      interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setLoadingText(messages[i]);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleLogin = (newToken, newUsername, newRole) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUsername);
    localStorage.setItem('role', newRole || 'user');
    setToken(newToken);
    setUsername(newUsername);
    setRole(newRole || 'user');
    setView('upload');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    setToken(null);
    setUsername(null);
    setRole('user');
    setData(null);
    setView('upload');
  };

  const handleFile = async (file, targetSymbol = null) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setSelectedFile(file);
    setCurrentSessionId(null);

    const formData = new FormData();
    formData.append('file', file);
    if (targetSymbol) {
      formData.append('target_symbol', targetSymbol);
    }

    try {
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (response.status === 401) {
        handleLogout();
        throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Error al analizar el archivo');
      }

      const result = await response.json();
      setData(result);
      setView('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSession = async (sessionId, targetSymbol = null) => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    setCurrentSessionId(sessionId);

    // Si pasamos un symbol, lo concatenamos a los query params
    const queryParams = new URLSearchParams({ session_id: sessionId });
    if (targetSymbol) queryParams.append('target_symbol', targetSymbol);

    try {
      const response = await fetch(`${API_BASE}/api/analyze?${queryParams.toString()}`, {
        method: 'POST', // Usamos POST igual que handleFile (asumiendo que el backend acepta session_id como param en POST)
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        handleLogout();
        throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Error al cargar el reporte desde el historial');
      }

      const result = await response.json();
      setData(result);
      setView('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="app-wrapper">
        <Auth onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <nav className="navbar glass-card">
        <h2>Sabueso</h2>
        <div className="nav-buttons">
          <span className="text-secondary" style={{ marginRight: '10px' }}>
            Hola, <strong className="text-neutral">{username}</strong> {role === 'admin' && <span style={{color: '#f59e0b'}}>(Admin)</span>}
          </span>
          <button onClick={() => setView('upload')} className="nav-btn">Auditar</button>
          <button onClick={() => setView('history')} className="nav-btn">Historial</button>
          {role === 'admin' && (
            <button onClick={() => setView('admin')} className="nav-btn warning">Maestro</button>
          )}
          <button onClick={() => setShowSecurityModal(true)} className="nav-btn" title="Cambiar contraseña">
            🔒
          </button>
          <button onClick={toggleTheme} className="theme-toggle-btn" title="Cambiar Tema">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button onClick={handleLogout} className="nav-btn danger">Salir</button>
        </div>
      </nav>

      {showSecurityModal && (
        <ChangePasswordModal token={token} onClose={() => setShowSecurityModal(false)} />
      )}

      {view === 'history' && <History token={token} onReportSelect={(sessionId) => handleLoadSession(sessionId)} />}
      {view === 'admin' && <AdminPanel token={token} />}

      {view === 'upload' && (
        <div className={`upload-section glass-card ${dragActive ? 'active' : ''}`}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        >
          <div className="upload-content">
            <h1 className="main-title">Audita tu Estrategia</h1>
            <p className="subtitle">Sube tu archivo CSV de Binance o Hyperliquid y descubre tu ventaja matemática.</p>
            
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]); }} />
            <button className="upload-btn" onClick={() => inputRef.current.click()}>
              {dragActive ? 'Suelta el archivo aquí...' : 'Subir Historial'}
            </button>
            <p className="text-secondary" style={{ marginTop: '20px', fontSize: '0.85rem' }}>Binance PNL History &middot; Hyperliquid Fills</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-overlay glass-card">
          <div className="spinner"></div>
          <h3 className="loading-text">{loadingText}</h3>
        </div>
      )}

      {error && (
        <div className="error-message glass-card" style={{borderColor: 'var(--loss-color)'}}>
          <h3 style={{color: 'var(--loss-color)'}}>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {view === 'dashboard' && data && !loading && !error && (
        <ErrorBoundary>
          <Dashboard 
            data={data} 
            onSymbolChange={(symbol) => {
              if (currentSessionId) {
                handleLoadSession(currentSessionId, symbol);
              } else {
                handleFile(selectedFile, symbol);
              }
            }} 
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

export default App;
