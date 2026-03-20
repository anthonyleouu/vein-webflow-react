import { useEffect, useRef, useState, useCallback } from 'react';

const ITEM_W = 0.52;
const ITEM_H = 0.62;
const GAP = 6;

function injectStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export default function ProjectGallery() {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  const itemsRef = useRef([]);       // DOM elements (video + images)
  const offsetRef = useRef(0);
  const snapTimerRef = useRef(null);
  const currentIndexRef = useRef(0);
  const readyRef = useRef(false);    // true once Barba transition hands off

  useEffect(() => {
    injectStyle('project-gallery-styles', `
      .pg-slider {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: none;
      }
      .pg-item {
        position: absolute;
        overflow: hidden;
        pointer-events: none;
      }
      .pg-item img,
      .pg-item video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    `);
  }, []);

  // Fetch project data by slug
  useEffect(() => {
    const slug = window.location.pathname.replace('/work/', '').replace(/\/$/, '');
    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        const found = (data.items || []).find(i => i.slug === slug);
        setProject(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Build slider DOM inside .project-gallery
  useEffect(() => {
    if (loading || !project) return;

    const gallery = document.querySelector('.project-gallery');
    if (!gallery) return;

    // Clear placeholder
    gallery.innerHTML = '';
    itemsRef.current = [];

    // Create slider container
    const slider = document.createElement('div');
    slider.className = 'pg-slider';
    gallery.appendChild(slider);

    // First item = video
    const videoWrap = document.createElement('div');
    videoWrap.className = 'pg-item';
    videoWrap.dataset.index = '0';
    const video = document.createElement('video');
    video.src = project.videoUrl;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.crossOrigin = 'anonymous';
    videoWrap.appendChild(video);
    slider.appendChild(videoWrap);
    itemsRef.current.push(videoWrap);

    // Remaining items = gallery images
    (project.gallery || []).forEach((url, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'pg-item';
      wrap.dataset.index = String(i + 1);
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      wrap.appendChild(img);
      slider.appendChild(wrap);
      itemsRef.current.push(wrap);
    });

    // Expose video element for Barba transition handoff
    window.__projectVideo = video;
    window.__projectSliderReady = false;

    // Position all items — video starts center, others spread out
    positionItems(0, false);

  }, [loading, project]);

  const positionItems = useCallback((offset, animated = false) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const itemW = W * ITEM_W;
    const itemH = H * ITEM_H;
    const step = itemW + GAP;
    const centerX = (W - itemW) / 2;
    const centerY = (H - itemH) / 2;
    const total = itemsRef.current.length;
    if (!total) return;
    const bandW = total * step;

    itemsRef.current.forEach((el, i) => {
      if (!el) return;
      let rawX = centerX + (i * step) - offset;
      const rel = rawX - centerX;
      const wrappedRel = ((rel % bandW) + bandW) % bandW;
      const finalRel = wrappedRel > bandW / 2 ? wrappedRel - bandW : wrappedRel;
      rawX = centerX + finalRel;

      if (animated && window.gsap) {
        window.gsap.to(el, {
          x: rawX, y: centerY,
          width: itemW, height: itemH,
          duration: 0.6, ease: 'power3.out',
          overwrite: true,
        });
      } else {
        Object.assign(el.style, {
          left:   '0px',
          top:    '0px',
          width:  itemW + 'px',
          height: itemH + 'px',
          transform: `translate(${rawX}px, ${centerY}px)`,
        });
      }
    });
  }, []);

  const getClosestIndex = useCallback((offset) => {
    const W = window.innerWidth;
    const itemW = W * ITEM_W;
    const step = itemW + GAP;
    const total = itemsRef.current.length;
    const bandW = total * step;
    const centerX = (W - itemW) / 2;
    let closest = 0, minDist = Infinity;
    for (let i = 0; i < total; i++) {
      let rawX = centerX + (i * step) - offset;
      const rel = rawX - centerX;
      const wrappedRel = ((rel % bandW) + bandW) % bandW;
      const finalRel = wrappedRel > bandW / 2 ? wrappedRel - bandW : wrappedRel;
      rawX = centerX + finalRel;
      const dist = Math.abs(rawX + itemW / 2 - W / 2);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    return closest;
  }, []);

  const snapToClosest = useCallback(() => {
    const W = window.innerWidth;
    const itemW = W * ITEM_W;
    const step = itemW + GAP;
    const total = itemsRef.current.length;
    const bandW = total * step;
    const closest = getClosestIndex(offsetRef.current);
    currentIndexRef.current = closest;
    let targetOffset = closest * step;
    const diff = ((targetOffset - offsetRef.current + bandW * 10) % bandW);
    const shortDiff = diff > bandW / 2 ? diff - bandW : diff;
    targetOffset = offsetRef.current + shortDiff;
    if (window.gsap) {
      window.gsap.to(offsetRef, {
        current: targetOffset,
        duration: 0.6, ease: 'power3.out',
        onUpdate: () => {
          offsetRef.current = ((offsetRef.current % bandW) + bandW) % bandW;
          positionItems(offsetRef.current);
        },
        onComplete: () => {
          offsetRef.current = ((offsetRef.current % bandW) + bandW) % bandW;
        }
      });
    }
  }, [getClosestIndex, positionItems]);

  // Wheel handler — same mechanic as list view
  useEffect(() => {
    if (loading || !project) return;

    const handleWheel = (e) => {
      e.preventDefault();
      if (!readyRef.current) return;

      const W = window.innerWidth;
      const itemW = W * ITEM_W;
      const step = itemW + GAP;
      const total = itemsRef.current.length;
      const bandW = total * step;
      const momentum = e.deltaY * 4;
      const targetOffset = offsetRef.current + momentum;

      if (window.gsap) {
        window.gsap.killTweensOf(offsetRef);
        window.gsap.to(offsetRef, {
          current: targetOffset,
          duration: 0.8, ease: 'power3.out', overwrite: true,
          onUpdate: () => {
            offsetRef.current = ((offsetRef.current % bandW) + bandW) % bandW;
            positionItems(offsetRef.current);
          },
        });
      } else {
        offsetRef.current = ((targetOffset % bandW) + bandW) % bandW;
        positionItems(offsetRef.current);
      }

      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => snapToClosest(), 500);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      clearTimeout(snapTimerRef.current);
    };
  }, [loading, project, positionItems, snapToClosest]);

  // Expose slider controls for Barba transition
  useEffect(() => {
    if (loading || !project) return;

    // Called by Barba enter — animates gallery items in from sides
    window.__projectSliderEnter = function() {
      readyRef.current = true;
      const total = itemsRef.current.length;
      if (!total) return;

      // Video (index 0) is already positioned center by Barba transition
      // Animate remaining items in from sides with stagger
      itemsRef.current.forEach((el, i) => {
        if (i === 0) return; // video handled by Barba
        const W = window.innerWidth;
        const H = window.innerHeight;
        const itemW = W * ITEM_W;
        const itemH = H * ITEM_H;
        const step = itemW + GAP;
        const centerX = (W - itemW) / 2;
        const centerY = (H - itemH) / 2;
        const rawX = centerX + (i * step) - offsetRef.current;
        const side = i % 2 === 0 ? 1 : -1;

        // Start offscreen to the side
        Object.assign(el.style, {
          left: '0px', top: '0px',
          width: itemW + 'px', height: itemH + 'px',
          transform: `translate(${rawX + side * window.innerWidth}px, ${centerY}px)`,
          opacity: '0',
        });

        if (window.gsap) {
          window.gsap.to(el, {
            x: rawX, y: centerY,
            opacity: 1,
            duration: 0.8,
            ease: 'power3.out',
            delay: 0.1 + i * 0.08,
            overwrite: true,
          });
        }
      });
    };

    // Called by Barba leave — returns the video's current position/size
    window.__projectSliderLeave = function() {
      const el = itemsRef.current[0];
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        videoEl: el.querySelector('video'),
      };
    };

    return () => {
      window.__projectSliderEnter = null;
      window.__projectSliderLeave = null;
      window.__projectVideo = null;
    };
  }, [loading, project]);

  return null;
}