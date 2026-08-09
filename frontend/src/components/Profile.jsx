import React, { useState, useEffect, useRef } from 'react';
import API_BASE from '../api';
import { User, Eye, Edit2, Check, X, Camera, Upload } from 'lucide-react';

const Profile = ({ token, onReportSelect }) => {
  const [profile, setProfile] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef(null);

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Error al cargar perfil');
      const data = await response.json();
      setProfile(data.profile);
      setReports(data.reports);
      setEditName(data.profile.name || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const handleSaveProfile = async (newPhotoData = null) => {
    try {
      const payload = {
        name: editName,
        photo_data: newPhotoData !== null ? newPhotoData : profile.photo_data
      };
      const response = await fetch(`${API_BASE}/api/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Error guardando perfil');
      await fetchProfile();
      setEditing(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen es demasiado grande. Máximo 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 250;
        const MAX_HEIGHT = 250;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        handleSaveProfile(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: '50px' }}>Cargando perfil...</div>;
  if (error) return <div style={{ color: 'var(--loss-color)', textAlign: 'center', marginTop: '50px' }}>{error}</div>;
  if (!profile) return null;

  const displayName = profile.name || profile.username;

  return (
    <div className="glass-card" style={{ maxWidth: '900px', margin: '40px auto', padding: '30px' }}>
      
      {/* Profile Header */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: '30px', marginBottom: '40px', paddingBottom: '30px', borderBottom: '1px solid #333', textAlign: 'center' }}>
        <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
          {profile.photo_data ? (
            <img src={profile.photo_data} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary)' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#222', border: '3px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={50} color="#666" />
            </div>
          )}
          <button 
            onClick={() => fileInputRef.current.click()}
            style={{ position: 'absolute', bottom: '0', right: '0', background: 'var(--primary)', color: '#000', border: 'none', borderRadius: '50%', width: '35px', height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}
            title="Cambiar Foto"
          >
            <Camera size={18} />
          </button>
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
        </div>
        
        <div style={{ flex: 1 }}>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)} 
                placeholder="Ingresa tu nombre completo"
                style={{ background: '#111', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '5px', fontSize: '1.5rem', width: '100%', maxWidth: '300px' }}
                autoFocus
              />
              <button onClick={() => handleSaveProfile(null)} style={{ background: 'var(--profit-color)', color: '#000', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' }}><Check size={20} /></button>
              <button onClick={() => setEditing(false)} style={{ background: '#444', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' }}><X size={20} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '10px' }}>
              <h1 style={{ margin: 0, fontSize: '2rem', color: '#fff' }}>{displayName}</h1>
              <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }} title="Editar Nombre">
                <Edit2 size={18} />
              </button>
            </div>
          )}
          <p style={{ margin: '5px 0', color: '#aaa', fontSize: '1.1rem' }}>@{profile.username} • {profile.email}</p>
          <p style={{ margin: 0, color: 'var(--primary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{profile.role}</p>
        </div>
      </div>

      {/* History Table */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '1.3rem' }}>Historial Reciente</h3>
          <span style={{ fontSize: '0.9rem', color: '#666', background: '#111', padding: '5px 10px', borderRadius: '5px' }}>Últimos 10 registros</span>
        </div>

        {reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', color: '#888' }}>
            No hay reportes analizados todavía. Sube un archivo de trading para comenzar.
          </div>
        ) : (
          <div className="table-container">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: '#888', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '15px 10px' }}>Fecha de Análisis</th>
                  <th style={{ padding: '15px 10px' }}>Archivo</th>
                  <th style={{ padding: '15px 10px' }}>Exchange</th>
                  <th style={{ padding: '15px 10px', textAlign: 'right' }}>Trades</th>
                  <th style={{ padding: '15px 10px', textAlign: 'right' }}>Win Rate</th>
                  <th style={{ padding: '15px 10px', textAlign: 'right' }}>PnL</th>
                  <th style={{ padding: '15px 10px', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #1a1a1a', transition: 'background 0.2s' }}>
                    <td style={{ padding: '15px 10px', color: '#ccc' }}>
                      {new Date(r.upload_time).toLocaleString()}
                    </td>
                    <td style={{ padding: '15px 10px' }}>
                      <span style={{ 
                        background: '#111', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', color: '#aaa',
                        display: 'inline-block', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }} title={r.filename}>
                        {r.filename}
                      </span>
                    </td>
                    <td style={{ padding: '15px 10px', color: 'var(--primary)' }}>{r.exchange || 'N/A'}</td>
                    <td style={{ padding: '15px 10px', textAlign: 'right', fontWeight: 'bold' }}>{r.total_trades}</td>
                    <td style={{ padding: '15px 10px', textAlign: 'right' }}>{r.win_rate !== null ? `${r.win_rate.toFixed(1)}%` : '-'}</td>
                    <td style={{ padding: '15px 10px', textAlign: 'right', color: r.total_pnl >= 0 ? 'var(--profit-color)' : 'var(--loss-color)', fontWeight: 'bold' }}>
                      {r.total_pnl !== null ? `$${r.total_pnl.toFixed(2)}` : '-'}
                    </td>
                    <td style={{ padding: '15px 10px', textAlign: 'center' }}>
                      <button 
                        className="nav-btn"
                        style={{ padding: '6px 12px', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        onClick={() => onReportSelect(r.id)}
                      >
                        <Eye size={14} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
