import { useEffect, useRef, useState, useCallback } from 'react';
import './WorkGrid.css';
import * as THREE from 'three';

const vertexShader = `
  uniform float time;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uDataTexture;
  uniform sampler2D uTexture;
  uniform vec4 resolution;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    vec4 offset = texture2D(uDataTexture, vUv);
    gl_FragColor = texture2D(uTexture, uv - 0.02 * offset.rg);
  }
`;

const SCROLL_DURATION_THRESHOLD = 300; // ms hold before triggering
const GRID = 15;

export default function WorkGrid({ onSwitchToList }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRefs = useRef([]);
  const stateRef = useRef({
    currentIndex: 0,
    transitioning: false,
    scrollAccum: 0,
    scrollTimer: null,
    scrollHoldStart: null,
    mouseX: 0,
    mouseY: 0,
    prevMouseX: 0,
    prevMouseY: 0,
    mouseVX: 0,
    mouseVY: 0,
    // Three.js
    renderer: null,
    scene: null,
    camera: null,
    plane: null,
    uniforms: null,
    dataTexture: null,
    animId: null,
    gridData: null,
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [titleText, setTitleText] = useState('');
  const [categoryText, setCategoryText] = useState('');
  const [cursorPos, setCursorPos] = useState({ x: -300, y: -300 });
  const [cursorVisible, setCursorVisible] = useState(false);

  // Fetch work items
  useEffect(() => {
    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        setItems(data.items || []);
        if (data.items?.length) {
          setTitleText(data.items[0].name || '');
          setCategoryText(data.items[0].category || '');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Scramble text effect
  const scrambleText = useCallback((target, setText) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let frame = 0;
    const totalFrames = 20;
    const original = target.toUpperCase();

    const animate = () => {
      if (frame >= totalFrames) {
        setText(original);
        return;
      }
      const progress = frame / totalFrames;
      const result = original.split('').map((char, i) => {
        if (char === ' ') return ' ';
        if (i < original.length * progress) return char;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join('');
      setText(result);
      frame++;
      requestAnimationFrame(animate);
    };
    animate();
  }, []);

  // Setup Three.js WebGL distortion
  useEffect(() => {
    if (loading || !items.length || !canvasRef.current) return;
    const s = stateRef.current;
    const canvas = canvasRef.current;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 0, 0, 0, -1000, 1000);
    camera.position.z = 2;

    const gridData = new Float32Array(4 * GRID * GRID);
    const dataTexture = new THREE.DataTexture(
      gridData, GRID, GRID, THREE.RGBAFormat, THREE.FloatType
    );
    dataTexture.needsUpdate = true;

    const uniforms = {
      time: { value: 0 },
      resolution: { value: new THREE.Vector4() },
      uTexture: { value: new THREE.Texture() },
      uDataTexture: { value: dataTexture },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(1, 1, GRID - 1, GRID - 1);
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    s.renderer = renderer;
    s.scene = scene;
    s.camera = camera;
    s.plane = plane;
    s.uniforms = uniforms;
    s.dataTexture = dataTexture;
    s.gridData = gridData;

    const handleResize = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      renderer.setSize(W, H);

      const aspect = W / H;
      plane.scale.set(aspect, 1, 1);

      const frustumH = 1;
      const frustumW = frustumH * aspect;
      camera.left = -frustumW / 2;
      camera.right = frustumW / 2;
      camera.top = frustumH / 2;
      camera.bottom = -frustumH / 2;
      camera.updateProjectionMatrix();
      uniforms.resolution.value.set(W, H, 1, 1);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Load first video texture
    loadVideoTexture(0);

    // Animate
    const animate = () => {
      s.animId = requestAnimationFrame(animate);
      uniforms.time.value += 0.05;

      const d = gridData;
      for (let i = 0; i < GRID * GRID; i++) {
        d[i * 4] *= 0.9;
        d[i * 4 + 1] *= 0.9;
      }

      const gridMouseX = GRID * (s.mouseX / window.innerWidth);
      const gridMouseY = GRID * (1 - s.mouseY / window.innerHeight);
      const maxDist = GRID * 0.1;

      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const distSq = Math.pow(gridMouseX - i, 2) + Math.pow(gridMouseY - j, 2);
          if (distSq < maxDist * maxDist) {
            const index = 4 * (i + GRID * j);
            const power = Math.min(maxDist / Math.sqrt(distSq), 10);
            d[index] += 0.15 * 100 * s.mouseVX * power;
            d[index + 1] -= 0.15 * 100 * s.mouseVY * power;
          }
        }
      }

      dataTexture.needsUpdate = true;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(s.animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [loading, items]);

  const loadVideoTexture = useCallback((index) => {
    const s = stateRef.current;
    if (!s.uniforms || !items.length) return;

    const item = items[index];
    if (!item?.videoUrl) return;

    const video = videoRefs.current[index];
    if (!video) return;

    video.play().catch(() => {});

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    s.uniforms.uTexture.value = texture;
  }, [items]);

  // Preload next video
  const preloadVideo = useCallback((index) => {
    const video = videoRefs.current[index];
    if (video) video.load();
  }, []);

  // Navigate to next/prev project
  const navigateTo = useCallback((newIndex, items) => {
    const s = stateRef.current;
    if (s.transitioning) return;
    s.transitioning = true;

    const totalItems = items.length;
    const wrappedIndex = ((newIndex % totalItems) + totalItems) % totalItems;

    // Blast the grid distortion on exit
    const d = s.gridData;
    if (d) {
      for (let i = 0; i < GRID * GRID; i++) {
        d[i * 4] = (Math.random() - 0.5) * 500;
        d[i * 4 + 1] = (Math.random() - 0.5) * 500;
      }
      if (s.dataTexture) s.dataTexture.needsUpdate = true;
    }

    setTimeout(() => {
      s.currentIndex = wrappedIndex;
      setCurrentIndex(wrappedIndex);
      loadVideoTexture(wrappedIndex);

      // Scramble new title
      scrambleText(items[wrappedIndex].name || '', setTitleText);
      setCategoryText(items[wrappedIndex].category || '');

      // Blast distortion again on entry
      if (d) {
        for (let i = 0; i < GRID * GRID; i++) {
          d[i * 4] = (Math.random() - 0.5) * 500;
          d[i * 4 + 1] = (Math.random() - 0.5) * 500;
        }
        if (s.dataTexture) s.dataTexture.needsUpdate = true;
      }

      // Preload next
      const nextIndex = ((wrappedIndex + 1) % totalItems + totalItems) % totalItems;
      preloadVideo(nextIndex);

      setTimeout(() => {
        s.transitioning = false;
      }, 400);
    }, 300);
  }, [loadVideoTexture, scrambleText, preloadVideo]);

  // Scroll handling with duration threshold
  useEffect(() => {
    if (!items.length) return;
    const s = stateRef.current;

    const handleWheel = (e) => {
      e.preventDefault();
      if (s.transitioning) return;

      const direction = e.deltaY > 0 ? 1 : -1;

      if (!s.scrollHoldStart) {
        s.scrollHoldStart = Date.now();
        s.scrollDirection = direction;
      }

      const held = Date.now() - s.scrollHoldStart;

      if (held >= SCROLL_DURATION_THRESHOLD) {
        navigateTo(s.currentIndex + s.scrollDirection, items);
        s.scrollHoldStart = null;
        s.scrollDirection = null;
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        navigateTo(s.currentIndex + 1, items);
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        navigateTo(s.currentIndex - 1, items);
      }
    };

    const handleScrollEnd = () => {
      stateRef.current.scrollHoldStart = null;
      stateRef.current.scrollDirection = null;
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerup', handleScrollEnd);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerup', handleScrollEnd);
    };
  }, [items, navigateTo]);

  // Mouse tracking
  useEffect(() => {
    const s = stateRef.current;
    const handleMouseMove = (e) => {
      s.mouseVX = (e.clientX - s.prevMouseX) * 0.003;
      s.mouseVY = (e.clientY - s.prevMouseY) * 0.003;
      s.prevMouseX = s.mouseX;
      s.prevMouseY = s.mouseY;
      s.mouseX = e.clientX;
      s.mouseY = e.clientY;
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Click to open project
  const handleClick = useCallback(() => {
    const s = stateRef.current;
    if (s.transitioning || !items.length) return;
    const item = items[s.currentIndex];
    if (item) {
      window.dispatchEvent(new CustomEvent('work:open', { detail: item }));
    }
  }, [items]);

  if (loading) {
    return <div className="work-grid-loading">LOADING WORK...</div>;
  }

  return (
    <div
      ref={wrapperRef}
      className="work-grid-wrapper"
      onClick={handleClick}
      onMouseEnter={() => setCursorVisible(true)}
      onMouseLeave={() => setCursorVisible(false)}
    >
      {/* Video layers — all preloaded, only current visible */}
      {items.map((item, i) => (
        <div
          key={item.id}
          className="work-grid-video-layer"
          style={{ opacity: i === currentIndex ? 1 : 0, zIndex: i === currentIndex ? 1 : 0 }}
        >
          <video
            ref={el => videoRefs.current[i] = el}
            src={item.videoUrl}
            autoPlay={i === 0}
            muted
            loop
            playsInline
            crossOrigin="anonymous"
          />
        </div>
      ))}

      {/* WebGL distortion canvas */}
      <canvas ref={canvasRef} className="work-grid-canvas" />

      {/* Project title */}
      <div className="work-grid-title">
        <p className="work-grid-title-name">{titleText}</p>
        <p className="work-grid-title-category">{categoryText}</p>
      </div>

      {/* Counter */}
      <div className="work-grid-counter">
        {String(currentIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
      </div>

      {/* Layout toggle */}
      <div className="work-grid-toggle">
        <button className="active" onClick={e => e.stopPropagation()}>GRID</button>
        <button
          className="inactive"
          onClick={e => { e.stopPropagation(); onSwitchToList?.(); }}
        >
          LIST
        </button>
      </div>

      {/* Custom cursor */}
      <div
        className="work-cursor"
        style={{
          left: cursorPos.x,
          top: cursorPos.y,
          opacity: cursorVisible ? 1 : 0,
        }}
      >
        <div className="work-cursor-label">VIEW</div>
      </div>
    </div>
  );
}