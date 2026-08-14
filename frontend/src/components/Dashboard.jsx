import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Brush } from 'recharts';
import { Loader2, Download, Globe, Info, AlertTriangle, Target, TrendingUp, Trophy, Activity, ChevronDown } from 'lucide-react';
import EChartTrade from './EChartTrade';
import html2pdf from 'html2pdf.js';
import API_BASE from '../api';

const STRATEGY_TOOLTIPS = {
  "Reversión a la media (RSI)": "Mide si compraste cuando el activo estaba sobrevendido (RSI bajo) o vendiste cuando estaba sobrecomprado (RSI alto). En el gráfico: Entradas en picos o valles extremos del RSI.",
  "Ruptura de Bollinger": "Mide si operaste una explosión de volatilidad rompiendo las Bandas de Bollinger superior o inferior. En el gráfico: Expansión de las bandas con velas fuertes.",
  "MACD Momentum": "Mide si entraste impulsado por un cruce fuerte o barras de histograma aceleradas en el MACD. En el gráfico: Acompañamiento del indicador de fuerza.",
  "Rebote VWAP": "Mide si tus entradas coinciden con rebotes en el Precio Promedio Ponderado por Volumen (VWAP). En el gráfico: El precio cae al VWAP y rebota a favor de tu trade.",
  "SMC / Liquidación (Rechazo)": "Smart Money Concepts: Mide si entraste tras una 'caza de stops' (mecha larga que limpia liquidez). En el gráfico: Velas con mechas muy largas rechazando una zona antes de tu entrada.",
  "Breakout de Rango (Ruptura)": "Mide si operaste una ruptura después de un periodo de consolidación. En el gráfico: Expansión fuerte de precio y volumen tras un mercado lateral.",
  "Pullback Dinámico a EMAs": "Mide si entraste en un retroceso hacia las Medias Móviles Exponenciales (EMAs) durante una tendencia. En el gráfico: Tendencia clara y el precio retrocede a la EMA 9 o 21 antes de continuar.",
  "Momentum / Volume Spikes": "Mide si entraste acompañado de un pico inusual de volumen. En el gráfico: Barras de volumen inusualmente altas acompañando tu dirección.",
  "Fading (Caza-Reversiones)": "Mide si operaste contra la tendencia intentando atrapar el techo o el suelo exacto. En el gráfico: Entrar corto en velas verdes fuertes o largo en rojas fuertes.",
  "EMA Crossover (9/21) Corto Plazo": "Mide si operaste a favor de un cambio de tendencia rápido impulsado por el cruce de las EMAs 9 y 21.",
  "EMA Crossover (21/50) Medio Plazo": "Mide si entraste apoyado en un cambio estructural intermedio tras el cruce de las EMAs 21 y 50.",
  "EMA Crossover (50/200) Largo Plazo": "Mide si te posicionaste de acuerdo a la tendencia macro, buscando el 'Cruce Dorado' o 'Cruce de la Muerte' de las EMAs 50 y 200."
};

const PATTERN_TOOLTIPS = {
  'Rompimientos': 'Operaciones a favor de la ruptura de un nivel de soporte o resistencia relevante.',
  'Retrocesos a EMAs': 'Entradas buscando continuación de tendencia al rebotar en medias móviles (EMAs).',
  'Picos de Volatilidad': 'Entradas impulsadas por aumentos bruscos de volumen y aceleración del precio (Momentum).',
  'Caza-Reversiones': 'Búsqueda de giros en contra de la tendencia principal en niveles extremos (Fading).',
  'Reversión a la media': 'Entradas basadas en sobrecompra/sobreventa usando osciladores como el RSI.',
  'Rechazo Institucional': 'Entradas en zonas de liquidez o bloques de órdenes (Order Blocks/SMC).',
  'Riesgo de Martingala': 'Comportamiento negativo: Aumentar el lotaje o promediar en pérdidas.',
  'Re-Entradas Perdidas': 'Comportamiento negativo: Reingresar repetitivamente en la misma dirección tras una pérdida (Revenge trading).'
};

const Dashboard = ({ data, onSymbolChange, onTimeRangeChange, onTimeframeChange }) => {
  const [mentorshipLink, setMentorshipLink] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [hoveredStrategy, setHoveredStrategy] = useState(null);
  const [hoveredPattern, setHoveredPattern] = useState(null);
  
  const { exchange, metrics, active_symbol } = data;

  const uniqueSymbols = useMemo(() => {
    if (!data || !data.trades) return [];
    return [...new Set(data.trades.map(t => t.symbol))];
  }, [data]);
  

  const [marketData, setMarketData] = useState(null);
  const [marketDataLoading, setMarketDataLoading] = useState(false);
  const [marketDataError, setMarketDataError] = useState(null);
  const [brushStartIdx, setBrushStartIdx] = useState(0);
  const [brushEndIdx, setBrushEndIdx] = useState(null);
  const [isZoomed, setIsZoomed] = useState(false);
  
  const [tradeTimeframe, setTradeTimeframe] = useState('15m');
  const [activeTrade, setActiveTrade] = useState(null);
  const [tradeChartLoading, setTradeChartLoading] = useState(false);



  
  const handleAnalyzeTrade = async (trade, tf = null) => {
    const activeTf = tf || tradeTimeframe;
    if (tf) setTradeTimeframe(tf);
    if (!trade || !trade.entry_time || trade.entry_time === 'N/A' || trade.exit_time === 'N/A') {
      setMarketDataError("El trade no tiene fechas de entrada y salida válidas para analizar.");
      return;
    }
    setActiveTrade(trade);
    setTradeChartLoading(true);
    setMarketDataError(null);
    setMarketData(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/trade-chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          symbol: trade.symbol,
          entry_time: trade.entry_time,
          exit_time: trade.exit_time,
          entry_price: trade.entry_price && !isNaN(parseFloat(trade.entry_price)) ? parseFloat(trade.entry_price) : null,
          exit_price: trade.exit_price && !isNaN(parseFloat(trade.exit_price)) ? parseFloat(trade.exit_price) : null,
          side: trade.side,
          reported_pnl: parseFloat(trade.reported_pnl),
          timeframe: activeTf
        })
      });
      const resData = await response.json();
      if (resData.success) {
        setMarketData(resData.tv_data);
      } else {
        setMarketDataError(resData.message || "Error cargando gráfico de la operación.");
      }
    } catch (err) {
      setMarketDataError("Fallo de red al solicitar gráfico de operación.");
    } finally {
      setTradeChartLoading(false);
    }
  };
  
  const brushTimeoutRef = useRef(null);

  // Derive display data to force Recharts to update when brush changes
  // and pre-calculate the normalized PNL so Tooltips work flawlessly.
  const displayEquityCurve = useMemo(() => {
    if (!metrics || !metrics.equity_curve) return [];
    
    const startAmt = metrics.equity_curve[brushStartIdx] 
      ? metrics.equity_curve[brushStartIdx].cumulative_pnl_amt 
      : 0;
      
    return metrics.equity_curve.map(point => ({
      ...point,
      normalized_pnl_amt: point.cumulative_pnl_amt - startAmt
    }));
  }, [metrics?.equity_curve, brushStartIdx]);

  useEffect(() => {
    if (active_symbol) {
      // En lugar de cargar el chart global, limpia el modal de trade
      setActiveTrade(null);
      setMarketData(null);
      setMarketDataError(null);
      setMarketDataLoading(false);
    }
  }, [active_symbol]);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(d => setMentorshipLink(d.mentorship_link || ''))
      .catch(err => console.error(err));
  }, []);
  
  const handleExportPDF = async () => {
    setIsExporting(true);

    // 1. Inyectar estilos sólidos para el PDF (resuelve el problema de fondos blancos)
    //    html2canvas no puede procesar backdrop-filter ni CSS variables complejas.
    const pdfStyle = document.createElement('style');
    pdfStyle.id = 'pdf-dark-override';
    pdfStyle.textContent = `
      #dashboard-export-area,
      #dashboard-export-area * {
        --bg-color: #09090b !important;
        --card-bg: #18181b !important;
        --card-hover-bg: #27272a !important;
        --border-color: rgba(255,255,255,0.1) !important;
        --text-primary: #f4f4f5 !important;
        --text-secondary: #a1a1aa !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      #dashboard-export-area .glass-card {
        background: #18181b !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
      }
      #dashboard-export-area body,
      #dashboard-export-area .app-wrapper {
        background-color: #09090b !important;
      }
    `;
    document.head.appendChild(pdfStyle);

    // 2. Pausa para que React renderice los overrides y la marca de agua
    await new Promise(resolve => setTimeout(resolve, 200));

    const element = document.getElementById('dashboard-export-area');

    const opt = {
      margin:      [12, 12, 12, 12],
      filename:    `sabueso_reporte_${data.exchange}_${new Date().toISOString().split('T')[0]}.pdf`,
      image:       { type: 'jpeg', quality: 0.97 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#09090b',  // Fondo del canvas en caso de transparencia residual
        windowWidth: element.scrollWidth,
        logging: false,
      },
      jsPDF: { unit: 'mm', format: 'a3', orientation: 'portrait' }
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('Error al exportar a PDF:', err);
    } finally {
      // 3. Limpiar los estilos inyectados para restaurar la UI normal
      const injected = document.getElementById('pdf-dark-override');
      if (injected) injected.remove();
      setIsExporting(false);
    }
  };
  
  if (!data) return null;
  // La desestructuración se movió arriba
  if (!metrics || Object.keys(metrics).length === 0) {
    return <div className="glass-card" style={{ textAlign: 'center', marginTop: '30px' }}><h3 style={{ color: 'var(--loss-color)' }}>Datos Insuficientes</h3></div>;
  }
  
  const winRateNum = parseFloat(metrics.win_rate || "0");
  const winRateData = [{ name: 'Win', value: winRateNum }, { name: 'Loss', value: 100 - winRateNum }];
  
  const longMatch = (metrics.long_preference || "").match(/([\d.]+)%\sLong/i);
  const shortMatch = (metrics.long_preference || "").match(/([\d.]+)%\sShort/i);
  const dirData = [{ name: 'Long', value: longMatch ? parseFloat(longMatch[1]) : 50 }, { name: 'Short', value: shortMatch ? parseFloat(shortMatch[1]) : 50 }];
  
  const COLORS = ['var(--win-color)', 'var(--loss-color)'];
  const DIR_COLORS = ['#3498db', '#e74c3c'];

  // AI Diagnosis Logic
  let diagnosisTitle = "Diagnóstico Avanzado";
  let diagnosisText = "Selecciona un par o revisa tu historial general para un diagnóstico.";
  let topStrategy = "";
  let topStrategyScore = 0;

  if (metrics.strategies && Object.keys(metrics.strategies).length > 0) {
    const sortedStrats = Object.entries(metrics.strategies).sort((a,b) => b[1] - a[1]);
    if (sortedStrats.length > 0) {
      topStrategy = sortedStrats[0][0];
      topStrategyScore = sortedStrats[0][1];
    }
  }

  if (metrics.total_trades > 0) {
    const backendStyle = metrics.trading_style || "Trader de Frecuencia Media";
    const adviceList = metrics.advice || [];
    
    let effectiveness = `Tuviste una efectividad del ${metrics.win_rate} con un Riesgo/Beneficio de ${metrics.risk_reward_ratio}.`;
    
    diagnosisText = (
      <>
        <p>Tu perfil se alinea con el de un <strong>{backendStyle}</strong>.</p>
        <p>{effectiveness}</p>
        {adviceList.map((adv, idx) => (
          <p key={idx}>{adv}</p>
        ))}
        {topStrategy && (
          <p>Estrategia dominante sugerida por la IA: <strong>{topStrategy} ({topStrategyScore}%)</strong>.</p>
        )}
      </>
    );
  }

  const renderTable = (trades, title, icon) => (
    <div className="glass-card table-container" style={{flex: 1, minWidth: '300px'}}>
      <h3 style={{marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px'}}>{icon} {title}</h3>
      {trades && trades.length > 0 ? (
        <table>
          <thead><tr><th>Fecha</th><th>Par</th><th>Lado</th><th>PNL</th></tr></thead>
          <tbody>
            {trades.map((t, idx) => {
              const pnlVal = parseFloat(t.reported_pnl);
              const pnlClass = pnlVal >= 0 ? 'text-win' : 'text-loss';
              return (
                <tr key={idx} className="hoverable-row">
                  <td className="text-secondary">{t.exit_time !== 'N/A' ? t.exit_time : '-'}</td>
                  <td style={{fontWeight: '600'}}>{t.symbol}</td>
                  <td>{t.side}</td>
                  <td className={pnlClass} style={{fontWeight: 'bold'}}>
                    {pnlVal >= 0 ? '+' : ''}{pnlVal.toFixed(2)} 
                    <span style={{fontSize: '0.75rem', opacity: 0.8, marginLeft: '6px', textShadow: 'none'}}>
                      ({parseFloat(t.true_pnl_pct) > 0 ? '+' : ''}{parseFloat(t.true_pnl_pct).toFixed(2)}%)
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : <p className="text-secondary" style={{fontSize: '0.9rem'}}>No hay datos disponibles.</p>}
    </div>
  );

  return (
    <div className="dashboard-container" id="dashboard-export-area" style={{position: 'relative'}}>
      {isExporting && <div className="watermark-pdf">Generado por Sabueso</div>}
      {/* HEADER SECTION */}
      <div className="glass-card" style={{ marginBottom: '30px', textAlign: 'center', padding: '40px 20px', position: 'relative' }}>
        {!isExporting && (
          <button 
            onClick={handleExportPDF} 
            className="nav-btn" 
            style={{position: 'absolute', right: '20px', top: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}
            disabled={isExporting}
          >
            <Download size={16} /> Exportar a PDF
          </button>
        )}
        <h2 style={{fontSize: '2rem', marginBottom: '24px'}}>Análisis de Historial: <span style={{color: 'var(--text-primary)', fontWeight: '800'}}>{exchange}</span></h2>
        {metrics.available_symbols && metrics.available_symbols.length > 0 && (
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
            <button onClick={() => onSymbolChange(null)} className="nav-btn" style={!active_symbol ? {background: 'var(--primary)', color: '#000', borderColor: 'var(--primary)', boxShadow: '0 0 15px var(--primary-glow)', display: 'flex', alignItems: 'center', gap: '6px'} : {display: 'flex', alignItems: 'center', gap: '6px'}}><Globe size={14} /> Global</button>
            {metrics.available_symbols.map(s => (
              <button key={s} onClick={() => onSymbolChange(s)} className="nav-btn" style={active_symbol === s ? {background: 'var(--primary)', color: '#000', borderColor: 'var(--primary)', boxShadow: '0 0 15px var(--primary-glow)'} : {}}>{s}</button>
            ))}
          </div>
        )}
        
        {active_symbol && onTimeframeChange && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{color: 'var(--text-secondary)', fontSize: '0.9rem', marginRight: '8px'}}>Temporalidad:</span>
            {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
              <button 
                key={tf} 
                onClick={() => onTimeframeChange(tf)} 
                className="nav-btn" 
                style={{
                  padding: '6px 12px', 
                  fontSize: '0.85rem',
                  ...(metrics.analyzed_timeframe === tf 
                    ? {background: 'var(--primary)', color: '#000', borderColor: 'var(--primary)'} 
                    : {})
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        )}
      </div>



      {/* METRICS GRID (4 COLUMNS) */}
      <div className="dashboard-grid" style={{ marginBottom: '30px' }}>
        {/* WIN RATE */}
        <div className="glass-card metric-item" style={{display: 'flex', flexDirection: 'column'}}>
          <h4>Win Rate</h4>
          <div style={{position: 'relative', width: '100%', height: '140px'}}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={winRateData} cx="50%" cy="50%" innerRadius={45} outerRadius={60} dataKey="value" stroke="none">
                  {winRateData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.3rem', color: 'var(--text-color)'}}>
              {metrics.win_rate}
            </div>
          </div>
          <div className="metric-subtitle">De {metrics.total_trades} operaciones</div>
        </div>

        {/* RISK / REWARD */}
        <div className="glass-card metric-item" style={{justifyContent: 'center'}}>
          <h4>Riesgo / Beneficio</h4>
          <div className="metric-value">{metrics.risk_reward_ratio}</div>
          <div className="metric-subtitle" style={{marginTop: '10px'}}>
            <span className="text-win">{metrics.avg_win_pct} (${metrics.avg_win_amt_usd})</span> vs 
            <span className="text-loss"> {metrics.avg_loss_pct} (${metrics.avg_loss_amt_usd})</span>
          </div>
          <div className="metric-subtitle" style={{marginTop: '10px', fontWeight: 'bold', color: 'var(--text-primary)'}}>Total PNL: <span className={parseFloat(metrics.total_pnl_usd) >= 0 ? 'text-win' : 'text-loss'}>${metrics.total_pnl_usd}</span></div>
          {metrics.fees_included ? (
            <div className="metric-subtitle" style={{marginTop: '5px', fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
              Comisiones (Fees): <span className="text-loss">-${Math.abs(parseFloat(metrics.total_fees_usd || 0)).toFixed(2)}</span>
            </div>
          ) : (
            <div className="metric-subtitle" style={{marginTop: '5px', fontSize: '0.75rem', color: 'var(--loss-color)', fontStyle: 'italic'}}>
              * PnL Bruto (no incluye comisiones).
            </div>
          )}
        </div>

        {/* DIRECCIÓN */}
        <div className="glass-card metric-item">
          <h4>Dirección de Operativa</h4>
          <div style={{position: 'relative', width: '100%', height: '140px'}}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dirData} cx="50%" cy="50%" innerRadius={45} outerRadius={60} dataKey="value" stroke="none">
                  {dirData.map((e, i) => <Cell key={i} fill={DIR_COLORS[i % DIR_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="metric-subtitle">{metrics.long_preference}</div>
        </div>

        {/* PACIENCIA */}
        <div className="glass-card metric-item" style={{justifyContent: 'center'}}>
          <h4>Paciencia Promedio</h4>
          <div className="metric-value" style={{fontSize: '1.5rem'}}>{metrics.avg_duration !== 'N/A' ? metrics.avg_duration : '-'}</div>
        </div>
      </div>

      
      

{/* SPLIT SCREEN GRID */}
<div className="dashboard-split-screen" style={{ display: 'grid', gap: '25px', marginBottom: '30px' }}>
  
  <div className="equity-column" style={{ minWidth: 0 }}>
    {/* EQUITY CURVE */}
      {metrics.equity_curve && metrics.equity_curve.length > 0 && (
        <div className="glass-card" style={{ height: '100%', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px'}}>
            <div>
              <h3 style={{marginBottom: '4px'}}>Curva de Consistencia (PNL USD)</h3>
              <p className="metric-subtitle" style={{textAlign: 'left', margin: 0}}>Usa el slider inferior para hacer zoom en el período que deseas analizar</p>
            </div>
            {isZoomed && (
              <button 
                onClick={() => {
                  setIsZoomed(false);
                  setBrushStartIdx(0);
                  setBrushEndIdx(null);
                  if (onTimeRangeChange) {
                    if (brushTimeoutRef.current) clearTimeout(brushTimeoutRef.current);
                    onTimeRangeChange(null, null);
                  }
                }}
                className="nav-btn" 
                style={{fontSize: '0.8rem', padding: '6px 12px', background: 'var(--card-hover-bg)'}}
              >
                Restablecer Zoom
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={displayEquityCurve} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="exit_time" stroke="#52525b" tick={{fontSize: 10, fill: '#71717a'}} tickMargin={10} />
              <YAxis stroke="#52525b" tick={{fontSize: 10, fill: '#71717a'}} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f4f4f5', fontSize: '0.85rem' }}
                labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="normalized_pnl_amt"
                name="PNL USD (Zona)"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#pnlGradient)"
                dot={false}
                activeDot={{ r: 5, fill: '#10b981', stroke: '#09090b', strokeWidth: 2 }}
              />
              <Brush
                dataKey="exit_time"
                height={24}
                stroke="rgba(255,255,255,0.1)"
                fill="rgba(24,24,27,0.8)"
                travellerWidth={8}
                tickFormatter={() => ''}
                style={{ marginTop: '10px' }}
                startIndex={brushStartIdx}
                endIndex={brushEndIdx !== null ? brushEndIdx : (metrics.equity_curve ? metrics.equity_curve.length - 1 : 0)}
                onChange={(range) => {
                  if (range && metrics.equity_curve) {
                    setBrushStartIdx(range.startIndex);
                    setBrushEndIdx(range.endIndex);
                    
                    const isFullRange = range.startIndex === 0 && range.endIndex === metrics.equity_curve.length - 1;
                    
                    if (onTimeRangeChange && !isFullRange) {
                      setIsZoomed(true);
                      if (brushTimeoutRef.current) {
                        clearTimeout(brushTimeoutRef.current);
                      }
                      brushTimeoutRef.current = setTimeout(() => {
                        const start = metrics.equity_curve[range.startIndex];
                        const end = metrics.equity_curve[range.endIndex];
                        if (start && end) {
                          onTimeRangeChange(start.exit_time, end.exit_time);
                        }
                      }, 800); // 800ms debounce
                    }
                  }
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
  )}
  </div>

  <div className="predictive-column" style={{ minWidth: 0, position: 'relative' }}>
    <div className="glass-card" style={{ height: '600px', display: 'flex', flexDirection: 'column', padding: '24px', position: 'relative' }}>
      <h3 style={{marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px'}}>
        <Activity size={20} color="var(--primary)" /> Análisis Cuantitativo
      </h3>
      <p className="metric-subtitle" style={{textAlign: 'left', marginBottom: '16px'}}>Patrones ordenados por frecuencia de aparición</p>
      
      



      {/* FLOATING CENTER TOOLTIP */}
      {(hoveredStrategy || hoveredPattern) && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '85%',
          background: 'rgba(20,20,22,0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--primary)',
          borderRadius: '12px',
          padding: '25px',
          zIndex: 1000,
          boxShadow: '0 10px 40px rgba(0,0,0,0.9), 0 0 20px rgba(16,185,129,0.15)',
          color: '#f4f4f5',
          textAlign: 'center',
          pointerEvents: 'none',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <Info size={28} color="var(--primary)" style={{marginBottom: '12px'}} />
          <h4 style={{marginBottom: '10px', color: 'var(--primary)', fontSize: '1.1rem'}}>{hoveredStrategy || hoveredPattern}</h4>
          <p style={{lineHeight: '1.5', fontSize: '0.9rem', margin: 0}}>
            {(hoveredStrategy && STRATEGY_TOOLTIPS[hoveredStrategy]) || 
             (hoveredPattern && PATTERN_TOOLTIPS[hoveredPattern])}
          </p>
        </div>
      )}

<div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px', position: 'relative' }} className="custom-scrollbar" id="quant-scroll-area">
        
        {metrics.strategies && Object.keys(metrics.strategies).length > 0 && (
          <div>
            <p className="metric-subtitle" style={{textAlign: 'left', marginBottom: '16px', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px'}}>Correlación de Estrategias</p>
            <div style={{display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '30px'}}>
              {Object.entries(metrics.strategies).sort((a,b)=>b[1]-a[1]).map(([strat, score]) => (
                <div key={strat}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '6px'}}>
                    <span style={{fontSize: '0.88rem', fontWeight: '500', position: 'relative'}}>
                      {strat}
                      <span 
                        style={{marginLeft: '6px', cursor: 'help'}}
                        onMouseEnter={() => setHoveredStrategy(strat)}
                        onMouseLeave={() => setHoveredStrategy(null)}
                      >
                        <Info size={14} color="#a1a1aa" />
                        
                      </span>
                    </span>
                    <span style={{fontWeight: '700', color: score >= 60 ? 'var(--primary)' : score >= 40 ? '#f59e0b' : 'var(--loss-color)', fontSize: '0.9rem'}}>{score}%</span>
                  </div>
                  <div className="liquid-progress-bg" style={{height: '6px'}}>
                    <div className="liquid-progress-fill" style={{
                      width: `${score}%`,
                      background: score >= 60
                        ? 'linear-gradient(90deg, #059669, #10b981)'
                        : score >= 40
                        ? 'linear-gradient(90deg, #d97706, #f59e0b)'
                        : 'linear-gradient(90deg, #b91c1c, #ef4444)',
                      boxShadow: score >= 60
                        ? '0 0 15px rgba(16,185,129,0.5)'
                        : score >= 40
                        ? '0 0 15px rgba(245,158,11,0.5)'
                        : '0 0 15px rgba(239,68,68,0.5)'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '28px'}}>
            <p className="metric-subtitle" style={{textAlign: 'left', marginBottom: '6px', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px'}}>Frecuencia de Patrones</p>
          {[
            { label: 'Rompimientos', sublabel: 'Breakouts', value: metrics.breakout_hits || 0, isPct: true, max: 100, color: 'var(--primary)', glow: 'var(--primary-glow)' },
            { label: 'Retrocesos a EMAs', sublabel: 'Pullbacks', value: metrics.pullback_hits || 0, isPct: true, max: 100, color: '#60a5fa', glow: 'rgba(96,165,250,0.3)' },
            { label: 'Picos de Volatilidad', sublabel: 'Momentum', value: metrics.vol_spike_hits || 0, isPct: true, max: 100, color: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
            { label: 'Caza-Reversiones', sublabel: 'Fading', value: metrics.fading_hits || 0, isPct: true, max: 100, color: '#ec4899', glow: 'rgba(236,72,153,0.3)' },
            { label: 'Reversión a la media', sublabel: 'RSI', value: metrics.rsi_hits || 0, isPct: true, max: 100, color: '#a855f7', glow: 'rgba(168,85,247,0.3)' },
            { label: 'Rechazo Institucional', sublabel: 'SMC', value: metrics.smc_hits || 0, isPct: true, max: 100, color: '#14b8a6', glow: 'rgba(20,184,166,0.3)' },
            { label: 'Riesgo de Martingala', sublabel: 'Comportamiento', value: metrics.martingale_hits || 0, isPct: false, max: Math.max(metrics.martingale_hits || 0, 5), color: 'var(--loss-color)', glow: 'var(--loss-glow)' },
            { label: 'Re-Entradas Perdidas', sublabel: 'Comportamiento', value: metrics.repo_hits || 0, isPct: false, max: Math.max(metrics.repo_hits || 0, 5), color: '#f97316', glow: 'rgba(249,115,22,0.3)' },
          ].map(item => {
            return { ...item, pct: item.max > 0 ? Math.round((item.value / item.max) * 100) : 0 };
          }).sort((a,b) => b.pct - a.pct).map(({ label, sublabel, value, isPct, pct, color, glow }) => {
            return (
              <div key={label}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '7px'}}>
                  <span style={{fontSize: '0.88rem', fontWeight: '600', position: 'relative', display: 'flex', alignItems: 'center'}}>
                    {label} <span className="text-secondary" style={{fontWeight: 400, fontSize: '0.75rem', marginLeft: '5px'}}>({sublabel})</span>
                    <span 
                      style={{marginLeft: '6px', cursor: 'help', display: 'flex'}}
                      onMouseEnter={() => setHoveredPattern(label)}
                      onMouseLeave={() => setHoveredPattern(null)}
                    >
                      <Info size={14} color="#a1a1aa" />
                      
                    </span>
                  </span>
                  <span style={{fontWeight: '700', fontSize: '0.95rem', color}}>
                    {value}{isPct ? '%' : ''} <span className="text-secondary" style={{fontWeight: 400, fontSize: '0.8rem'}}>{isPct ? 'frecuencia' : 'veces'}</span>
                  </span>
                </div>
                <div className="liquid-progress-bg">
                  <div className="liquid-progress-fill" style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color}aa, ${color})`,
                    boxShadow: `0 0 15px ${glow}`
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        </div>
        )}
      </div>

      <div style={{
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        height: '60px',
        background: 'linear-gradient(transparent, var(--card-bg) 80%)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: '15px',
        pointerEvents: 'none',
        borderRadius: '0 0 20px 20px'
      }}>
        <div style={{
          animation: 'bounce 2s infinite',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          color: 'var(--primary)',
          opacity: 0.8
        }}>
          <span style={{fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: '900'}}>Ver más</span>
          <ChevronDown size={20} />
        </div>
      </div>

    </div>
  </div>
</div>

{/* RESUMEN POR PAR (Solo en vista global) */}
{!active_symbol && metrics.symbol_performance && metrics.symbol_performance.length > 0 && (
  <div className="glass-card" style={{ marginBottom: '30px' }}>
    <h3 style={{marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
      <Target size={20} color="var(--primary)" /> Rendimiento por Par Operado
    </h3>
    <div style={{ maxHeight: '350px', overflowY: 'auto' }} className="custom-scrollbar">
      <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
          <tr>
            <th style={{padding: '10px 5px', color: 'var(--text-secondary)'}}>Par</th>
            <th style={{padding: '10px 5px', color: 'var(--text-secondary)'}}>Total Operaciones</th>
            <th style={{padding: '10px 5px', color: 'var(--text-secondary)'}}>Win Rate</th>
            <th style={{padding: '10px 5px', color: 'var(--text-secondary)'}}>PNL (USD)</th>
          </tr>
        </thead>
        <tbody>
          {metrics.symbol_performance.map((perf, idx) => {
            const pnlVal = parseFloat(perf.pnl);
            const winRate = parseFloat(perf.win_rate_num);
            return (
              <tr 
                key={idx} 
                className="hoverable-row" 
                style={{borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer'}}
                onClick={() => onSymbolChange(perf.symbol)}
                title={`Ver historial de ${perf.symbol}`}
              >
                <td style={{padding: '10px 5px', fontWeight: 'bold'}}>{perf.symbol}</td>
                <td style={{padding: '10px 5px'}}>{perf.total_trades}</td>
                <td style={{padding: '10px 5px'}}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '200px' }}>
                    <span style={{ minWidth: '45px', fontWeight: 'bold', color: winRate >= 50 ? 'var(--win-color)' : 'var(--loss-color)' }}>{perf.win_rate}</span>
                    <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${winRate}%`, height: '100%', background: winRate >= 50 ? 'var(--win-color)' : 'var(--loss-color)' }}></div>
                    </div>
                  </div>
                </td>
                <td className={pnlVal >= 0 ? 'text-win' : 'text-loss'} style={{padding: '10px 5px', fontWeight: 'bold'}}>
                  {pnlVal >= 0 ? '+' : ''}{pnlVal.toFixed(2)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </div>
)}

{/* TRADES DETALLADOS Y GRÁFICO */}
      {active_symbol && metrics.all_trades && (
        <div className="glass-card" style={{ marginBottom: '30px' }}>
          <h3 style={{marginBottom: '20px'}}>Historial de Operaciones: {active_symbol}</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                <tr>
                  <th style={{padding: '10px 5px'}}>Fecha Entrada</th>
                  <th style={{padding: '10px 5px'}}>Fecha Salida</th>
                  <th style={{padding: '10px 5px'}}>Lado</th>
                  <th style={{padding: '10px 5px'}}>PNL</th>
                  <th style={{padding: '10px 5px'}}>Duración</th>
                  <th style={{padding: '10px 5px'}}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {metrics.all_trades.filter(t => t.symbol === active_symbol).map((t, idx) => {
                  const pnlVal = parseFloat(t.reported_pnl);
                  return (
                    <tr key={idx} className="hoverable-row" style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                      <td className="text-secondary" style={{padding: '10px 5px'}}>{t.entry_time}</td>
                      <td className="text-secondary" style={{padding: '10px 5px'}}>{t.exit_time !== 'N/A' ? t.exit_time : '-'}</td>
                      <td style={{padding: '10px 5px', fontWeight: 'bold'}}>{t.side}</td>
                      <td className={pnlVal >= 0 ? 'text-win' : 'text-loss'} style={{fontWeight: 'bold', padding: '10px 5px'}}>
                        {pnlVal >= 0 ? '+' : ''}{pnlVal.toFixed(2)}
                      </td>
                      <td className="text-secondary" style={{padding: '10px 5px'}}>{t.duration}</td>
                      <td style={{padding: '10px 5px'}}>
                        <button 
                          onClick={() => handleAnalyzeTrade(t)}
                          className="upload-btn"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', opacity: activeTrade === t ? 0.5 : 1 }}
                          disabled={tradeChartLoading && activeTrade === t}
                        >
                          {tradeChartLoading && activeTrade === t ? 'Cargando...' : 'Ver Gráfico'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {/* TRADE CHART VIEWER */}
          {activeTrade && (
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary)' }}>Análisis Visual: Operación {activeTrade.side} ({activeTrade.entry_time})</h4>
                  <select
                    value={tradeTimeframe}
                    onChange={(e) => handleAnalyzeTrade(activeTrade, e.target.value)}
                    style={{ background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '4px', padding: '4px 8px', fontSize: '0.85rem' }}
                  >
                    <option value="1m">1m</option>
                    <option value="5m">5m</option>
                    <option value="15m">15m</option>
                    <option value="1h">1h</option>
                    <option value="4h">4h</option>
                    <option value="1d">1d</option>
                  </select>
                </div>
                <button onClick={() => setActiveTrade(null)} className="nav-btn" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Cerrar</button>
              </div>
              
              {tradeChartLoading && <div style={{padding: '40px', textAlign: 'center', color: '#a1a1aa'}}>Obteniendo velas del mercado para esta operación... <Loader2 size={16} style={{display: 'inline-block', verticalAlign: 'middle', marginLeft: '8px'}} className="spin" /></div>}
              {marketDataError && <div style={{padding: '40px', textAlign: 'center', color: '#ef4444'}}><AlertTriangle size={16} style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '8px'}} /> {marketDataError}</div>}
              
              {!tradeChartLoading && !marketDataError && marketData && marketData.ohlcv && marketData.ohlcv.length > 0 && (
                <div className="w-full bg-[#1A1A1A] rounded-xl overflow-hidden shadow-2xl relative" style={{ height: '70vh' }}>
                  <EChartTrade marketData={marketData} topStrategies={metrics.strategies} />
                </div>
              )}
            </div>
          )}



        </div>
      )}

      {/* TABLES: TOP WINNERS & LOSERS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '30px' }}>
        {renderTable(metrics.top_winners, "Top 10 Trades Ganadores", <Trophy size={16} color="var(--primary)" />)}
        {renderTable(metrics.top_losers, "Top 10 Peores Trades", <AlertTriangle size={16} color="var(--loss-color)" />)}
      </div>

      {/* ADVANCED DIAGNOSTICS */}
      <div className="glass-card" style={{ padding: '30px', borderLeft: '4px solid var(--primary)' }}>
        <h2 style={{marginBottom: '20px'}}>Diagnóstico Avanzado</h2>
        <div style={{fontSize: '1.05rem', lineHeight: '1.8', color: 'var(--text-color)'}}>
          {diagnosisText}
        </div>
        
        {mentorshipLink && (
          <div style={{marginTop: '30px', textAlign: 'left'}}>
            <a href={mentorshipLink} target="_blank" rel="noopener noreferrer" style={{textDecoration: 'none'}}>
              <button className="upload-btn" style={{padding: '12px 30px', fontSize: '1rem'}}>
                Solicitar Mentoría Personalizada
              </button>
            </a>
          </div>
        )}
      </div>

    </div>
  );
};
export default Dashboard;
