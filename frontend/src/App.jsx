import React, { useState, useRef, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import Auth from './components/Auth';
import Profile from './components/Profile';
import AdminPanel from './components/AdminPanel';
import MentorDashboard from './components/MentorDashboard';
import ChangePasswordModal from './components/ChangePasswordModal';
import Landing from './components/Landing';
import { Lock, Moon, Sun, UploadCloud, Search, User } from 'lucide-react';
import API_BASE from './api';
import './index.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState(localStorage.getItem('username') || null);
  const [role, setRole] = useState(localStorage.getItem('role') || 'user');
  const [view, setView] = useState('upload'); // 'upload', 'dashboard', 'profile', 'admin', 'mentor'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [loadingText, setLoadingText] = useState('Analizando patrones matemáticos...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const inputRef = useRef(null);
  
  const [activeFilters, setActiveFilters] = useState({
    symbol: null,
    startTime: null,
    endTime: null,
    timeframe: null
  });

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
    let progressInterval;
    if (loading) {
      setLoadingProgress(0);
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
        i = (i + 1);
        if (i < messages.length) {
          setLoadingText(messages[i]);
        } else {
          i = 0;
          setLoadingText(messages[i]);
        }
      }, 2000);

      progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 95) return prev;
          const increment = Math.max(0.5, (95 - prev) * 0.05);
          return prev + increment;
        });
      }, 200);
    }
    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
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
    setShowLanding(true);
  };

  const handleFile = async (file, filtersToApply = {}) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setSelectedFile(file);
    setCurrentSessionId(null);

    const mergedFilters = { ...activeFilters, ...filtersToApply };
    setActiveFilters(mergedFilters);

    const formData = new FormData();
    formData.append('file', file);
    if (mergedFilters.symbol) {
      formData.append('target_symbol', mergedFilters.symbol);
    }
    if (mergedFilters.timeframe) {
      formData.append('timeframe', mergedFilters.timeframe);
    }
    if (mergedFilters.startTime) {
      formData.append('start_time', mergedFilters.startTime);
    }
    if (mergedFilters.endTime) {
      formData.append('end_time', mergedFilters.endTime);
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

  const handleLoadSession = async (reportId, filtersToApply = {}) => {
    if (!reportId) return;
    setLoading(true);
    setError('');
    setCurrentSessionId(reportId);

    const mergedFilters = { ...activeFilters, ...filtersToApply };
    setActiveFilters(mergedFilters);

    try {
      let response = await fetch(`${API_BASE}/api/report/${reportId}/analyze`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          target_symbol: mergedFilters.symbol || null,
          start_time: mergedFilters.startTime || null,
          end_time: mergedFilters.endTime || null,
          timeframe: mergedFilters.timeframe || null
        })
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
      
      setData(prevData => {
        let newData = (!mergedFilters.symbol && result.report) ? result.report : result;
        
        if ((mergedFilters.startTime || mergedFilters.endTime) && prevData && prevData.metrics) {
           if (prevData.metrics.equity_curve) {
             newData.metrics.equity_curve = prevData.metrics.equity_curve;
           }
           if (prevData.metrics.tv_data) {
             newData.metrics.tv_data = prevData.metrics.tv_data;
           }
        }
        
        return newData;
      });
      
      setView('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    if (showLanding) {
      return <Landing onEnterApp={() => setShowLanding(false)} />;
    }
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
            Hola, <strong className="text-neutral">{username}</strong> 
            {role === 'admin' && <span style={{color: '#f59e0b', marginLeft: '5px'}}>(Admin)</span>}
            {(role === 'mentor') && <span style={{color: '#10b981', marginLeft: '5px'}}>(Mentor)</span>}
          </span>
          <button onClick={() => setView('upload')} className={`nav-btn ${view === 'upload' ? 'active' : ''}`}>Auditar</button>
          <button onClick={() => setView('profile')} className={`nav-btn ${view === 'profile' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <User size={18} />
            Mi Perfil
          </button>
          {role === 'mentor' && (
            <button onClick={() => setView('mentor')} className="nav-btn" style={{color: '#10b981', borderColor: '#10b981'}}>Mentor</button>
          )}
          {role === 'admin' && (
            <button onClick={() => setView('admin')} className="nav-btn warning">Maestro</button>
          )}
          <button onClick={() => setShowSecurityModal(true)} className="nav-btn" title="Cambiar contraseña" style={{ display: 'flex', alignItems: 'center' }}>
            <Lock size={18} />
          </button>
          <button onClick={toggleTheme} className="theme-toggle-btn" title="Cambiar Tema" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button onClick={handleLogout} className="nav-btn danger">Salir</button>
        </div>
      </nav>

      {showSecurityModal && (
        <ChangePasswordModal token={token} onClose={() => setShowSecurityModal(false)} />
      )}

      {view === 'profile' && token && <Profile token={token} onReportSelect={(sessionId) => handleLoadSession(sessionId)} />}
      {view === 'admin' && <AdminPanel token={token} />}
      {view === 'mentor' && <MentorDashboard token={token} onReportSelect={(sessionId) => handleLoadSession(sessionId)} />}

      {view === 'upload' && !loading && (
        <div className="upload-container hero-upload">
          <img src="/logo.jpg" alt="" className="logo-hero-bg" aria-hidden="true" />
          
          <h2 style={{ fontSize: '2.5rem', marginBottom: '10px', position: 'relative', zIndex: 1 }}>Auditar mi Operativa</h2>
          <p className="hero-desc" style={{ maxWidth: '750px' }}>
            Sube el historial de operaciones de tu exchange (compatible con Bitunix, CoinEx, OKX, Binance y más). Sabueso rastreará tus patrones y revelará tu ventaja matemática.
          </p>

          <div className="file-drop-area"
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          >
            <UploadCloud size={48} style={{marginBottom: '16px', color: 'var(--primary)'}} />
            <span className="file-msg" style={{display: 'block', marginBottom: '16px', fontWeight: '500'}}>Haz clic o arrastra tu archivo CSV/XLSX aquí</span>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]); }} />
            <button className="nav-btn" onClick={() => inputRef.current.click()} style={{padding: '12px 32px', fontSize: '1rem', background: 'var(--primary)', color: '#000'}}>Seleccionar archivo</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-overlay glass-card">
          <div className="loader-container">
            <div className="sabueso-loader-new">
              <div className="candlestick-anim">
                <div className="candle up c1"></div>
                <div className="candle down c2"></div>
                <div className="candle up c3"></div>
                <div className="candle up c4"></div>
                <div className="candle down c5"></div>
              </div>
            </div>
            
            <div className="loading-status">
              <h3 className="loading-text">{loadingText}</h3>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${Math.round(loadingProgress)}%` }}>
                  <div className="progress-glow"></div>
                </div>
              </div>
              <div className="progress-percentage">{Math.round(loadingProgress)}%</div>
            </div>
          </div>
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
              const newFilters = { symbol, startTime: null, endTime: null, timeframe: null };
              if (currentSessionId) {
                handleLoadSession(currentSessionId, newFilters);
              } else {
                handleFile(selectedFile, newFilters);
              }
            }} 
            onTimeframeChange={(timeframe) => {
              const newFilters = { timeframe };
              if (currentSessionId) {
                handleLoadSession(currentSessionId, newFilters);
              } else {
                handleFile(selectedFile, newFilters);
              }
            }}
            onTimeRangeChange={(start, end) => {
              const newFilters = { startTime: start, endTime: end };
              if (currentSessionId) {
                handleLoadSession(currentSessionId, newFilters);
              } else {
                handleFile(selectedFile, newFilters);
              }
            }}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

export default App;
