import React, { useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import API_BASE from '../api';

const ChangePasswordModal = ({ token, onClose }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: '' }
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    if (newPassword.length < 6) {
      setStatus({ type: 'error', message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Error al cambiar la contraseña.');
      }

      setStatus({ type: 'success', message: <><CheckCircle size={14} style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '6px'}} /> Contraseña actualizada correctamente.</> });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Cerrar al hacer clic en el backdrop
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-primary)',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    fontFamily: 'var(--font-main)',
    boxSizing: 'border-box',
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '40px',
          borderRadius: '20px',
          position: 'relative',
          animation: 'fadeInUp 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>🔒 Seguridad</h2>
            <p className="text-secondary" style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
              Cambia tu contraseña de acceso
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.4rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px',
              borderRadius: '6px',
              transition: 'color 0.2s',
            }}
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Alert */}
        {status && (
          <div style={{
            padding: '14px 18px',
            borderRadius: '10px',
            marginBottom: '24px',
            fontSize: '0.9rem',
            fontWeight: '500',
            background: status.type === 'success'
              ? 'rgba(16, 185, 129, 0.12)'
              : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${status.type === 'success' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
            color: status.type === 'success' ? 'var(--win-color)' : 'var(--loss-color)',
          }}>
            {status.message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label className="text-secondary" style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Contraseña Actual
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
            />
          </div>

          <div>
            <label className="text-secondary" style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Nueva Contraseña
            </label>
            <input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
            />
          </div>

          <div>
            <label className="text-secondary" style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Confirmar Nueva Contraseña
            </label>
            <input
              type="password"
              placeholder="Repite la nueva contraseña"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              style={{
                ...inputStyle,
                borderColor: confirmPassword && confirmPassword !== newPassword
                  ? 'rgba(239,68,68,0.6)'
                  : 'var(--border-color)',
              }}
              onFocus={e => e.target.style.borderColor = newPassword && confirmPassword !== newPassword ? 'rgba(239,68,68,0.6)' : 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = confirmPassword && confirmPassword !== newPassword ? 'rgba(239,68,68,0.6)' : 'var(--border-color)'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="upload-btn"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '1rem',
              marginTop: '6px',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? <><Loader2 size={16} className="lucide-spin" style={{display: 'inline-block', verticalAlign: 'middle'}} /> Actualizando...</> : 'Actualizar Contraseña'}
          </button>
        </form>
      </div>

      {/* Animación inline */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

export default ChangePasswordModal;
