import { useEffect, useRef, useState, useMemo, useCallback, createElement } from 'react';

const gsap = window.gsap;

// ─── Inline Noise ─────────────────────────────────────────────────────────────
const Noise = ({ patternRefreshInterval = 2, patternAlpha = 25 }) => {
  const grainRef = useRef(null);

  useEffect(() => {
    const canvas = grainRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let frame = 0;
    let animationId;
    let W = 0, H = 0;

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const drawGrain = () => {
      const imageData = ctx.createImageData(W, H);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255;
        data[i]     = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = patternAlpha;
      }
      ctx.putImageData(imageData, 0, 0);
    };

    const loop = () => {
      if (frame % patternRefreshInterval === 0) drawGrain();
      frame++;
      animationId = window.requestAnimationFrame(loop);
    };

    window.addEventListener('resize', resize);
    resize();
    loop();

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(animationId);
    };
  }, [patternRefreshInterval, patternAlpha]);

  return (
    <canvas
      ref={grainRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
};

// ─── Inline TextType ──────────────────────────────────────────────────────────
const TextType = ({
  text,
  as: Component = 'div',
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 2000,
  deletingSpeed = 30,
  loop = true,
  className = '',
  showCursor = true,
  cursorCharacter = '|',
  cursorBlinkDuration = 0.5,
  variableSpeed,
  onSentenceComplete,
  ...props
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const cursorRef = useRef(null);
  const containerRef = useRef(null);

  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);

  const getRandomSpeed = useCallback(() => {
    if (!variableSpeed) return typingSpeed;
    const { min, max } = variableSpeed;
    return Math.random() * (max - min) + min;
  }, [variableSpeed, typingSpeed]);

  useEffect(() => {
    if (showCursor && cursorRef.current) {
      gsap.set(cursorRef.current, { opacity: 1 });
      gsap.to(cursorRef.current, {
        opacity: 0,
        duration: cursorBlinkDuration,
        repeat: -1,
        yoyo: true,
        ease: 'power2.inOut',
      });
    }
  }, [showCursor, cursorBlinkDuration]);

  useEffect(() => {
    let timeout;
    const currentText = textArray[currentTextIndex];

    const executeTypingAnimation = () => {
      if (isDeleting) {
        if (displayedText === '') {
          setIsDeleting(false);
          if (currentTextIndex === textArray.length - 1 && !loop) return;
          if (onSentenceComplete) onSentenceComplete(textArray[currentTextIndex], currentTextIndex);
          setCurrentTextIndex(prev => (prev + 1) % textArray.length);
          setCurrentCharIndex(0);
          timeout = setTimeout(() => {}, pauseDuration);
        } else {
          timeout = setTimeout(() => {
            setDisplayedText(prev => prev.slice(0, -1));
          }, deletingSpeed);
        }
      } else {
        if (currentCharIndex < currentText.length) {
          timeout = setTimeout(() => {
            setDisplayedText(prev => prev + currentText[currentCharIndex]);
            setCurrentCharIndex(prev => prev + 1);
          }, variableSpeed ? getRandomSpeed() : typingSpeed);
        } else {
          if (!loop && currentTextIndex === textArray.length - 1) return;
          timeout = setTimeout(() => setIsDeleting(true), pauseDuration);
        }
      }
    };

    if (currentCharIndex === 0 && !isDeleting && displayedText === '') {
      timeout = setTimeout(executeTypingAnimation, initialDelay);
    } else {
      executeTypingAnimation();
    }

    return () => clearTimeout(timeout);
  }, [currentCharIndex, displayedText, isDeleting, typingSpeed, deletingSpeed,
      pauseDuration, textArray, currentTextIndex, loop, initialDelay,
      variableSpeed, onSentenceComplete, getRandomSpeed]);

  return createElement(
    Component,
    { ref: containerRef, className: `text-type ${className}`, ...props },
    <span className="text-type__content">{displayedText}</span>,
    showCursor && (
      <span ref={cursorRef} className="text-type__cursor">
        {cursorCharacter}
      </span>
    )
  );
};

// ─── Timing ───────────────────────────────────────────────────────────────────
const PHRASE       = 'Vein Digital Studio';
const TYPING_SPEED = 55;
const VANISH_DELAY = PHRASE.length * TYPING_SPEED + 700;

// ─── Intro ────────────────────────────────────────────────────────────────────
export default function Intro({ onComplete }) {
  const textWrapRef = useRef(null);
  const cubeRef     = useRef(null);
  const [phase, setPhase] = useState('typing');

  useEffect(() => {
    if (phase !== 'typing') return;
    const t = setTimeout(() => setPhase('vanish'), VANISH_DELAY);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'vanish') return;
    const el = textWrapRef.current;
    if (!el) return;
    gsap.to(el, {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => setPhase('expand'),
    });
  }, [phase]);

  useEffect(() => {
    if (phase !== 'expand') return;
    const cube = cubeRef.current;
    if (!cube) return;
    gsap.set(cube, { scale: 0, opacity: 1 });
    gsap.to(cube, {
      scale: 1,
      duration: 1.2,           // ✅ slower
      ease: 'power3.out',      // ✅ ease out at the end
      onComplete: () => {
        setPhase('done');
        if (onComplete) onComplete();
      },
    });
  }, [phase, onComplete]);

  if (phase === 'done') return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99998,
      background: '#0e0e0e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>

      <Noise patternRefreshInterval={2} patternAlpha={25} />

      {(phase === 'typing' || phase === 'vanish') && (
        <div
          ref={textWrapRef}
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '0.2em',
            color: '#ff2425',
            fontFamily: '"Inter", sans-serif', // ✅ Inter font
            fontSize: 'clamp(0.7rem, 1.2vw, 1rem)', // ✅ smaller
            letterSpacing: '0.08em',
            fontWeight: 400,
            userSelect: 'none',
          }}
        >
          <span>(</span>
          <TextType
            text={[PHRASE]}
            typingSpeed={TYPING_SPEED}
            initialDelay={400}
            loop={false}
            showCursor
            cursorCharacter="_"
            cursorBlinkDuration={0.45}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: '#ff2425',
              fontFamily: '"Inter", sans-serif',
            }}
          />
          <span>)</span>
        </div>
      )}

      <div
        ref={cubeRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100vmax',
          height: '100vmax',
          background: '#f8f6f2',
          transform: 'translate(-50%, -50%) scale(0)',
          opacity: 0,
          zIndex: 3,
          borderRadius: '1px',
        }}
      />
    </div>
  );
}