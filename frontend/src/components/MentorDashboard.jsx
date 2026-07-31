import React, { useState, useEffect } from 'react';
import API_BASE from '../api';
import { Users, TrendingUp, TrendingDown, Eye, Copy, Settings } from 'lucide-react';

const MentorDashboard = ({ token, onReportSelect }) => {
  const [activeTab, setActiveTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [profile, setProfile] = useState({ invite_code: '', help_link: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const viewStudentReport = async (studentId) => {
    try {
      const response = await fetch(`${API_BASE}/api/mentor/students/${studentId}/reports`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Error cargando reportes');
      
      const data = await response.json();
      if (data.reports && data.reports.length > 0) {
        // Open the most recent report (index 0)
        onReportSelect(data.reports[0].id);
      } else {
        alert('El alumno no tiene ningún reporte subido todavía.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [studentsRes, profileRes] = await Promise.all([
          fetch(`${API_BASE}/api/mentor/students`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_BASE}/api/mentor/profile`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (!studentsRes.ok) throw new Error('Error al cargar la lista de alumnos');
        if (!profileRes.ok) throw new Error('Error al cargar perfil');

        const studentsData = await studentsRes.json();
        const profileData = await profileRes.json();
        
        setStudents(studentsData.students || []);
        setProfile({ invite_code: profileData.invite_code, help_link: profileData.help_link });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const handleSaveProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/mentor/profile`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ help_link: profile.help_link })
      });
      if (!res.ok) throw new Error('Error guardando perfil');
      alert('Configuración guardada exitosamente');
    } catch (e) { alert(e.message); }
  };
  
  const copyInviteCode = () => {
    const link = `${window.location.origin}/?ref=${profile.invite_code}`;
    navigator.clipboard.writeText(link);
    alert('¡Enlace de invitación copiado al portapapeles!');
  };

  if (loading) {
    return <div style={{textAlign: 'center', marginTop: '50px'}}>Cargando academia...</div>;
  }

  if (error) {
    return <div style={{color: 'var(--loss-color)', textAlign: 'center', marginTop: '50px'}}>{error}</div>;
  }

  return (
    <div className="glass-card" style={{ maxWidth: '900px', margin: '40px auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <Users size={28} color="var(--primary)" />
        <h2 style={{ margin: 0, color: 'var(--primary)' }}>Panel de Academia (Mentores)</h2>
      </div>
      
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('students')} style={{ padding: '8px 16px', borderRadius: '5px', background: activeTab === 'students' ? 'var(--primary)' : 'transparent', color: activeTab === 'students' ? '#000' : 'var(--primary)', border: '1px solid var(--primary)' }}>
          Mis Alumnos
        </button>
        <button onClick={() => setActiveTab('config')} style={{ padding: '8px 16px', borderRadius: '5px', background: activeTab === 'config' ? 'var(--primary)' : 'transparent', color: activeTab === 'config' ? '#000' : 'var(--primary)', border: '1px solid var(--primary)' }}>
          Configuración
        </button>
      </div>

      {activeTab === 'students' && (
        <>
          <p style={{ color: '#aaa', marginBottom: '30px' }}>
            Aquí puedes ver el rendimiento de todos los alumnos registrados bajo tu código de invitación.
          </p>

          {students.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
              No tienes alumnos registrados todavía. Comparte tu código de invitación para empezar.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: '#888' }}>
                    <th style={{ padding: '12px' }}>Alumno</th>
                    <th style={{ padding: '12px' }}>Último PNL</th>
                    <th style={{ padding: '12px' }}>Win Rate (Último)</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{student.username}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          color: student.last_pnl > 0 ? 'var(--profit-color)' : student.last_pnl < 0 ? 'var(--loss-color)' : '#aaa',
                          display: 'flex', alignItems: 'center', gap: '5px'
                        }}>
                          {student.last_pnl > 0 ? <TrendingUp size={16} /> : student.last_pnl < 0 ? <TrendingDown size={16} /> : null}
                          {student.last_pnl !== null ? `$${student.last_pnl.toFixed(2)}` : 'Sin datos'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {student.last_win_rate !== null ? `${student.last_win_rate.toFixed(1)}%` : 'Sin datos'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button 
                          className="nav-btn" 
                          style={{ padding: '6px 12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }}
                          onClick={() => viewStudentReport(student.id)}
                        >
                          <Eye size={14} /> Auditar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'config' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '25px', borderRadius: '10px' }}>
          <h3 style={{ marginBottom: '15px', color: 'var(--primary)' }}>Datos de tu Academia</h3>
          
          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', color: '#aaa', marginBottom: '8px' }}>Tu Código de Invitación Oficial:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ background: '#111', padding: '12px 20px', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '2px', border: '1px dashed var(--primary)' }}>
                {profile.invite_code}
              </div>
              <button onClick={copyInviteCode} className="nav-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 15px' }}>
                <Copy size={18} /> Copiar Mensaje
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '10px' }}>
              Tus alumnos deben ingresar este código al momento de registrarse para aparecer en tu panel.
            </p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#aaa', marginBottom: '8px' }}>Link de Soporte/Ayuda para tus alumnos:</label>
            <input 
              type="text" 
              value={profile.help_link} 
              onChange={(e) => setProfile({...profile, help_link: e.target.value})} 
              placeholder="Ej: https://wa.me/573000000000?text=Hola profe..." 
              style={{ width: '100%', padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '1rem' }}
            />
            <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '8px' }}>
              Cuando tus alumnos presionen el botón de "Ayuda", serán dirigidos a este link en lugar del soporte general de Sabueso.
            </p>
          </div>
          
          <button onClick={handleSaveProfile} className="submit-btn" style={{ padding: '10px 25px', fontSize: '1rem' }}>
            Guardar Configuración
          </button>
        </div>
      )}
    </div>
  );
};

export default MentorDashboard;
