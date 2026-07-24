import React from 'react';
const TVChart = ({ chartData }) => {
  return (
    <div className="glass-card" style={{marginTop: '30px'}}>
      <h3 style={{marginBottom: '20px', color: 'var(--primary)'}}>Simulación Visual (Señales de Trading)</h3>
      <p style={{color: '#aaa', fontSize: '0.9rem'}}>Las señales se extraen matemáticamente. Integración nativa TradingView próxima.</p>
      <div style={{background: '#131722', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '5px', border: '1px solid #333'}}>
        <span style={{color: '#555'}}>[Gráfico de Precios Interactivo - En Desarrollo]</span>
      </div>
    </div>
  );
};
export default TVChart;
