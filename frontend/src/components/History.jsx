import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import API_BASE from '../api';

const History = ({ token, onReportSelect }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/history`, { 
      headers: { 'Authorization': `Bearer ${token}` } 
    })
      .then(res => res.json())
      .then(data => { 
        // El backend puede devolver directamente la lista o dentro de un objeto
        const reportsData = Array.isArray(data) ? data : (data.reports || []);
        setReports(reportsData); 
        setLoading(false); 
      })
      .catch((err) => {
        console.error("Error cargando historial:", err);
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="loading-overlay glass-card" style={{ maxWidth: '800px', margin: '0 auto', minHeight: '300px' }}>
        <div className="spinner"></div>
        <h3 className="loading-text">Cargando tu historial...</h3>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px' }}>
      <h2 style={{ marginBottom: '30px', fontSize: '2rem', color: 'var(--text-primary)' }}>
        Mi Historial de <span className="text-win">Cargas</span>
      </h2>
      
      {reports.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: '1.1rem', textAlign: 'center', padding: '40px 0' }}>
          No tienes reportes guardados aún. Ve a "Auditar" para subir tu primer historial.
        </p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Archivo / Exchange</th>
                <th>Operaciones</th>
                <th>Efectividad</th>
                <th>PnL Total</th>
                <th>Fecha de Carga</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const pnlValue = parseFloat(r.total_pnl);
                return (
                  <tr 
                    key={r.id} 
                    onClick={() => onReportSelect(r.id)} 
                    className="hoverable-row" 
                    style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                  >
                    <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      {r.exchange || 'Desconocido'}
                    </td>
                    <td className="text-secondary">{r.total_trades}</td>
                    <td className="text-secondary">{r.win_rate}</td>
                    <td className={pnlValue >= 0 ? 'text-win' : 'text-loss'} style={{ fontWeight: 'bold' }}>
                      {r.total_pnl}
                    </td>
                    <td className="text-secondary">
                      {new Date(r.upload_time).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="nav-btn" 
                        onClick={() => window.open(`${API_BASE}/api/report/${r.id}/download?token=${token}`, '_blank')}
                      >
                        ⬇️ Descargar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default History;
