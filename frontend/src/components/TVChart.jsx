import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';

const TVChart = ({ marketData }) => {
  const mainChartContainerRef = useRef(null);
  const rsiChartContainerRef = useRef(null);
  const macdChartContainerRef = useRef(null);

  const mainChartRef = useRef(null);
  const rsiChartRef = useRef(null);
  const macdChartRef = useRef(null);

  useEffect(() => {
    console.log("[TVChart] Iniciando useEffect con marketData:", marketData);
    if (!marketData) {
      console.log("[TVChart] No hay marketData, abortando.");
      return;
    }
    
    // Check if marketData is an array (old format) or object (new format {ohlcv, markers})
    const ohlcvList = Array.isArray(marketData) ? marketData : (marketData.ohlcv || []);
    const markerList = Array.isArray(marketData) ? [] : (marketData.markers || []);
    
    console.log("[TVChart] Extraido ohlcvList len:", ohlcvList.length, "markerList len:", markerList.length);

    if (ohlcvList.length === 0) {
      console.log("[TVChart] ohlcvList está vacío, abortando.");
      return;
    }

    let mainChart, rsiChart, macdChart, resizeObserver;

    try {
      console.log("[TVChart] Creando opciones de gráficos...");
      // Dark Mode Glassmorphism Theme Options
      const chartOptions = {
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#A0AEC0' },
        grid: { vertLines: { color: 'rgba(255, 255, 255, 0.05)' }, horzLines: { color: 'rgba(255, 255, 255, 0.05)' } },
        crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(160, 174, 192, 0.5)', width: 1, style: 1 }, horzLine: { color: 'rgba(160, 174, 192, 0.5)', width: 1, style: 1 } },
        timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)', timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
      };

      console.log("[TVChart] Inicializando mainChart...");
      mainChart = createChart(mainChartContainerRef.current, { ...chartOptions, height: 350, timeScale: { ...chartOptions.timeScale, visible: false } });
      const candleSeries = mainChart.addSeries(CandlestickSeries, { upColor: '#10b981', downColor: '#ef4444', borderDownColor: '#ef4444', borderUpColor: '#10b981', wickDownColor: '#ef4444', wickUpColor: '#10b981' });
      const ema9Series = mainChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1.5, title: 'EMA 9' });
      const ema21Series = mainChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1.5, title: 'EMA 21' });

      console.log("[TVChart] Inicializando rsiChart...");
      rsiChart = createChart(rsiChartContainerRef.current, { ...chartOptions, height: 150, timeScale: { ...chartOptions.timeScale, visible: false } });
      const rsiSeries = rsiChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1.5, title: 'RSI 14' });
      rsiSeries.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.5)', lineWidth: 1, lineStyle: 2, title: 'OB' });
      rsiSeries.createPriceLine({ price: 30, color: 'rgba(16, 185, 129, 0.5)', lineWidth: 1, lineStyle: 2, title: 'OS' });

      console.log("[TVChart] Inicializando macdChart...");
      macdChart = createChart(macdChartContainerRef.current, { ...chartOptions, height: 150, timeScale: { ...chartOptions.timeScale, visible: true } });
      const macdSeries = macdChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1.5, title: 'MACD' });
      const macdSignalSeries = macdChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1.5, title: 'Signal' });
      const macdHistSeries = macdChart.addSeries(HistogramSeries, { color: '#22c55e', priceFormat: { type: 'volume' }, priceScaleId: '' });

      console.log("[TVChart] Parseando datos...");
      const cData = []; const ema9Data = []; const ema21Data = []; const rsiData = []; const macdData = []; const macdSignalData = []; const macdHistData = [];
      const seenChartTimes = new Set();

      ohlcvList.forEach(d => {
        if (!d.time || d.open === null) return;
        const t = d.time; 
        if (seenChartTimes.has(t)) return;
        seenChartTimes.add(t);
        
        cData.push({ time: t, open: d.open, high: d.high, low: d.low, close: d.close });
        if (d.EMA_9 != null) ema9Data.push({ time: t, value: d.EMA_9 });
        if (d.EMA_21 != null) ema21Data.push({ time: t, value: d.EMA_21 });
        if (d.RSI_14 != null) rsiData.push({ time: t, value: d.RSI_14 });
        if (d.MACD != null) macdData.push({ time: t, value: d.MACD });
        if (d.MACD_Signal != null) macdSignalData.push({ time: t, value: d.MACD_Signal });
        if (d.MACD_Hist != null) {
          macdHistData.push({ time: t, value: d.MACD_Hist, color: d.MACD_Hist > 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)' });
        }
      });

      console.log("[TVChart] Asignando datos a las series. cData len:", cData.length);
      
      cData.sort((a, b) => a.time - b.time);
      ema9Data.sort((a, b) => a.time - b.time);
      ema21Data.sort((a, b) => a.time - b.time);
      rsiData.sort((a, b) => a.time - b.time);
      macdData.sort((a, b) => a.time - b.time);
      macdSignalData.sort((a, b) => a.time - b.time);
      macdHistData.sort((a, b) => a.time - b.time);

      candleSeries.setData(cData);
      ema9Series.setData(ema9Data);
      ema21Series.setData(ema21Data);
      rsiSeries.setData(rsiData);
      macdSeries.setData(macdData);
      macdSignalSeries.setData(macdSignalData);
      macdHistSeries.setData(macdHistData);
      
      console.log("[TVChart] Procesando marcadores...");
      if (markerList.length > 0) {
        const uniqueMarkers = [];
        const seenTimes = new Set();
        
        // Lightweight charts REQUIRES the marker time to exactly match a candle time.
        // Since trades happen at random seconds, we snap them to the closest previous candle.
        const cTimes = cData.map(c => c.time);
        
        markerList.forEach(m => {
          if (m.time < cTimes[0] || m.time > cTimes[cTimes.length - 1] + 86400) {
              // Trade is outside the available OHLCV data range, ignore to prevent crashes
              return; 
          }
          
          let snappedTime = m.time;
          // Find closest preceding candle
          for (let i = cTimes.length - 1; i >= 0; i--) {
            if (cTimes[i] <= m.time) {
              snappedTime = cTimes[i];
              break;
            }
          }
          
          if (!seenTimes.has(snappedTime)) {
            seenTimes.add(snappedTime);
            uniqueMarkers.push({ ...m, time: snappedTime });
          } else {
            // Aggregate if same time
            const existing = uniqueMarkers.find(x => x.time === snappedTime);
            if (existing) {
              existing.text += ` & ${m.text.replace('Entry ', '')}`;
            }
          }
        });
        
        uniqueMarkers.sort((a, b) => a.time - b.time);
        
        console.log("[TVChart] Añadiendo marcadores únicos:", uniqueMarkers.length, uniqueMarkers);
        try {
            candleSeries.setMarkers(uniqueMarkers);
        } catch (markerErr) {
            console.warn("[TVChart] Error al inyectar marcadores. Intentando limpieza extrema...", markerErr);
            // Si falla, intentamos una limpieza más agresiva filtrando marcadores con tiempos idénticos que no se fusionaron bien
            const ultraCleanMarkers = [];
            const finalSeen = new Set();
            for (const m of uniqueMarkers) {
                if (!finalSeen.has(m.time)) {
                    finalSeen.add(m.time);
                    ultraCleanMarkers.push(m);
                }
            }
            try {
                candleSeries.setMarkers(ultraCleanMarkers);
            } catch (e2) {
                console.error("[TVChart] Fallo definitivo al inyectar marcadores:", e2);
            }
        }
      }

      if (marketData.entry_price && marketData.exit_price && markerList.length >= 2) {
        const isWin = marketData.side === 'Long' 
          ? marketData.exit_price > marketData.entry_price 
          : marketData.exit_price < marketData.entry_price;
        const colorTrade = isWin ? '#10b981' : '#ef4444';
          
        const syncedMarkers = [];
        const cTimes = cData.map(c => c.time);
        markerList.forEach(m => {
            let snapped = m.time;
            for (let i = cTimes.length - 1; i >= 0; i--) {
                if (cTimes[i] <= m.time) {
                    snapped = cTimes[i];
                    break;
                }
            }
            syncedMarkers.push({ ...m, time: snapped });
        });
        syncedMarkers.sort((a,b) => a.time - b.time);
        
        const inTime = syncedMarkers[0].time;
        const outTime = syncedMarkers[syncedMarkers.length - 1].time;
        
        if (inTime && outTime) {
            // Serie delimitada para la entrada
            const entryPath = mainChart.addSeries(LineSeries, {
                color: '#3b82f6', lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false
            });
            entryPath.setData([
                { time: inTime, value: marketData.entry_price },
                { time: outTime, value: marketData.entry_price }
            ]);

            // Serie delimitada para la salida
            const exitPath = mainChart.addSeries(LineSeries, {
                color: colorTrade, lineWidth: 2, lineStyle: 2, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false
            });
            exitPath.setData([
                { time: inTime, value: marketData.exit_price },
                { time: outTime, value: marketData.exit_price }
            ]);
            
            // Serie diagonal
            if (inTime !== outTime) {
                const tradePathSeries = mainChart.addSeries(LineSeries, {
                    color: colorTrade, lineWidth: 3, lineStyle: 0, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false
                });
                tradePathSeries.setData([
                    { time: inTime, value: marketData.entry_price },
                    { time: outTime, value: marketData.exit_price }
                ]);
            }

            // Forzar un zoom automático (5 velas antes de entrar y 5 después de salir)
            setTimeout(() => {
                const idxIn = cTimes.indexOf(inTime);
                const idxOut = cTimes.indexOf(outTime);
                if (idxIn !== -1 && idxOut !== -1) {
                    const range = { from: Math.max(0, idxIn - 8), to: Math.min(cTimes.length - 1, idxOut + 8) };
                    mainChart.timeScale().setVisibleLogicalRange(range);
                }
            }, 50);
        }
      }

      console.log("[TVChart] Sincronizando gráficos...");
      const syncTimeScales = (s, t1, t2) => {
        s.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (r) { t1.timeScale().setVisibleLogicalRange(r); t2.timeScale().setVisibleLogicalRange(r); } });
      };
      syncTimeScales(mainChart, rsiChart, macdChart);
      syncTimeScales(rsiChart, mainChart, macdChart);
      syncTimeScales(macdChart, mainChart, rsiChart);
      
      const getSyncCrosshairHandler = (sourceChart, targetChart1, targetChart2, targetSeries1, targetSeries2) => {
          return (param) => {
              if (!param.point) {
                  targetChart1.clearCrosshairPosition();
                  targetChart2.clearCrosshairPosition();
                  return;
              }
              // Sync to others based on the logical time/index
              if (param.time) {
                  targetChart1.setCrosshairPosition(param.point.x, param.time, targetSeries1);
                  targetChart2.setCrosshairPosition(param.point.x, param.time, targetSeries2);
              }
          };
      };

      mainChart.subscribeCrosshairMove(getSyncCrosshairHandler(mainChart, rsiChart, macdChart, rsiSeries, macdSeries));
      rsiChart.subscribeCrosshairMove(getSyncCrosshairHandler(rsiChart, mainChart, macdChart, candleSeries, macdSeries));
      macdChart.subscribeCrosshairMove(getSyncCrosshairHandler(macdChart, mainChart, rsiChart, candleSeries, rsiSeries));
      
      // Auto-fit is skipped here since we do a targeted auto-zoom in the trade logic
      if (!marketData.entry_price) {
          mainChart.timeScale().fitContent();
      }

      console.log("[TVChart] Creando ResizeObserver...");
      resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const { width } = entry.contentRect;
          mainChart.applyOptions({ width });
          rsiChart.applyOptions({ width });
          macdChart.applyOptions({ width });
        }
      });
      if (mainChartContainerRef.current) resizeObserver.observe(mainChartContainerRef.current.parentElement);

      console.log("[TVChart] Inicialización completada con éxito.");
    } catch (error) {
      console.error("[TVChart] CRASH FATAL DENTRO DE USEEFFECT:", error);
    }

    return () => {
      console.log("[TVChart] Ejecutando cleanup...");
      if (resizeObserver) resizeObserver.disconnect();
      if (mainChart) mainChart.remove();
      if (rsiChart) rsiChart.remove();
      if (macdChart) macdChart.remove();
    };
  }, [marketData]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div 
        ref={mainChartContainerRef} 
        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }} 
      />
      <div 
        ref={rsiChartContainerRef} 
        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', borderLeft: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)' }} 
      />
      <div 
        ref={macdChartContainerRef} 
        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }} 
      />
    </div>
  );
};

export default TVChart;
