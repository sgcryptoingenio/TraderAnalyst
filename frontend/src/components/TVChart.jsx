import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const TVChart = ({ marketData }) => {
  const mainChartContainerRef = useRef(null);
  const rsiChartContainerRef = useRef(null);
  const macdChartContainerRef = useRef(null);

  const mainChartRef = useRef(null);
  const rsiChartRef = useRef(null);
  const macdChartRef = useRef(null);

  useEffect(() => {
    if (!marketData || marketData.length === 0) return;

    // Dark Mode Glassmorphism Theme Options
    const chartOptions = {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#A0AEC0',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(160, 174, 192, 0.5)', width: 1, style: 1 },
        horzLine: { color: 'rgba(160, 174, 192, 0.5)', width: 1, style: 1 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    };

    // 1. Create Main Chart (Candles + EMAs)
    const mainChart = createChart(mainChartContainerRef.current, {
      ...chartOptions,
      height: 350,
      timeScale: { ...chartOptions.timeScale, visible: false },
    });
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#10b981',
      wickDownColor: '#ef4444',
      wickUpColor: '#10b981',
    });

    const ema9Series = mainChart.addLineSeries({
      color: '#3b82f6', // blue
      lineWidth: 1.5,
      title: 'EMA 9',
    });

    const ema21Series = mainChart.addLineSeries({
      color: '#f59e0b', // orange
      lineWidth: 1.5,
      title: 'EMA 21',
    });

    // 2. Create RSI Chart
    const rsiChart = createChart(rsiChartContainerRef.current, {
      ...chartOptions,
      height: 150,
      timeScale: { ...chartOptions.timeScale, visible: false }, 
    });
    rsiChartRef.current = rsiChart;

    const rsiSeries = rsiChart.addLineSeries({
      color: '#a855f7', // purple
      lineWidth: 1.5,
      title: 'RSI 14',
    });

    rsiSeries.createPriceLine({
      price: 70,
      color: 'rgba(239, 68, 68, 0.5)',
      lineWidth: 1,
      lineStyle: 2,
      title: 'OB',
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: 'rgba(16, 185, 129, 0.5)',
      lineWidth: 1,
      lineStyle: 2,
      title: 'OS',
    });

    // 3. Create MACD Chart
    const macdChart = createChart(macdChartContainerRef.current, {
      ...chartOptions,
      height: 150,
      timeScale: { ...chartOptions.timeScale, visible: true }, // Show time axis on bottom chart
    });
    macdChartRef.current = macdChart;

    const macdSeries = macdChart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 1.5,
      title: 'MACD',
    });

    const macdSignalSeries = macdChart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1.5,
      title: 'Signal',
    });

    const macdHistSeries = macdChart.addHistogramSeries({
      color: '#22c55e',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay
    });

    // Parse Data
    const cData = [];
    const ema9Data = [];
    const ema21Data = [];
    const rsiData = [];
    const macdData = [];
    const macdSignalData = [];
    const macdHistData = [];

    marketData.forEach(d => {
      if (!d.time || d.open === null) return;
      
      const t = d.time; 
      
      cData.push({ time: t, open: d.open, high: d.high, low: d.low, close: d.close });
      
      if (d.EMA_9 !== null && d.EMA_9 !== undefined) ema9Data.push({ time: t, value: d.EMA_9 });
      if (d.EMA_21 !== null && d.EMA_21 !== undefined) ema21Data.push({ time: t, value: d.EMA_21 });
      if (d.RSI_14 !== null && d.RSI_14 !== undefined) rsiData.push({ time: t, value: d.RSI_14 });
      if (d.MACD !== null && d.MACD !== undefined) macdData.push({ time: t, value: d.MACD });
      if (d.MACD_Signal !== null && d.MACD_Signal !== undefined) macdSignalData.push({ time: t, value: d.MACD_Signal });
      
      if (d.MACD_Hist !== null && d.MACD_Hist !== undefined) {
        macdHistData.push({
          time: t,
          value: d.MACD_Hist,
          color: d.MACD_Hist > 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)',
        });
      }
    });

    // Set Data
    candleSeries.setData(cData);
    ema9Series.setData(ema9Data);
    ema21Series.setData(ema21Data);
    rsiSeries.setData(rsiData);
    macdSeries.setData(macdData);
    macdSignalSeries.setData(macdSignalData);
    macdHistSeries.setData(macdHistData);

    // Sync Time Scales (Zoom / Pan)
    function syncTimeScales(sourceChart, targetChart1, targetChart2) {
      sourceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          targetChart1.timeScale().setVisibleLogicalRange(range);
          targetChart2.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    syncTimeScales(mainChart, rsiChart, macdChart);
    syncTimeScales(rsiChart, mainChart, macdChart);
    syncTimeScales(macdChart, mainChart, rsiChart);

    // Sync Crosshair (basic time sync)
    function syncCrosshair(sourceChart, ...targetCharts) {
        sourceChart.subscribeCrosshairMove(param => {
            if (!param.point) {
                targetCharts.forEach(chart => chart.clearCrosshairPosition());
                return;
            }
            
            // To properly sync crosshair we need to sync logical time
            const logical = sourceChart.timeScale().coordinateToLogical(param.point.x);
            if (logical !== null) {
                targetCharts.forEach(chart => {
                    const coord = chart.timeScale().logicalToCoordinate(logical);
                    if (coord !== null) {
                        // In v4+ we can't easily fake the crosshair without the specific series data.
                        // We will rely on time-scale sync which provides a great experience anyway.
                    }
                });
            }
        });
    }
    
    // Fit Content initially
    mainChart.timeScale().fitContent();

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        mainChart.applyOptions({ width });
        rsiChart.applyOptions({ width });
        macdChart.applyOptions({ width });
      }
    });
    
    if (mainChartContainerRef.current) {
        resizeObserver.observe(mainChartContainerRef.current.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
      mainChart.remove();
      rsiChart.remove();
      macdChart.remove();
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
