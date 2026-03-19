import { useEffect, useRef, useState, useCallback } from 'react';
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
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    vec4 offset = texture2D(uDataTexture, vUv);
    vec4 color = texture2D(uTexture, uv - 0.02 * offset.rg);
    gl_FragColor = vec4(color.rgb, color.a * uAlpha);
  }
`;

const GRID = 15;
const MOUSE_STRENGTH = 0.03;
const MOUSE_RADIUS = 0.08;
const RELAXATION = 0.92;
const BLAST_STRENGTH = 20;
const SCROLL_COOLDOWN = 900;

function injectStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export default function WorkGrid({ onSwitchToList }) {
  const itemsRef = useRef([]);
  const videoRefs = useRef([]);
  const wrapperRefs = useRef([]);
  const stateRef = useRef({
    currentIndex: 0,
    transitioning: false,
    mouseX: 0,
    mouseY: 0,
    prevMouseX: 0,
    prevMouseY: 0,
    mouseVX: 0,
    mouseVY: 0,
    renderer: null,
    scene: null,
    camera: null,
    plane: null,
    uniforms: null,
    dataTexture: null,
    animId: null,
    gridData: null,
    lastScrollTime: 0,
    isListView: false,
    listIndex: 0,
  });

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    injectStyle('work-grid-styles', `
      .video-stack {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      .grid-video-item {
        position: absolute;
        overflow: hidden;
        will-change: transform, opacity;
        transform-origin: center center;
      }
      .grid-video-item video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .work-canvas canvas {
        width: 100% !important;
        height: 100% !important;
      }
    `);
  }, []);

  const scramble = useCallback((element, text) => {
    if (!element || !window.gsap) return;
    window.gsap.to(element, {
      duration: 1.2,
      scrambleText: { text, chars: 'upperCase', speed: 0.85 },
    });
  }, []);

  const updateUI = useCallback((item, index) => {
    const titleEl = document.querySelector('.title-name');
    const counterEl = document.querySelector('.work-counter');
    const num = String(index + 1).padStart(2, '0');
    if (titleEl) scramble(titleEl, item.name.toUpperCase());
    if (counterEl) scramble(counterEl, `[PROJECT ${num}]`);
  }, [scramble]);

  useEffect(() => {
    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        const fetched = data.items || [];
        setItems(fetched);
        itemsRef.current = fetched;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Build video elements
  useEffect(() => {
    if (loading || !items.length) return;
    const stack = document.querySelector('.video-stack');
    if (!stack) return;

    stack.innerHTML = '';
    wrapperRefs.current = [];
    videoRefs.current = [];

    items.forEach((item, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'grid-video-item';
      wrapper.style.cssText = `
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: ${i === 0 ? 1 : 0};
        z-index: ${i === 0 ? 1 : 0};
      `;

      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';

      wrapper.appendChild(video);
      stack.appendChild(wrapper);
      wrapperRefs.current[i] = wrapper;
      videoRefs.current[i] = video;
    });

    const titleEl = document.querySelector('.title-name');
    const counterEl = document.querySelector('.work-counter');
    if (titleEl) titleEl.textContent = items[0].name.toUpperCase();
    if (counterEl) counterEl.textContent = '[PROJECT 01]';
  }, [loading, items]);

  const loadVideoTexture = useCallback((index) => {
    const s = stateRef.current;
    if (!s.uniforms) return;
    const allItems = itemsRef.current;
    if (!allItems.length) return;
    const item = allItems[index];
    if (!item?.videoUrl) return;
    const video = videoRefs.current[index];
    if (!video) return;

    video.crossOrigin = 'anonymous';
    video.src = item.videoUrl;

    video.addEventListener('loadedmetadata', () => {
      const texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;

      s.uniforms.uTexture.value = texture;

      const W = window.innerWidth;
      const H = window.innerHeight;
      const containerAspect = W / H;
      const videoAspect = video.videoWidth / video.videoHeight || 16 / 9;

      let scaleX, scaleY;
      if (containerAspect > videoAspect) {
        scaleX = containerAspect;
        scaleY = containerAspect / videoAspect;
      } else {
        scaleX = videoAspect;
        scaleY = 1;
      }
      if (s.plane) s.plane.scale.set(scaleX, scaleY, 1);

      s.uniforms.uAlpha.value = 0;
      const fadeIn = () => {
        if (s.uniforms.uAlpha.value < 1) {
          s.uniforms.uAlpha.value = Math.min(s.uniforms.uAlpha.value + 0.03, 1);
          requestAnimationFrame(fadeIn);
        }
      };
      fadeIn();

      video.play().catch(() => {});
    }, { once: true });

    video.load();
  }, []);

  const preloadVideo = useCallback((index) => {
    const allItems = itemsRef.current;
    const item = allItems[index];
    if (!item?.videoUrl) return;
    const video = videoRefs.current[index];
    if (!video || video.src) return;
    video.crossOrigin = 'anonymous';
    video.src = item.videoUrl;
    video.load();
  }, []);

  const blastExit = useCallback(() => {
    const s = stateRef.current;
    const d = s.gridData;
    if (!d) return;
    for (let i = 0; i < GRID * GRID; i++) {
      d[i * 4] = (Math.random() - 0.5) * BLAST_STRENGTH;
      d[i * 4 + 1] = (Math.random() - 0.5) * BLAST_STRENGTH;
    }
    if (s.dataTexture) s.dataTexture.needsUpdate = true;
  }, []);

  const navigateTo = useCallback((newIndex) => {
    const s = stateRef.current;
    const allItems = itemsRef.current;
    if (s.transitioning || !allItems.length || s.isListView) return;
    s.transitioning = true;

    const total = allItems.length;
    const wrapped = ((newIndex % total) + total) % total;

    blastExit();

    setTimeout(() => {
      if (wrapperRefs.current[s.currentIndex]) {
        wrapperRefs.current[s.currentIndex].style.opacity = 0;
        wrapperRefs.current[s.currentIndex].style.zIndex = 0;
      }
      videoRefs.current[s.currentIndex]?.pause();

      setTimeout(() => {
        if (wrapperRefs.current[wrapped]) {
          wrapperRefs.current[wrapped].style.opacity = 1;
          wrapperRefs.current[wrapped].style.zIndex = 1;
        }

        s.currentIndex = wrapped;
        loadVideoTexture(wrapped);
        updateUI(allItems[wrapped], wrapped);

        const nextIdx = ((wrapped + 1) % total + total) % total;
        preloadVideo(nextIdx);

        setTimeout(() => { s.transitioning = false; }, 600);
      }, 100);
    }, 400);
  }, [blastExit, loadVideoTexture, updateUI, preloadVideo]);

  // List position calculator — wraps around so active is always centered
  const getListPositions = useCallback((activeIdx) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const itemW = W * 0.35;
    const itemH = H * 0.45;
    const centerX = (W - itemW) / 2;
    const centerY = (H - itemH) / 2;
    const total = wrapperRefs.current.length;
    const positions = [];

    for (let i = 0; i < total; i++) {
      // Calculate offset wrapping around
      let offset = i - activeIdx;
      // Wrap: if offset > half total, subtract total
      if (offset > total / 2) offset -= total;
      if (offset < -total / 2) offset += total;

      positions.push({
        x: centerX + offset * itemW,
        y: centerY,
        w: itemW,
        h: itemH,
      });
    }
    return positions;
  }, []);

  // Switch to LIST
  const switchToList = useCallback(() => {
    const s = stateRef.current;
    if (s.isListView || !window.gsap) return;
    s.isListView = true;
    s.listIndex = s.currentIndex;

    const positions = getListPositions(s.currentIndex);
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Load all videos
    itemsRef.current.forEach((item, i) => {
      const video = videoRefs.current[i];
      if (video && !video.src) {
        video.crossOrigin = 'anonymous';
        video.src = item.videoUrl;
        video.load();
      }
      if (video) video.play().catch(() => {});
    });

    wrapperRefs.current.forEach((wrapper, i) => {
      if (!wrapper) return;
      const pos = positions[i];
      const scaleX = pos.w / W;
      const scaleY = pos.h / H;
      const translateX = pos.x - (W * (1 - scaleX)) / 2;
      const translateY = pos.y - (H * (1 - scaleY)) / 2;

      window.gsap.to(wrapper, {
        x: translateX,
        y: translateY,
        scaleX,
        scaleY,
        opacity: 1,
        zIndex: i === s.currentIndex ? 2 : 1,
        duration: 1.8,
        ease: 'power3.inOut',
      });
    });

    // Hide canvas
    const canvas = document.querySelector('.work-canvas');
    if (canvas) window.gsap.to(canvas, { opacity: 0, duration: 0.5 });

  }, [getListPositions]);

  // Switch back to GRID
  const switchToGrid = useCallback(() => {
    const s = stateRef.current;
    if (!s.isListView || !window.gsap) return;
    s.isListView = false;

    wrapperRefs.current.forEach((wrapper, i) => {
      if (!wrapper) return;
      const isActive = i === s.currentIndex;

      window.gsap.to(wrapper, {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: isActive ? 1 : 0,
        zIndex: isActive ? 1 : 0,
        duration: 1.2,
        ease: 'power3.inOut',
        onComplete: () => {
          if (!isActive) videoRefs.current[i]?.pause();
        },
      });
    });

    // Show canvas
    const canvas = document.querySelector('.work-canvas');
    if (canvas) window.gsap.to(canvas, { opacity: 1, duration: 0.8, delay: 0.5 });

  }, []);

  // List navigation — scroll moves between projects
  const navigateList = useCallback((direction) => {
    const s = stateRef.current;
    if (!s.isListView || !window.gsap) return;
    const total = itemsRef.current.length;
    s.listIndex = ((s.listIndex + direction) % total + total) % total;
    s.currentIndex = s.listIndex;

    const positions = getListPositions(s.listIndex);
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Update title
    updateUI(itemsRef.current[s.listIndex], s.listIndex);

    wrapperRefs.current.forEach((wrapper, i) => {
      if (!wrapper) return;
      const pos = positions[i];
      const scaleX = pos.w / W;
      const scaleY = pos.h / H;
      const translateX = pos.x - (W * (1 - scaleX)) / 2;
      const translateY = pos.y - (H * (1 - scaleY)) / 2;

      window.gsap.to(wrapper, {
        x: translateX,
        y: translateY,
        scaleX,
        scaleY,
        zIndex: i === s.listIndex ? 2 : 1,
        duration: 0.6,
        ease: 'power2.out',
      });
    });
  }, [getListPositions, updateUI]);

  // Setup Three.js
  useEffect(() => {
    if (loading || !items.length) return;
    const s = stateRef.current;

    const canvasContainer = document.querySelector('.work-canvas');
    if (!canvasContainer) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    canvasContainer.appendChild(renderer.domElement);

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
      uAlpha: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      transparent: true, side: THREE.DoubleSide,
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

    loadVideoTexture(0);
    if (items.length > 1) preloadVideo(1);

    const animate = () => {
      s.animId = requestAnimationFrame(animate);
      uniforms.time.value += 0.05;
      const d = gridData;

      for (let i = 0; i < GRID * GRID; i++) {
        d[i * 4] *= RELAXATION;
        d[i * 4 + 1] *= RELAXATION;
      }

      const gridMouseX = GRID * (s.mouseX / window.innerWidth);
      const gridMouseY = GRID * (1 - s.mouseY / window.innerHeight);
      const maxDist = GRID * MOUSE_RADIUS;

      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const distSq = Math.pow(gridMouseX - i, 2) + Math.pow(gridMouseY - j, 2);
          if (distSq < maxDist * maxDist) {
            const idx = 4 * (i + GRID * j);
            const power = Math.min(maxDist / Math.sqrt(distSq), 10);
            d[idx] += MOUSE_STRENGTH * 100 * s.mouseVX * power;
            d[idx + 1] -= MOUSE_STRENGTH * 100 * s.mouseVY * power;
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
      canvasContainer.innerHTML = '';
      renderer.dispose();
    };
  }, [loading, items, loadVideoTexture, preloadVideo]);

  // Scroll — grid navigation + list navigation
  useEffect(() => {
    if (!items.length) return;
    const s = stateRef.current;

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - s.lastScrollTime < SCROLL_COOLDOWN) return;
      s.lastScrollTime = now;

      const direction = e.deltaY > 0 ? 1 : -1;

      if (s.isListView) {
        navigateList(direction);
      } else {
        if (s.transitioning) return;
        if (Math.abs(e.deltaY) < 30) return;
        navigateTo(s.currentIndex + direction);
      }
    };

    const handleKeyDown = (e) => {
      const direction =
        e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 :
        e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!direction) return;

      if (s.isListView) navigateList(direction);
      else navigateTo(s.currentIndex + direction);
    };

    const wrapper = document.getElementById('work-grid-root');
    if (wrapper) wrapper.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (wrapper) wrapper.removeEventListener('wheel', handleWheel);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [items, navigateTo, navigateList]);

  // Mouse
  useEffect(() => {
    const s = stateRef.current;
    const handleMouseMove = (e) => {
      s.mouseVX = (e.clientX - s.prevMouseX) * 0.003;
      s.mouseVY = (e.clientY - s.prevMouseY) * 0.003;
      s.prevMouseX = s.mouseX;
      s.prevMouseY = s.mouseY;
      s.mouseX = e.clientX;
      s.mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Toggle
  useEffect(() => {
    const btnGrid = document.querySelector('.btn-grid');
    const btnList = document.querySelector('.btn-list');
    if (!btnGrid || !btnList) return;

    const handleGrid = (e) => { e.stopPropagation(); switchToGrid(); };
    const handleList = (e) => { e.stopPropagation(); switchToList(); onSwitchToList?.(); };

    btnGrid.addEventListener('click', handleGrid);
    btnList.addEventListener('click', handleList);

    return () => {
      btnGrid.removeEventListener('click', handleGrid);
      btnList.removeEventListener('click', handleList);
    };
  }, [switchToGrid, switchToList, onSwitchToList]);

  // Click to open
  useEffect(() => {
    if (!items.length) return;
    const s = stateRef.current;
    const stack = document.querySelector('.video-stack');
    if (!stack) return;

    const handleClick = () => {
      if (s.transitioning) return;
      const item = itemsRef.current[s.currentIndex];
      if (item) window.dispatchEvent(new CustomEvent('work:open', { detail: item }));
    };

    stack.addEventListener('click', handleClick);
    return () => stack.removeEventListener('click', handleClick);
  }, [items]);

  return null;
}