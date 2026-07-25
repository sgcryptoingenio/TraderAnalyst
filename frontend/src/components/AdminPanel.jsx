import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import API_BASE from '../api';

const AdminPanel = ({ token }) => {
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('reports');
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [mentorshipLink, setMentorshipLink] = useState('');

  const fetchAdminData = async () => {
    try {
      const [usersRes, reportsRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/admin/reports`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/settings`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (!usersRes.ok || !reportsRes.ok) throw new Error('No tienes permisos o hubo un error');

      const usersData = await usersRes.json();
      const reportsData = await reportsRes.json();
      const settingsData = await settingsRes.json();
      
      setUsers(usersData.users || []);
      setReports(reportsData.reports || []);
      setMentorshipLink(settingsData.mentorship_link || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [token]);

  const handleRowClick = async (reportId) => {
    setReportLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/report/${reportId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Error al cargar detalle');
      const data = await res.json();
      setSelectedReport(data.report);
    } catch (err) {
      alert(err.message);
    } finally {
      setReportLoading(false);
    }
  };

  const handleAdminSymbolChange = async (symbol) => {
    if (!selectedReport || !selectedReport.id) return;
    setReportLoading(true);
    try {
      if (!symbol) {
        handleRowClick(selectedReport.id);
        return;
      }
      const res = await fetch(`${API_BASE}/api/report/${selectedReport.id}/analyze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_symbol: symbol })
      });
      if (!res.ok) throw new Error('Error al analizar');
      const data = await res.json();
      setSelectedReport({ ...selectedReport, exchange: data.exchange, metrics: data.metrics, active_symbol: symbol });
    } catch (err) {
      alert(err.message);
    } finally {
      setReportLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este estudiante?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Error al eliminar');
      fetchAdminData();
    } catch (err) { alert(err.message); }
  };

  const handleToggleRole = async (userId) => {
    if (!window.confirm("¿Estás seguro de cambiar el rol de este usuario?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/role`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Error al cambiar rol');
      fetchAdminData();
    } catch (err) { alert(err.message); }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, { 
        method: 'PUT', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorship_link: mentorshipLink })
      });
      if (!res.ok) throw new Error('Error al guardar configuración');
      alert("Configuración guardada exitosamente");
    } catch (err) { alert(err.message); }
  };

  if (loading) return <div style={{textAlign: 'center', marginTop: '50px'}}>Cargando Panel Maestro...</div>;
  if (error) return <div style={{textAlign: 'center', color: 'var(--loss-color)'}}>{error}</div>;

  return (
    <div className="dashboard-container">
      <div className="glass-card" style={{ marginBottom: '30px' }}>
        <h2 style={{color: 'var(--primary)', marginBottom: '20px'}}>Panel de Control Maestro</h2>
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
          <button onClick={() => setActiveTab('reports')} style={{ padding: '8px 16px', borderRadius: '5px', background: activeTab === 'reports' ? 'var(--primary)' : 'transparent', color: activeTab === 'reports' ? '#000' : 'var(--primary)' }}>Reportes Globales</button>
          <button onClick={() => setActiveTab('users')} style={{ padding: '8px 16px', borderRadius: '5px', background: activeTab === 'users' ? 'var(--primary)' : 'transparent', color: activeTab === 'users' ? '#000' : 'var(--primary)' }}>Estudiantes Registrados</button>
          <button onClick={() => setActiveTab('settings')} style={{ padding: '8px 16px', borderRadius: '5px', background: activeTab === 'settings' ? 'var(--primary)' : 'transparent', color: activeTab === 'settings' ? '#000' : 'var(--primary)' }}>Configuración</button>
        </div>

        {activeTab === 'users' && (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Usuario</th><th>Rol</th><th>Fecha de Registro</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td><td>{u.username}</td>
                    <td style={{color: u.role==='admin'?'#f39c12':'#fff'}}>{u.role}</td>
                    <td>{new Date(u.created_at).toLocaleString()}</td>
                    <td>
                      <button onClick={()=>handleToggleRole(u.id)} style={{marginRight:'10px', background: u.role==='admin'?'#444':'#f39c12', color:'#fff', padding:'5px 10px', border:'none', borderRadius:'4px'}}>{u.role==='admin'?'Degradar':'Ascender Admin'}</button>
                      <button onClick={()=>handleDeleteUser(u.id)} style={{background:'var(--loss-color)', color:'#fff', padding:'5px 10px', border:'none', borderRadius:'4px'}}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Usuario</th><th>Exchange</th><th>Trades</th><th>Win Rate</th><th>PnL Total</th><th>Fecha</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} onClick={() => handleRowClick(r.id)} className="hoverable-row" style={{cursor: 'pointer'}}>
                    <td>{r.id}</td><td style={{fontWeight: 'bold', color: 'var(--primary)'}}>{r.username}</td><td>{r.exchange}</td>
                    <td>{r.total_trades}</td><td>{r.win_rate}</td>
                    <td style={{color: parseFloat(r.total_pnl) >= 0 ? 'var(--win-color)' : 'var(--loss-color)'}}>{r.total_pnl}</td>
                    <td>{new Date(r.upload_time).toLocaleString()}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => window.open(`${API_BASE}/api/report/${r.id}/download?token=${token}`, '_blank')} style={{background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem'}}>Descargar CSV/Excel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{marginBottom: '15px'}}>Configuración del Embudo</h3>
            <div className="form-group" style={{marginBottom: '15px'}}>
              <label>Link de Mentoría (Calendly, WhatsApp, etc.):</label>
              <input 
                type="text" 
                value={mentorshipLink} 
                onChange={(e) => setMentorshipLink(e.target.value)} 
                placeholder="https://wa.me/573104036937?text=Hola..." 
                style={{width: '100%', padding: '10px', marginTop: '5px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px'}}
              />
            </div>
            <button onClick={handleSaveSettings} className="submit-btn" style={{width: '100%', padding: '10px'}}>Guardar Configuración</button>
          </div>
        )}
      </div>
      {reportLoading && <div style={{textAlign: 'center', marginTop: '30px'}}>Cargando auditoría profunda...</div>}
      {selectedReport && !reportLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, overflowY: 'auto', padding: '20px' }}>
          <div style={{ background: '#111', padding: '20px', borderRadius: '10px', minHeight: '100%' }}>
            <button onClick={() => setSelectedReport(null)} style={{ background: 'var(--loss-color)', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px', float: 'right' }}>Cerrar Diagnóstico</button>
            <h2 style={{color: '#fff', marginBottom: '10px'}}>Diagnóstico del Estudiante</h2>
            <Dashboard data={{...selectedReport, active_symbol: selectedReport.active_symbol}} onSymbolChange={handleAdminSymbolChange} />
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminPanel;
