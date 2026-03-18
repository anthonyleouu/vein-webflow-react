import { useEffect, useRef, useState } from 'react';
import {
  Renderer, Camera, Transform, Program, Mesh, Plane, Texture
} from 'ogl';
import './ArchiveCanvas.css';

const GAP = 10;
const MASONRY_OFFSETS = [0, 0.3, 0.15, 0.45, 0.22, 0.38, 0.08, 0.52];

const vertexShader = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpeed;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * uSpeed * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D tMap;
  uniform vec2 uImageSizes;
  uniform vec2 uPlaneSizes;
  varying vec2 vUv;
  void main() {
    vec2 ratio = vec2(
      min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
      min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
    );
    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
    gl_FragColor = texture2D(tMap, uv);
  }
`;

export default function ArchiveCanvas() {
  const containerRef = useRef(null);
  const stateRef = useRef({
    x: 0, y: 0,
    vx: 0, vy: 0,
    dragging: false,
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    dragStartX: 0, dragStartY: 0,
    speed: 0,
    targetSpeed: 0,
    items: [],
    hoveredSlug: null,
  });
  const [cursorLabel, setCursorLabel] = useState('DRAG OR CLICK');
  const [cursorPos, setCursorPos] = useState({ x: -200, y: -200 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArchive() {
      try {
        const res = await fetch('https://vein-webflow-react.vercel.app/api/archive');
        const data = await res.json();
        const items = data.items || [];
        stateRef.current.items = items;
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch archive:', err);
        setLoading(false);
      }
    }
    fetchArchive();
  }, []);

  useEffect(() => {
    if (loading) return;
    const container = containerRef.current;
    if (!container) return;
    const s = stateRef.current;
    const items = s.items;
    if (!items.length) return;

    // --- OGL Setup ---
    const renderer = new Renderer({
      alpha: true,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2)
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 1);
    container.appendChild(gl.canvas);
    gl.canvas.style.position = 'absolute';
    gl.canvas.style.top = '0';
    gl.canvas.style.left = '0';

    const camera = new Camera(gl);
    camera.fov = 45;
    camera.position.z = 20;

    const scene = new Transform();

    const geometry = new Plane(gl, {
      heightSegments: 20,
      widthSegments: 40
    });

    let W = container.clientWidth;
    let H = container.clientHeight;

    const getViewport = () => {
      const fov = (camera.fov * Math.PI) / 180;
      const height = 2 * Math.tan(fov / 2) * camera.position.z;
      const width = height * (W / H);
      return { width, height };
    };

    renderer.setSize(W, H);
    camera.perspective({ aspect: W / H });
    let viewport = getViewport();

    // Block size in viewport units
    const getBlockSize = () => {
      const bw = (W * 0.3 / W) * viewport.width;
      const bh = (H * 0.7 / H) * viewport.height;
      return { bw, bh };
    };

    // Create a mesh for each item
    const meshes = [];

    items.forEach((item, i) => {
      const texture = new Texture(gl, { generateMipmaps: false });
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = item.image;
      img.onload = () => {
        texture.image = img;
        const mesh = meshes.find(m => m.userData.id === item.id);
        if (mesh) {
          mesh.program.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
        }
      };

      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          tMap: { value: texture },
          uImageSizes: { value: [1, 1] },
          uPlaneSizes: { value: [1, 1] },
          uTime: { value: Math.random() * 100 },
          uSpeed: { value: 0 },
        },
        transparent: false,
        depthTest: false,
        depthWrite: false,
      });

      const mesh = new Mesh(gl, { geometry, program });
      mesh.userData = { id: item.id, slug: item.slug, name: item.name, index: i };
      mesh.setParent(scene);
      meshes.push(mesh);
    });

    // Position meshes based on canvas offset
    const updateMeshPositions = () => {
      const { bw, bh } = getBlockSize();
      const gapVW = (GAP / W) * viewport.width;
      const gapVH = (GAP / H) * viewport.height;
      const cellW = bw + gapVW;
      const cellH = bh + gapVH;
      const totalItems = items.length;

      // We render a grid of cols x rows around the camera
      const cols = Math.ceil(viewport.width / cellW) + 6;
      const rows = Math.ceil(viewport.height / cellH) + 6;

      const offsetX = (s.x / W) * viewport.width;
      const offsetY = (s.y / H) * viewport.height;

      const startCol = Math.floor(-offsetX / cellW) - 2;
      const startRow = Math.floor(offsetY / cellH) - 2;

      let meshIndex = 0;
      const needed = cols * rows;

      // Expand meshes pool if needed
      while (meshes.length < needed) {
        const i = meshes.length % totalItems;
        const item = items[i];
        const texture = new Texture(gl, { generateMipmaps: false });
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.image;
        img.onload = () => { texture.image = img; };

        const program = new Program(gl, {
          vertex: vertexShader,
          fragment: fragmentShader,
          uniforms: {
            tMap: { value: texture },
            uImageSizes: { value: [800, 600] },
            uPlaneSizes: { value: [bw, bh] },
            uTime: { value: Math.random() * 100 },
            uSpeed: { value: 0 },
          },
          transparent: false,
          depthTest: false,
          depthWrite: false,
        });

        const mesh = new Mesh(gl, { geometry, program });
        mesh.userData = { id: item.id, slug: item.slug, name: item.name, index: meshes.length };
        mesh.setParent(scene);
        meshes.push(mesh);
      }

      for (let col = startCol; col < startCol + cols; col++) {
        const masonryOffsetFraction = MASONRY_OFFSETS[((col % MASONRY_OFFSETS.length) + MASONRY_OFFSETS.length) % MASONRY_OFFSETS.length];
        const masonryOffsetVH = masonryOffsetFraction * cellH;

        for (let row = startRow; row < startRow + rows; row++) {
          if (meshIndex >= meshes.length) break;
          const mesh = meshes[meshIndex];
          const itemIndex = (((col * 3 + row * 7) % totalItems) + totalItems) % totalItems;
          const item = items[itemIndex];

          // Update texture if item changed
          if (mesh.userData.id !== item.id) {
            mesh.userData = { ...mesh.userData, id: item.id, slug: item.slug, name: item.name };
            const texture = new Texture(gl, { generateMipmaps: false });
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = item.image;
            img.onload = () => { texture.image = img; };
            mesh.program.uniforms.tMap.value = texture;
          }

          const posX = col * cellW + offsetX + bw / 2 - viewport.width / 2;
          const posY = -(row * cellH) + offsetY - bh / 2 + viewport.height / 2 - masonryOffsetVH;

          mesh.position.x = posX;
          mesh.position.y = posY;
          mesh.scale.x = bw;
          mesh.scale.y = bh;
          mesh.program.uniforms.uPlaneSizes.value = [bw, bh];
          mesh.program.uniforms.uTime.value += 0.04;
          mesh.program.uniforms.uSpeed.value = s.speed;

          meshIndex++;
        }
      }

      // Hide unused meshes
      for (let i = meshIndex; i < meshes.length; i++) {
        meshes[i].position.x = 99999;
      }
    };

    // Hit testing — convert screen coords to grid item
    const getItemAtScreenPos = (px, py) => {
      const { bw, bh } = getBlockSize();
      const gapVW = (GAP / W) * viewport.width;
      const gapVH = (GAP / H) * viewport.height;
      const cellW = bw + gapVW;
      const cellH = bh + gapVH;
      const totalItems = items.length;

      const offsetX = (s.x / W) * viewport.width;
      const offsetY = (s.y / H) * viewport.height;

      const startCol = Math.floor(-offsetX / cellW) - 2;
      const startRow = Math.floor(offsetY / cellH) - 2;
      const cols = Math.ceil(viewport.width / cellW) + 6;
      const rows = Math.ceil(viewport.height / cellH) + 6;

      // Convert screen px to viewport coords
      const vpx = ((px / W) - 0.5) * viewport.width;
      const vpy = (0.5 - (py / H)) * viewport.height;

      for (let col = startCol; col < startCol + cols; col++) {
        const masonryOffsetFraction = MASONRY_OFFSETS[((col % MASONRY_OFFSETS.length) + MASONRY_OFFSETS.length) % MASONRY_OFFSETS.length];
        const masonryOffsetVH = masonryOffsetFraction * cellH;

        for (let row = startRow; row < startRow + rows; row++) {
          const posX = col * cellW + offsetX - viewport.width / 2;
          const posY = -(row * cellH) + offsetY + viewport.height / 2 - masonryOffsetVH;

          if (
            vpx >= posX && vpx <= posX + bw &&
            vpy >= posY - bh && vpy <= posY
          ) {
            const itemIndex = (((col * 3 + row * 7) % totalItems) + totalItems) % totalItems;
            return items[itemIndex];
          }
        }
      }
      return null;
    };

    // Animation loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (!s.dragging) {
        s.vx *= 0.96;
        s.vy *= 0.96;
        s.x += s.vx;
        s.y += s.vy;
      }

      // Speed for shader — ease to 0 when not dragging
      s.targetSpeed = s.dragging
        ? Math.min(Math.sqrt(s.vx * s.vx + s.vy * s.vy) * 0.08, 1.0)
        : 0;
      s.speed += (s.targetSpeed - s.speed) * 0.06;

      updateMeshPositions();
      renderer.render({ scene, camera });
    };
    animate();

    // Resize
    const onResize = () => {
      W = container.clientWidth;
      H = container.clientHeight;
      renderer.setSize(W, H);
      camera.perspective({ aspect: W / H });
      viewport = getViewport();
    };
    window.addEventListener('resize', onResize);

    // Input
    const getPos = e => e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

    const onDown = e => {
      const pos = getPos(e);
      s.dragging = true;
      s.startX = pos.x - s.x;
      s.startY = pos.y - s.y;
      s.lastX = pos.x;
      s.lastY = pos.y;
      s.dragStartX = pos.x;
      s.dragStartY = pos.y;
      s.vx = 0;
      s.vy = 0;
    };

    const onMove = e => {
      const pos = getPos(e);
      setCursorPos({ x: pos.x, y: pos.y });

      if (s.dragging) {
        s.vx = pos.x - s.lastX;
        s.vy = pos.y - s.lastY;
        s.x = pos.x - s.startX;
        s.y = pos.y - s.startY;
        s.lastX = pos.x;
        s.lastY = pos.y;
      } else {
        const found = getItemAtScreenPos(pos.x, pos.y);
        if (found) {
          setCursorLabel(found.name.toUpperCase());
          s.hoveredSlug = found.slug;
        } else {
          setCursorLabel('DRAG OR CLICK');
          s.hoveredSlug = null;
        }
      }
    };

    const onUp = e => {
      const pos = getPos(e);
      const moved = Math.hypot(pos.x - s.dragStartX, pos.y - s.dragStartY);
      s.dragging = false;

      if (moved < 8 && s.hoveredSlug) {
        window.location.href = `/archive/${s.hoveredSlug}`;
      }
    };

    const el = gl.canvas;
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('touchstart', onDown);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
    };
  }, [loading]);

  return (
    <div ref={containerRef} className="archive-canvas-wrapper">
      {loading && <div className="archive-loading">LOADING ARCHIVE...</div>}
      <div
        className="archive-cursor"
        style={{ left: cursorPos.x, top: cursorPos.y }}
      >
        <div className="archive-cursor-label">{cursorLabel}</div>
      </div>
    </div>
  );
}
