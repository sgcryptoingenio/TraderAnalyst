import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

const EChartTrade = ({ marketData, topStrategies }) => {
  const options = useMemo(() => {
    if (!marketData || !marketData.ohlcv) return {};

    const categoryData = [];
    const values = [];
    const volumes = [];
    const ema9 = [];
    const ema21 = [];
    const ema50 = [];
    const ema200 = [];
    const vwap = [];
    const bbu = [];
    const bbl = [];
    const rsi = [];
    const macd = [];
    const macdSignal = [];
    const macdHist = [];

    marketData.ohlcv.forEach(c => {
      const date = new Date(c.time * 1000);
      const timeStr = date.toISOString().replace('T', ' ').substring(0, 16);
      categoryData.push(timeStr);
      values.push([c.open, c.close, c.low, c.high]);
      volumes.push([c.time, c.volume, c.close >= c.open ? 1 : -1]);
      ema9.push(c.EMA_9);
      ema21.push(c.EMA_21);
      ema50.push(c.EMA_50);
      ema200.push(c.EMA_200);
      vwap.push(c.VWAP);
      bbu.push(c.BBU_20);
      bbl.push(c.BBL_20);
      rsi.push(c.RSI_14);
      macd.push(c.MACD);
      macdSignal.push(c.MACD_Signal);
      macdHist.push(c.MACD_Hist);
    });

    const isWin = marketData.reported_pnl ? marketData.reported_pnl > 0 : (
      marketData.side === 'Long' 
        ? marketData.exit_price > marketData.entry_price 
        : marketData.exit_price < marketData.entry_price
    );
    const colorTrade = isWin ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
    const borderColor = isWin ? '#10b981' : '#ef4444';

    let markArea = { data: [] };
    let markPoint = { data: [] };
    
    if (marketData.markers?.length >= 2) {
      const inMarker = marketData.markers[0];
      const outMarker = marketData.markers[marketData.markers.length - 1];
      
      let inC = marketData.ohlcv.find(c => Math.abs(c.time - inMarker.time) < 60);
      if (!inC) {
         inC = marketData.ohlcv.reduce((prev, curr) => Math.abs(curr.time - inMarker.time) < Math.abs(prev.time - inMarker.time) ? curr : prev);
      }
      let outC = marketData.ohlcv.find(c => Math.abs(c.time - outMarker.time) < 60);
      if (!outC) {
         outC = marketData.ohlcv.reduce((prev, curr) => Math.abs(curr.time - outMarker.time) < Math.abs(prev.time - outMarker.time) ? curr : prev);
      }
      
      const inDateStr = new Date(inC.time * 1000).toISOString().replace('T', ' ').substring(0, 16);
      const outDateStr = new Date(outC.time * 1000).toISOString().replace('T', ' ').substring(0, 16);

      const p0 = { xAxis: inDateStr };
      const p1 = { xAxis: outDateStr };

      if (marketData.entry_price && marketData.exit_price && !isNaN(marketData.entry_price)) {
         p0.yAxis = marketData.entry_price;
         p1.yAxis = marketData.exit_price;
      }

      markArea = {
        itemStyle: {
          color: colorTrade,
          borderWidth: 1,
          borderColor: borderColor,
          borderType: 'dashed'
        },
        data: [[ p0, p1 ]]
      };



      const isLong = marketData.side === 'Long';
      
      // Anclar la flecha al extremo de la vela (high/low) para evitar que estorbe el precio si hay spread (Spot vs Futuros)
      const inY = isLong ? inC.low : inC.high;
      const outY = isLong ? outC.high : outC.low;

      markPoint = {
        symbol: 'arrow',
        symbolSize: 14,
        label: { show: true, formatter: '{b}', color: '#fff', fontSize: 10 },
        data: [
          {
            name: 'IN\n' + marketData.entry_price,
            coord: [inDateStr, inY],
            symbolRotate: isLong ? 0 : 180,
            symbolOffset: isLong ? [0, '100%'] : [0, '-100%'],
            itemStyle: { color: '#3b82f6' },
            label: { offset: isLong ? [0, 20] : [0, -20] }
          },
          {
            name: 'OUT\n' + marketData.exit_price,
            coord: [outDateStr, outY],
            symbolRotate: isLong ? 180 : 0,
            symbolOffset: isLong ? [0, '-100%'] : [0, '100%'],
            itemStyle: { color: isWin ? '#10b981' : '#ef4444' },
            label: { offset: isLong ? [0, -20] : [0, 20] }
          }
        ]
      };
    }

    let dataZoomStart = 0;
    let dataZoomEnd = 100;
    if (marketData.markers?.length >= 2) {
      const inTime = marketData.markers[0].time;
      const outTime = marketData.markers[marketData.markers.length - 1].time;
      const cTimes = marketData.ohlcv.map(c => c.time);
      const idxIn = cTimes.findIndex(t => t >= inTime) || 0;
      const idxOut = cTimes.findIndex(t => t >= outTime) || cTimes.length - 1;
      
      const total = cTimes.length;
      dataZoomStart = Math.max(0, ((idxIn - 15) / total) * 100);
      dataZoomEnd = Math.min(100, ((idxOut + 15) / total) * 100);
    }

    let selected = {
      'EMA 9': false,
      'EMA 21': false,
      'EMA 50': false,
      'EMA 200': false,
      'VWAP': false,
      'BB Up': false,
      'BB Low': false,
      'RSI 14': false,
      'MACD': false
    };

    if (topStrategies) {
      // Activar los indicadores de las top 3 estrategias
      const sortedStrats = Object.entries(topStrategies)
        .filter(([_, score]) => score > 0)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 3);
      
      sortedStrats.forEach(([strat, _]) => {
        if (strat.includes("RSI")) selected['RSI 14'] = true;
        if (strat.includes("Bollinger")) { selected['BB Up'] = true; selected['BB Low'] = true; }
        if (strat.includes("MACD")) { selected['MACD'] = true; }
        if (strat.includes("VWAP")) selected['VWAP'] = true;
        if (strat.includes("9/21") || strat.includes("Pullback")) { selected['EMA 9'] = true; selected['EMA 21'] = true; }
        if (strat.includes("21/50")) { selected['EMA 21'] = true; selected['EMA 50'] = true; }
        if (strat.includes("50/200")) { selected['EMA 50'] = true; selected['EMA 200'] = true; }
      });
    } else {
      // Fallback
      selected['EMA 9'] = true;
      selected['EMA 21'] = true;
      selected['RSI 14'] = true;
      selected['MACD'] = true;
    }

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        borderWidth: 1,
        borderColor: '#374151',
        padding: 10,
        textStyle: { color: '#e5e7eb' },
        backgroundColor: '#1f2937'
      },
      legend: {
        data: ['EMA 9', 'EMA 21', 'EMA 50', 'EMA 200', 'VWAP', 'BB Up', 'BB Low', 'RSI 14', 'MACD'],
        textStyle: { color: '#9ca3af' },
        top: 0,
        selected: selected
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: '5%', right: '3%', top: '5%', height: '40%' },
        { left: '5%', right: '3%', top: '48%', height: '10%' },
        { left: '5%', right: '3%', top: '62%', height: '15%' },
        { left: '5%', right: '3%', top: '80%', height: '15%' }
      ],
      xAxis: [
        { type: 'category', data: categoryData, scale: true, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false }, min: 'dataMin', max: 'dataMax', axisLabel: { show: false } },
        { type: 'category', gridIndex: 1, data: categoryData, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false } },
        { type: 'category', gridIndex: 2, data: categoryData, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false } },
        { type: 'category', gridIndex: 3, data: categoryData, axisLabel: { show: true, color: '#9ca3af' }, axisTick: { show: true }, axisLine: { show: true, lineStyle: { color: '#4b5563' } } }
      ],
      yAxis: [
        { scale: true, splitArea: { show: false }, gridIndex: 0, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
        { scale: true, gridIndex: 2, min: 0, max: 100, splitNumber: 2, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        { scale: true, gridIndex: 3, splitNumber: 2, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } }
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1, 2, 3], start: dataZoomStart, end: dataZoomEnd },
        { show: true, type: 'slider', xAxisIndex: [0, 1, 2, 3], top: '97%', start: dataZoomStart, end: dataZoomEnd, textStyle: { color: '#9ca3af' } }
      ],
      series: [
        {
          name: marketData.symbol,
          type: 'candlestick',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: values,
          itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' },
          markArea: markArea,
          markPoint: markPoint
        },
        {
          name: 'EMA 9', type: 'line', data: ema9, smooth: true, showSymbol: false,
          lineStyle: { color: '#3b82f6', width: 1.5 }, xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'EMA 21', type: 'line', data: ema21, smooth: true, showSymbol: false,
          lineStyle: { color: '#f59e0b', width: 1.5 }, xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'EMA 50', type: 'line', data: ema50, smooth: true, showSymbol: false,
          lineStyle: { color: '#ef4444', width: 1.5 }, xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'EMA 200', type: 'line', data: ema200, smooth: true, showSymbol: false,
          lineStyle: { color: '#8b5cf6', width: 1.5 }, xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'VWAP', type: 'line', data: vwap, smooth: true, showSymbol: false,
          lineStyle: { color: '#ec4899', width: 1.5, type: 'dashed' }, xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'BB Up', type: 'line', data: bbu, smooth: true, showSymbol: false,
          lineStyle: { color: '#6ee7b7', width: 1, type: 'dotted' }, xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'BB Low', type: 'line', data: bbl, smooth: true, showSymbol: false,
          lineStyle: { color: '#6ee7b7', width: 1, type: 'dotted' }, xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'Volume',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes.map(item => ({ value: item[1], itemStyle: { color: item[2] > 0 ? '#10b981' : '#ef4444' } }))
        },
        {
          name: 'RSI 14', type: 'line', data: rsi, smooth: true, showSymbol: false,
          lineStyle: { color: '#a855f7', width: 1.5 }, xAxisIndex: 2, yAxisIndex: 2,
          markLine: { symbol: 'none', label: { show: false }, data: [{ yAxis: 30, lineStyle: { color: '#ef4444', type: 'dashed' } }, { yAxis: 70, lineStyle: { color: '#10b981', type: 'dashed' } }] }
        },
        {
          name: 'MACD', type: 'line', data: macd, smooth: true, showSymbol: false,
          lineStyle: { color: '#3b82f6', width: 1.5 }, xAxisIndex: 3, yAxisIndex: 3
        },
        {
          name: 'Signal', type: 'line', data: macdSignal, smooth: true, showSymbol: false,
          lineStyle: { color: '#f59e0b', width: 1.5 }, xAxisIndex: 3, yAxisIndex: 3
        },
        {
          name: 'Histogram', type: 'bar', data: macdHist.map(h => ({ value: h, itemStyle: { color: h > 0 ? '#10b981' : '#ef4444' } })),
          xAxisIndex: 3, yAxisIndex: 3
        }
      ]
    };
  }, [marketData, topStrategies]);

  if (!marketData || !marketData.ohlcv) {
    return <div className="text-gray-400">Sin datos de gráfico disponibles.</div>;
  }

  return (
    <ReactECharts
      option={options}
      style={{ height: '700px', width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
};

export default EChartTrade;
