import React, { useEffect, useRef } from 'react';
import './Landing.css';

export default function Landing({ onEnterApp }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    // Scroll nav
    const handleScroll = () => {
      const nav = document.getElementById('main-nav');
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);

    // Particles
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles = [];
    let animationFrameId;

    function resize() { 
      W = canvas.width = window.innerWidth; 
      H = canvas.height = window.innerHeight; 
    }
    resize(); 
    window.addEventListener('resize', resize);
    
    class P {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random()*W; this.y = Math.random()*H;
        this.vx = (Math.random()-0.5)*0.3; this.vy = -Math.random()*0.4-0.1;
        this.a = 0; this.life = 0; this.maxLife = Math.random()*200+100;
        this.r = Math.random()*1.5+0.5;
        this.gold = Math.random() > 0.5;
      }
      update() {
        this.life++;
        this.a = this.life < 30 ? this.life/30 : this.life > this.maxLife-30 ? (this.maxLife-this.life)/30 : 1;
        this.x += this.vx; this.y += this.vy;
        if(this.life >= this.maxLife) this.reset();
      }
      draw() {
        ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
        ctx.fillStyle = this.gold ? `rgba(245,166,35,${this.a*0.6})` : `rgba(255,255,255,${this.a*0.15})`;
        ctx.fill();
      }
    }
    for(let i=0;i<120;i++) { const p = new P(); p.life=Math.random()*p.maxLife; particles.push(p); }
    
    function animate() { 
      ctx.clearRect(0,0,W,H); 
      particles.forEach(p=>{p.update();p.draw();}); 
      animationFrameId = requestAnimationFrame(animate); 
    }
    animate();

    // Counters
    const ms = [{id:'m1',end:3841,s:''},{id:'m2',end:612,s:''},{id:'m3',end:98,s:'%'},{id:'m4',end:12,s:'s'}];
    const ob = new IntersectionObserver(en=>{
      en.forEach(e=>{
        if(e.isIntersecting){
          ms.forEach(c=>{
            const el = document.getElementById(c.id);
            if (!el) return;
            let cur=0;
            const step=c.end/80;
            const ti=setInterval(()=>{
              cur=Math.min(cur+step,c.end);
              el.textContent=Math.floor(cur).toLocaleString()+c.s;
              if(cur>=c.end)clearInterval(ti);
            },16);
          });
          ob.disconnect();
        }
      });
    },{threshold:0.3});
    
    const strip = document.querySelector('.metrics-strip');
    if (strip) ob.observe(strip);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
      ob.disconnect();
    };
  }, []);

  return (
    <div className="landing-page">
      <canvas id="bg-canvas" ref={canvasRef}></canvas>

      <img
        src="/logo.jpg"
        className="logo-watermark"
        alt=""
        aria-hidden="true"
      />
      <nav id="main-nav">
        <div>
          <span className="logo-text">SABUESO</span>
          <span className="logo-sub">by Crypto Ingenio</span>
        </div>
        <div className="nav-menu">
          <a href="#how">Cómo funciona</a>
          <a href="#features">Análisis</a>
          <a href="#cta">Registro</a>
        </div>
        <button onClick={onEnterApp} className="nav-btn" style={{border: 'none', cursor: 'pointer'}}>Comenzar ahora</button>
      </nav>

      <section className="hero">
        <img
          src="/logo.jpg"
          className="logo-hero-bg"
          alt=""
          aria-hidden="true"
        />
        <div className="hero-chip"><div className="pulse"></div>Plataforma activa · Crypto Ingenio</div>
        <h1>
          <span className="line1">El olfato</span>
          <span className="line2">del mercado.</span>
          <span className="line3">Tu estrategia, radiografiada.</span>
        </h1>
        <p className="hero-desc">Sube el historial de operaciones de tu exchange (Bitunix, CoinEx, OKX, Binance y más). En segundos, Sabueso rastrea tus patrones, detecta tus errores y te revela qué tipo de trader eres realmente.</p>
        <div className="hero-cta">
          <button onClick={onEnterApp} className="cta-main" style={{border: 'none', cursor: 'pointer'}}>Auditar mi historial gratis</button>
          <a href="#how" className="cta-sec">Ver cómo funciona →</a>
        </div>
        <div className="metrics-strip">
          <div className="ms-card"><div className="ms-val" id="m1">0</div><div className="ms-lbl">Reportes</div></div>
          <div className="ms-card"><div className="ms-val" id="m2">0</div><div className="ms-lbl">Traders activos</div></div>
          <div className="ms-card"><div className="ms-val" id="m3">0%</div><div className="ms-lbl">Precisión</div></div>
          <div className="ms-card"><div className="ms-val" id="m4">0s</div><div className="ms-lbl">Análisis</div></div>
        </div>
      </section>

      <section id="how">
        <div className="section-wrap">
          <div className="how-wrap">
            <div>
              <div className="overline">Proceso</div>
              <div className="section-title">Tres pasos.<br/>Una verdad.</div>
              <div className="section-desc" style={{marginBottom: '48px'}}>Sin configuraciones complejas. Solo tu archivo y la matemática del mercado.</div>
              <div className="steps">
                <div className="step">
                  <div className="step-num">01</div>
                  <div><h3>Sube tu historial</h3><p>Exporta el CSV o XLSX de Binance Futures o Hyperliquid. Arrastra el archivo y listo — el sistema detecta el formato automáticamente.</p></div>
                </div>
                <div className="step">
                  <div className="step-num">02</div>
                  <div><h3>Sabueso lo rastrea</h3><p>Nuestro motor quant cruza tus operaciones con datos de mercado histórico, indicadores técnicos y patrones de comportamiento de trading.</p></div>
                </div>
                <div className="step">
                  <div className="step-num">03</div>
                  <div><h3>Recibe tu diagnóstico</h3><p>Un reporte visual completo: curva de equity, modelado predictivo, alertas de riesgo y el perfil exacto de tu estilo operativo.</p></div>
                </div>
              </div>
            </div>
            <div className="phone-mock">
              <div className="pm-header">
                <div className="pm-dot" style={{background: '#ff5f57'}}></div>
                <div className="pm-dot" style={{background: '#febc2e'}}></div>
                <div className="pm-dot" style={{background: '#28c840'}}></div>
                <span className="pm-title">análisis_live.json</span>
              </div>
              <div className="pm-body">
                <div className="pm-metric"><span className="lbl">Exchange</span><span className="val" style={{color: '#a78bfa'}}>Hyperliquid</span></div>
                <div className="pm-metric"><span className="lbl">Operaciones</span><span className="val">1,247</span></div>
                <div className="pm-metric"><span className="lbl">Win Rate</span><span className="val" style={{color: 'var(--green)'}}>71.2%</span></div>
                <div className="pm-metric"><span className="lbl">R/R Ratio</span><span className="val" style={{color: 'var(--green)'}}>2.14</span></div>
                <div className="pm-metric"><span className="lbl">PnL Total</span><span className="val" style={{color: 'var(--green)'}}>+$8,741</span></div>
                <div className="pm-metric"><span className="lbl">Max Drawdown</span><span className="val" style={{color: 'var(--red)'}}>-9.4%</span></div>
                <div className="pm-metric"><span className="lbl">Perfil</span><span className="val" style={{color: 'var(--gold)'}}>Breakout Trader</span></div>
                <div className="pm-bar-section">
                  <div className="pm-bar-label"><span>Breakouts</span><span style={{color: 'var(--green)'}}>82%</span></div>
                  <div className="pm-bar-track"><div className="pm-bar-fill" style={{width: '82%', background: 'linear-gradient(90deg,#00a855,#00e87a)'}}></div></div>
                  <div className="pm-bar-label"><span>SMC / Institucional</span><span style={{color: '#60a5fa'}}>65%</span></div>
                  <div className="pm-bar-track"><div className="pm-bar-fill" style={{width: '65%', background: 'linear-gradient(90deg,#1d4ed8,#60a5fa)'}}></div></div>
                  <div className="pm-bar-label"><span>Momentum / Vol</span><span style={{color: 'var(--gold)'}}>48%</span></div>
                  <div className="pm-bar-track"><div className="pm-bar-fill" style={{width: '48%', background: 'linear-gradient(90deg,#92400e,#f5a623)'}}></div></div>
                  <div className="pm-bar-label"><span>Riesgo Martingala</span><span style={{color: 'var(--red)'}}>2 veces</span></div>
                  <div className="pm-bar-track"><div className="pm-bar-fill" style={{width: '15%', background: 'linear-gradient(90deg,#7f1d1d,#ff3b55)'}}></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features">
        <div className="section-wrap" style={{paddingTop: '0'}}>
          <div className="overline">Análisis</div>
          <div className="section-title" style={{marginBottom: '48px'}}>Todo lo que<br/>necesitas ver</div>
          <div className="bento">
            <div className="bc wide">
              <span className="bc-icon">📊</span>
              <h3>Curva de Equity Interactiva</h3>
              <p>Visualiza la evolución operación por operación con un slider de zoom temporal. Identifica exactamente en qué períodos tu sistema funciona y cuándo falla.</p>
              <span className="tag">Interactivo</span>
            </div>
            <div className="bc">
              <span className="bc-icon">🎯</span>
              <h3>Modelado Quant</h3>
              <p>Correlación de tu operativa con 6+ estrategias de mercado para identificar tu perfil real.</p>
              <span className="tag">IA</span>
            </div>
            <div className="bc">
              <span className="bc-icon">⚠️</span>
              <h3>Alertas de Riesgo</h3>
              <p>Detección de Martingala, re-entradas emocionales y sesgos Long/Short que no ves a simple vista.</p>
            </div>
            <div className="bc">
              <span className="bc-icon">📈</span>
              <h3>Reconstrucción Visual</h3>
              <p>Tus trades superpuestos sobre el gráfico histórico real del mercado. Ve el contexto completo de cada entrada.</p>
            </div>
            <div className="bc wide">
              <span className="bc-icon">📄</span>
              <h3>Exportación PDF con Dark Mode</h3>
              <p>Descarga un reporte profesional con tu marca, todos los gráficos capturados en alta calidad y marca de agua elegante. Ideal para compartir con tu comunidad o mentor.</p>
              <span className="tag">Premium</span>
            </div>
          </div>
        </div>
      </section>

      <div className="cta-final" id="cta">
        <h2>Descubre en qué eres <span>realmente bueno</span></h2>
        <p>Registra tu cuenta y sube tu primer historial. El diagnóstico tarda menos de 30 segundos.</p>
        <div className="cta-final-btns">
          <button onClick={onEnterApp} className="cta-main" style={{border: 'none', cursor: 'pointer', fontSize: '1.15rem', padding: '20px 56px'}}>Crear cuenta gratis</button>
          <button onClick={onEnterApp} className="cta-sec" style={{border: 'none', cursor: 'pointer', fontSize: '1rem', background: 'transparent'}}>Ya tengo cuenta →</button>
        </div>
      </div>

      <footer style={{position: 'relative', zIndex: 1, padding: '40px 80px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem'}}>
        <span>© 2024 <span className="f-brand" style={{background: 'linear-gradient(135deg, var(--gold), var(--gold2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '700'}}>Crypto Ingenio</span> · Sabueso</span>
        <span>Análisis de trading · No es asesoría financiera · Todos los derechos reservados</span>
      </footer>
    </div>
  );
}
