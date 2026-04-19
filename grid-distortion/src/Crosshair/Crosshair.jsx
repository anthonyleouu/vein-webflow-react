import { useEffect, useRef } from 'react';

const lerp = (a, b, n) => (1 - n) * a + n * b;

const Crosshair = ({ color = '#ff2425' }) => {
  const lineHorizontalRef = useRef(null);
  const lineVerticalRef   = useRef(null);
  const filterXRef        = useRef(null);
  const filterYRef        = useRef(null);

  useEffect(() => {
    let mouse = { x: 0, y: 0 };
    let animId = null;
    let tlRunning = false;
    let tlStartTime = null;
    const TL_DURATION  = 500;
    const MAX_OPACITY  = 0.2;

    const renderedStyles = {
      tx: { previous: 0, current: 0, amt: 1 },
      ty: { previous: 0, current: 0, amt: 1 },
    };

    const setOpacity = (val) => {
      if (lineHorizontalRef.current) lineHorizontalRef.current.style.opacity = val;
      if (lineVerticalRef.current)   lineVerticalRef.current.style.opacity   = val;
    };

    setOpacity(0);

    const render = () => {
      renderedStyles.tx.current = mouse.x;
      renderedStyles.ty.current = mouse.y;
      for (const key in renderedStyles) {
        renderedStyles[key].previous = lerp(
          renderedStyles[key].previous,
          renderedStyles[key].current,
          renderedStyles[key].amt
        );
      }
      if (lineVerticalRef.current)
        lineVerticalRef.current.style.transform = `translateX(${renderedStyles.tx.previous}px)`;
      if (lineHorizontalRef.current)
        lineHorizontalRef.current.style.transform = `translateY(${renderedStyles.ty.previous}px)`;
      animId = requestAnimationFrame(render);
    };

    const handleMouseMove = (e) => {
      mouse = { x: e.clientX, y: e.clientY };
    };

    const onFirstMove = () => {
      renderedStyles.tx.previous = renderedStyles.tx.current = mouse.x;
      renderedStyles.ty.previous = renderedStyles.ty.current = mouse.y;
      setOpacity(MAX_OPACITY);
      render();
      window.removeEventListener('mousemove', onFirstMove);
    };

    const runTurbulence = (startT = 0) => {
      tlRunning = true;
      tlStartTime = performance.now() - startT * TL_DURATION;
      const animate = (now) => {
        if (!tlRunning) return;
        const t = Math.min((now - tlStartTime) / TL_DURATION, 1);
        const turbulence = (1 - t) * 0.05;
        if (filterXRef.current) filterXRef.current.setAttribute('baseFrequency', turbulence);
        if (filterYRef.current) filterYRef.current.setAttribute('baseFrequency', turbulence);
        if (lineHorizontalRef.current) lineHorizontalRef.current.style.filter = 'url(#filter-noise-x)';
        if (lineVerticalRef.current)   lineVerticalRef.current.style.filter   = 'url(#filter-noise-y)';
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          if (lineHorizontalRef.current) lineHorizontalRef.current.style.filter = 'none';
          if (lineVerticalRef.current)   lineVerticalRef.current.style.filter   = 'none';
          tlRunning = false;
        }
      };
      requestAnimationFrame(animate);
    };

    const enter = () => runTurbulence();
    const leave = () => {
      if (!tlRunning) return;
      const elapsed  = performance.now() - tlStartTime;
      const currentT = Math.min(elapsed / TL_DURATION, 1);
      runTurbulence(currentT);
    };

    const addLinkListeners = () => {
      document.querySelectorAll('a').forEach(link => {
        link.addEventListener('mouseenter', enter);
        link.addEventListener('mouseleave', leave);
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousemove', onFirstMove);
    document.addEventListener('mouseleave', () => setOpacity(0));
    document.addEventListener('mouseenter', () => setOpacity(MAX_OPACITY));

    addLinkListeners();

    if (window.barba) {
      window.barba.hooks.afterEnter(() => addLinkListeners());
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousemove', onFirstMove);
      document.querySelectorAll('a').forEach(link => {
        link.removeEventListener('mouseenter', enter);
        link.removeEventListener('mouseleave', leave);
      });
    };
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 9998,
    }}>
      <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
        <defs>
          <filter id="filter-noise-x">
            <feTurbulence type="fractalNoise" baseFrequency="0.000001" numOctaves="1" ref={filterXRef} />
            <feDisplacementMap in="SourceGraphic" scale="40" />
          </filter>
          <filter id="filter-noise-y">
            <feTurbulence type="fractalNoise" baseFrequency="0.000001" numOctaves="1" ref={filterYRef} />
            <feDisplacementMap in="SourceGraphic" scale="40" />
          </filter>
        </defs>
      </svg>
      <div ref={lineHorizontalRef} style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '1px',
        background: color, opacity: 0,
        pointerEvents: 'none',
      }} />
      <div ref={lineVerticalRef} style={{
        position: 'absolute', top: 0, left: 0,
        height: '100%', width: '1px',
        background: color, opacity: 0,
        pointerEvents: 'none',
      }} />
    </div>
  );
};

export default Crosshair;