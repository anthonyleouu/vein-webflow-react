import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

const vertexShader = `
uniform float time;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
uniform sampler2D uDataTexture;
uniform sampler2D uTexture;
uniform vec4 resolution;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  vec4 offset = texture2D(uDataTexture, vUv);
  gl_FragColor = texture2D(uTexture, uv - 0.02 * offset.rg);
}`;

const GRID = 20;
const MOUSE = 0.1;
const STRENGTH = 0.03;
const RELAXATION = 0.9;
const SCROLL_COOLDOWN = 900;
const LIST_ITEM_W = 0.4;
const LIST_ITEM_H = 0.45;
const LIST_GAP = 6;

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
  const listOffsetRef = useRef(0);
  const listSnapTimerRef = useRef(null);
  const threeRef = useRef({});

  const stateRef = useRef({
    currentIndex: 0,
    transitioning: false,
    lastScrollTime: 0,
    isListView: false,
  });

  const mouseRef = useRef({
    x: 0, y: 0, prevX: 0, prevY: 0, vX: 0, vY: 0
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
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        transition: opacity 0.8s ease;
      }
      .grid-video-item video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .work-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
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

  // Fetch items
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

  // Build video elements — each with its own hidden video
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
      wrapper.style.opacity = i === 0 ? '1' : '0';
      wrapper.style.zIndex = i === 0 ? '1' : '0';

      const video = document.createElement('video');
      video.src = item.videoUrl;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.crossOrigin = 'anonymous';

      wrapper.appendChild(video);
      stack.appendChild(wrapper);
      wrapperRefs.current[i] = wrapper;
      videoRefs.current[i] = video;
    });

    // Dark overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.15);
      z-index: 10; pointer-events: none;
    `;
    stack.appendChild(overlay);

    // Set initial UI text
    const titleEl = document.querySelector('.title-name');
    const counterEl = document.querySelector('.work-counter');
    if (titleEl) titleEl.textContent = items[0].name.toUpperCase();
    if (counterEl) counterEl.textContent = '[PROJECT 01]';
  }, [loading, items]);

  // Setup Three.js — mirrors GridDistortion.jsx exactly
  useEffect(() => {
    if (loading || !items.length) return;

    const container = document.querySelector('.work-canvas');
    if (!container) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(0, 0, 0, 0, -1000, 1000);
    camera.position.z = 2;

    const uniforms = {
      time: { value: 0 },
      resolution: { value: new THREE.Vector4() },
      uTexture: { value: null },
      uDataTexture: { value: null },
    };

    // Initialize data texture with random values — creates the load animation
    const size = GRID;
    const data = new Float32Array(4 * size * size);
// Start at zero — no green tint on load
    const dataTexture = new THREE.DataTexture(
      data, size, size, THREE.RGBAFormat, THREE.FloatType
    );
    dataTexture.needsUpdate = true;
    uniforms.uDataTexture.value = dataTexture;

    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
    });

    const geometry = new THREE.PlaneGeometry(1, 1, size - 1, size - 1);
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    // Load first video texture
    const loadTexture = (index) => {
      const video = videoRefs.current[index];
      if (!video) return;

      const apply = () => {
        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        uniforms.uTexture.value = texture;

        const rect = container.getBoundingClientRect();
        const W = rect.width || window.innerWidth;
        const H = rect.height || window.innerHeight;
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
        plane.scale.set(scaleX, scaleY, 1);
        video.play().catch(() => {});
      };

      if (video.readyState >= 1) {
        apply();
      } else {
        video.addEventListener('loadedmetadata', apply, { once: true });
      }
    };

    threeRef.current = {
      renderer, scene, camera, plane, uniforms,
      dataTexture, data, loadTexture,
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const W = rect.width || window.innerWidth;
      const H = rect.height || window.innerHeight;
      if (!W || !H) return;
      renderer.setSize(W, H);
      const aspect = W / H;
      const frustumH = 1;
      const frustumW = frustumH * aspect;
      camera.left = -frustumW / 2;
      camera.right = frustumW / 2;
      camera.top = frustumH / 2;
      camera.bottom = -frustumH / 2;
      camera.updateProjectionMatrix();
      uniforms.resolution.value.set(W, H, 1, 1);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);
    handleResize();
    loadTexture(0);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      uniforms.time.value += 0.05;

      const d = data;
      for (let i = 0; i < size * size; i++) {
        d[i * 4] *= RELAXATION;
        d[i * 4 + 1] *= RELAXATION;
      }

      const m = mouseRef.current;
      const gridMouseX = size * m.x;
      const gridMouseY = size * m.y;
      const maxDist = size * MOUSE;

      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const distSq = Math.pow(gridMouseX - i, 2) + Math.pow(gridMouseY - j, 2);
          if (distSq < maxDist * maxDist) {
            const idx = 4 * (i + size * j);
            const power = Math.min(maxDist / Math.sqrt(distSq), 10);
            d[idx] += STRENGTH * 100 * m.vX * power;
            d[idx + 1] -= STRENGTH * 100 * m.vY * power;
          }
        }
      }

      dataTexture.needsUpdate = true;
      if (uniforms.uTexture.value) uniforms.uTexture.value.needsUpdate = true;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      container.innerHTML = '';
      renderer.dispose();
      renderer.forceContextLoss();
      geometry.dispose();
      material.dispose();
      dataTexture.dispose();
    };
  }, [loading, items]);

  // Mouse tracking — relative to container like GridDistortion.jsx
  useEffect(() => {
    const container = document.querySelector('.work-canvas');
    if (!container) return;

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      const m = mouseRef.current;
      m.vX = x - m.prevX;
      m.vY = y - m.prevY;
      Object.assign(m, { x, y, prevX: x, prevY: y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [loading]);

  // Navigate — blast data texture, swap videos, swap WebGL texture
  const navigateTo = useCallback((newIndex) => {
    const s = stateRef.current;
    const allItems = itemsRef.current;
    if (s.transitioning || !allItems.length || s.isListView) return;
    s.transitioning = true;

    const total = allItems.length;
    const wrapped = ((newIndex % total) + total) % total;
    const three = threeRef.current;

    // Blast distortion — same as homepage random init
    if (three.data && three.dataTexture) {
      for (let i = 0; i < GRID * GRID; i++) {
        three.data[i * 4] = (Math.random() - 0.5) * 30;
        three.data[i * 4 + 1] = (Math.random() - 0.5) * 30;
      }
      three.dataTexture.needsUpdate = true;
    }

    // Fade out current
    const currentWrapper = wrapperRefs.current[s.currentIndex];
    const nextWrapper = wrapperRefs.current[wrapped];

    if (currentWrapper) {
      currentWrapper.style.opacity = '0';
      currentWrapper.style.zIndex = '0';
    }

    setTimeout(() => {
      // Pause current video
      videoRefs.current[s.currentIndex]?.pause();

      // Show next video
      if (nextWrapper) {
        nextWrapper.style.zIndex = '1';
        nextWrapper.style.opacity = '1';
      }

      // Play next video and swap WebGL texture
      const nextVideo = videoRefs.current[wrapped];
      if (nextVideo) {
        nextVideo.play().catch(() => {});
        three.loadTexture?.(wrapped);
      }

      s.currentIndex = wrapped;
      updateUI(allItems[wrapped], wrapped);

      const nextIdx = ((wrapped + 1) % total + total) % total;
      const preloadVid = videoRefs.current[nextIdx];
      if (preloadVid && !preloadVid.src) {
        preloadVid.src = allItems[nextIdx].videoUrl;
      }

      setTimeout(() => { s.transitioning = false; }, 600);
    }, 400);
  }, [updateUI]);

  // List positions
  const applyListPositions = useCallback((offset, animated = false) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const itemW = W * LIST_ITEM_W;
    const itemH = H * LIST_ITEM_H;
    const step = itemW + LIST_GAP;
    const centerX = (W - itemW) / 2;
    const centerY = (H - itemH) / 2;
    const total = wrapperRefs.current.length;
    const bandW = total * step;

    wrapperRefs.current.forEach((wrapper, i) => {
      if (!wrapper) return;
      let rawX = centerX + (i * step) - offset;
      rawX = ((rawX - centerX + bandW * 10) % bandW) - bandW / 2 + centerX;
      const scaleX = itemW / W;
      const scaleY = itemH / H;
      const translateX = rawX - (W * (1 - scaleX)) / 2;
      const translateY = centerY - (H * (1 - scaleY)) / 2;

      if (animated && window.gsap) {
        window.gsap.to(wrapper, {
          x: translateX, y: translateY, scaleX, scaleY,
          opacity: 1, zIndex: 1, duration: 0.5,
          ease: 'power2.out', overwrite: true,
        });
      } else {
        wrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
        wrapper.style.opacity = '1';
        wrapper.style.zIndex = '1';
      }
    });
  }, []);

  const getClosestIndex = useCallback((offset) => {
    const W = window.innerWidth;
    const itemW = W * LIST_ITEM_W;
    const step = itemW + LIST_GAP;
    const total = itemsRef.current.length;
    let closest = 0, minDist = Infinity;
    for (let i = 0; i < total; i++) {
      const dist = Math.abs(i * step - offset + itemW / 2 - W / 2);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    return closest;
  }, []);

  const snapToClosest = useCallback(() => {
    const W = window.innerWidth;
    const itemW = W * LIST_ITEM_W;
    const step = itemW + LIST_GAP;
    const s = stateRef.current;
    const closest = getClosestIndex(listOffsetRef.current);
    s.currentIndex = closest;
    updateUI(itemsRef.current[closest], closest);
    if (window.gsap) {
      window.gsap.to(listOffsetRef, {
        current: closest * step,
        duration: 0.6, ease: 'power3.out',
        onUpdate: () => applyListPositions(listOffsetRef.current),
      });
    }
  }, [getClosestIndex, updateUI, applyListPositions]);

  const switchToList = useCallback(() => {
    const s = stateRef.current;
    if (s.isListView || !window.gsap) return;
    s.isListView = true;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const itemW = W * LIST_ITEM_W;
    const itemH = H * LIST_ITEM_H;
    const step = itemW + LIST_GAP;
    const centerX = (W - itemW) / 2;
    const centerY = (H - itemH) / 2;
    const total = wrapperRefs.current.length;

    listOffsetRef.current = s.currentIndex * step;

    // Play all videos
    videoRefs.current.forEach(v => v?.play().catch(() => {}));

    wrapperRefs.current.forEach((wrapper, i) => {
      if (!wrapper) return;
      const scaleX = itemW / W;
      const scaleY = itemH / H;
      let offset = i - s.currentIndex;
      if (offset > total / 2) offset -= total;
      if (offset < -total / 2) offset += total;
      const rawX = centerX + offset * step;
      const translateX = rawX - (W * (1 - scaleX)) / 2;
      const translateY = centerY - (H * (1 - scaleY)) / 2;
      window.gsap.to(wrapper, {
        x: translateX, y: translateY, scaleX, scaleY,
        opacity: 1, zIndex: 1, duration: 1.8,
        ease: 'power3.inOut', overwrite: true,
      });
    });

    const canvas = document.querySelector('.work-canvas');
    if (canvas) window.gsap.to(canvas, { opacity: 0, duration: 0.5 });
  }, []);

  const switchToGrid = useCallback(() => {
    const s = stateRef.current;
    if (!s.isListView || !window.gsap) return;
    s.isListView = false;

    wrapperRefs.current.forEach((wrapper, i) => {
      if (!wrapper) return;
      const isActive = i === s.currentIndex;
      window.gsap.to(wrapper, {
        x: 0, y: 0, scaleX: 1, scaleY: 1,
        opacity: isActive ? 1 : 0,
        zIndex: isActive ? 1 : 0,
        duration: 1.2, ease: 'power3.inOut', overwrite: true,
        onComplete: () => {
          if (!isActive) videoRefs.current[i]?.pause();
        },
      });
    });

    const canvas = document.querySelector('.work-canvas');
    if (canvas) window.gsap.to(canvas, { opacity: 1, duration: 0.8, delay: 0.5 });
  }, []);

  // Scroll
  useEffect(() => {
    if (!items.length) return;
    const s = stateRef.current;

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (s.isListView) {
        listOffsetRef.current += e.deltaY * 0.8;
        applyListPositions(listOffsetRef.current);
        clearTimeout(listSnapTimerRef.current);
        listSnapTimerRef.current = setTimeout(() => snapToClosest(), 150);
        return;
      }

      const now = Date.now();
      if (now - s.lastScrollTime < SCROLL_COOLDOWN) return;
      if (s.transitioning) return;
      if (Math.abs(e.deltaY) < 30) return;
      s.lastScrollTime = now;
      navigateTo(s.currentIndex + (e.deltaY > 0 ? 1 : -1));
    };

    const handleKeyDown = (e) => {
      const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
                : e.key === 'ArrowUp'   || e.key === 'ArrowLeft'  ? -1 : 0;
      if (!dir) return;
      if (s.isListView) {
        listOffsetRef.current += dir * (window.innerWidth * LIST_ITEM_W + LIST_GAP);
        applyListPositions(listOffsetRef.current, true);
        clearTimeout(listSnapTimerRef.current);
        listSnapTimerRef.current = setTimeout(() => snapToClosest(), 150);
      } else {
        navigateTo(s.currentIndex + dir);
      }
    };

    const wrapper = document.getElementById('work-grid-root');
    if (wrapper) wrapper.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (wrapper) wrapper.removeEventListener('wheel', handleWheel);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(listSnapTimerRef.current);
    };
  }, [items, navigateTo, applyListPositions, snapToClosest]);

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

  // Click to open project
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