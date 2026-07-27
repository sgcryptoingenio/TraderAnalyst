import React, { useState, useEffect } from 'react';
import API_BASE from '../api';
import { Users, TrendingUp, TrendingDown, Eye } from 'lucide-react';

const MentorDashboard = ({ token, onReportSelect }) => {
  const [students, setStudents] = useState([]);
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
    const fetchStudents = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/mentor/students`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Error al cargar la lista de alumnos');
        }

        const data = await response.json();
        setStudents(data.students || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [token]);

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
    </div>
  );
};

export default MentorDashboard;
