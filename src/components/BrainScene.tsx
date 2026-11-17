import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BrainTrendArt } from './brand';

/**
 * Decorative 3D brain for the landing page, drawn procedurally (no model files).
 *
 * On load, scattered points fly in and assemble into two folded hemispheres and a
 * cerebellum; then faint connections and travelling signals fade in. The brain
 * turns slowly, follows the pointer, and drifts back as the page scrolls.
 *
 * It is an illustration of brain health in general. It shows no patient data and
 * never marks a region as a problem: the app measures task change, not where in
 * the brain something happens.
 *
 * Reduced motion: one still, assembled frame. Pauses when hidden or off screen.
 * Falls back to the flat logo art when WebGL is unavailable.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AQUA = new THREE.Color('#8ae3ea');
const TEAL = new THREE.Color('#2fb3a3');
const VIOLET = new THREE.Color('#a88cf0');

function brainPoints(count: number, r: () => number) {
  const pos: number[] = [];
  const start: number[] = [];
  const col: number[] = [];
  const size: number[] = [];
  const phase: number[] = [];
  const tmp = new THREE.Color();
  const pushPoint = (x: number, y: number, z: number, s: number) => {
    pos.push(x, y, z);
    // Start far out on a loose shell, so the brain assembles from a cloud.
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 3 + r() * 3.5;
    const q = Math.sqrt(1 - u * u);
    start.push(q * Math.cos(th) * rad, u * rad * 0.7, q * Math.sin(th) * rad);
    const tz = (z + 1.25) / 2.5;
    tmp.copy(AQUA).lerp(TEAL, Math.min(1, tz * 1.6));
    if (tz > 0.55) tmp.lerp(VIOLET, (tz - 0.55) / 0.45);
    col.push(tmp.r, tmp.g, tmp.b);
    size.push(s);
    phase.push(r() * Math.PI * 2);
  };

  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
    // Layered waves across the surface suggest folds without copying any atlas.
    const fold = Math.sin(dy * 9 + dz * 6 + side) * 0.5 + Math.sin(dz * 13 - dx * 5) * 0.35 + Math.sin(dx * 17 + dy * 4) * 0.15;
    const shell = 1 + 0.075 * fold;
    const interior = r() < 0.1 ? 0.55 + r() * 0.4 : 1;
    let x = dx * 0.6 * shell * interior;
    let y = dy * 0.74 * shell * interior;
    const z = dz * 1.02 * shell * interior;
    if (x * side < 0) x *= 0.3; // flat medial face, leaving a narrow fissure
    if (y < -0.32) y = -0.32 + (y + 0.32) * 0.45; // flatter base
    pushPoint(x + side * 0.24, y + 0.08, z, interior < 1 ? 0.55 : 0.8 + r() * 0.6);
  }
  for (let i = 0; i < count * 0.1; i += 1) {
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const stri = 1 + 0.06 * Math.sin(u * 40);
    pushPoint(s * Math.cos(th) * 0.62 * stri, -0.5 + u * 0.26 * stri, -0.78 + s * Math.sin(th) * 0.34, 0.7);
  }
  for (let i = 0; i < count * 0.025; i += 1) {
    const a = r() * Math.PI * 2;
    const h = r();
    pushPoint(Math.cos(a) * 0.12, -0.55 - h * 0.6, -0.42 + Math.sin(a) * 0.12 - h * 0.05, 0.6);
  }
  return { pos, start, col, size, phase };
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  attribute vec3 aStart;
  uniform float uTime;
  uniform float uPixel;
  uniform float uProgress;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // Each point arrives a little later than the last, so the shape sweeps in.
    float p = clamp(uProgress * 1.35 - aPhase / 6.2832 * 0.35, 0.0, 1.0);
    p = 1.0 - pow(1.0 - p, 3.0);
    vec3 pos = mix(aStart, position, p);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float tw = 0.72 + 0.28 * sin(uTime * 1.4 + aPhase);
    gl_PointSize = aSize * uPixel * tw * (3.2 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = tw * (0.35 + 0.65 * p);
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
  }
`;

/** A soft round glow drawn once on a canvas, used behind the brain for depth. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(70, 190, 200, 0.55)');
  grad.addColorStop(0.45, 'rgba(60, 120, 170, 0.18)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const ASSEMBLE_SECONDS = 2.8;

export default function BrainScene() {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return undefined;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    const rig = new THREE.Group();
    scene.add(rig);
    const brain = new THREE.Group();
    brain.rotation.set(0.18, -0.6, 0);
    rig.add(brain);

    const glowTex = glowTexture();
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(4.6, 4.6, 1);
    glow.position.z = -0.6;
    rig.add(glow);

    const r = rng(42);
    const pts = brainPoints(11000, r);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.pos, 3));
    geo.setAttribute('aStart', new THREE.Float32BufferAttribute(pts.start, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(pts.col, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(pts.size, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(pts.phase, 1));
    const uniforms = { uTime: { value: 0 }, uPixel: { value: dpr * 5.5 }, uProgress: { value: reduced ? 1 : 0 } };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    brain.add(new THREE.Points(geo, mat));

    // Local connections.
    const P = pts.pos;
    const n = P.length / 3;
    const linePos: number[] = [];
    for (let k = 0; k < 1100; k += 1) {
      const a = Math.floor(r() * n);
      for (let tries = 0; tries < 12; tries += 1) {
        const b = Math.floor(r() * n);
        const d = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
        if (d > 0.04 && d < 0.22) { linePos.push(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2]); break; }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x8ae3ea, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    brain.add(new THREE.LineSegments(lineGeo, lineMat));

    // Signals along arcs that bow outward over the surface.
    const arcs: THREE.QuadraticBezierCurve3[] = [];
    const arcPos: number[] = [];
    for (let k = 0; k < 48; k += 1) {
      const a = Math.floor(r() * n), b = Math.floor(r() * n);
      const A = new THREE.Vector3(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]);
      const B = new THREE.Vector3(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]);
      const d = A.distanceTo(B);
      if (d < 0.5 || d > 1.3) continue;
      const mid = A.clone().add(B).multiplyScalar(0.5);
      mid.multiplyScalar(1 + 0.55 * (1 - mid.length() / 1.1));
      const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
      arcs.push(curve);
      const seg = curve.getPoints(28);
      for (let i = 0; i < seg.length - 1; i += 1) arcPos.push(seg[i].x, seg[i].y, seg[i].z, seg[i + 1].x, seg[i + 1].y, seg[i + 1].z);
    }
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(arcPos, 3));
    const arcMat = new THREE.LineBasicMaterial({ color: 0xa88cf0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    brain.add(new THREE.LineSegments(arcGeo, arcMat));

    const pulseOffsets = arcs.map(() => r());
    const pulseSpeeds = arcs.map(() => 0.12 + r() * 0.18);
    const pulsePos = new Float32Array(arcs.length * 3);
    const pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
    pulseGeo.setAttribute('aStart', new THREE.BufferAttribute(new Float32Array(arcs.length * 3), 3));
    pulseGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(arcs.flatMap(() => [0.94, 0.99, 1]), 3));
    pulseGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(arcs.map(() => 3.4), 1));
    pulseGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(arcs.map(() => 0), 1));
    const pulseUniforms = { uTime: uniforms.uTime, uPixel: uniforms.uPixel, uProgress: { value: 1 } };
    const pulseMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: pulseUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pulses = new THREE.Points(pulseGeo, pulseMat);
    pulses.visible = false;
    brain.add(pulses);

    const setPulses = (time: number) => {
      const v = new THREE.Vector3();
      arcs.forEach((c, i) => {
        c.getPoint((pulseOffsets[i] + time * pulseSpeeds[i]) % 1, v);
        pulsePos.set([v.x, v.y, v.z], i * 3);
      });
      pulseGeo.attributes.position.needsUpdate = true;
    };

    // Framing: a close-up that fills the hero, set to one side on wide screens.
    const frame = { baseZ: 3.1, x: 0.95, y: 0 };
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const wide = w / h > 1.15;
      // Half the visible height at distance z is z * tan(17deg); on narrow screens the width decides.
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(17));
      frame.baseZ = wide ? 3.45 : Math.max(4.3, 1.08 / (tanHalf * (w / h)));
      frame.x = wide ? Math.min(1.0, 0.5 + (w / h - 1.15) * 0.55) : 0;
      // Narrow screens: the brain sits in the upper part, above the text.
      frame.y = wide ? -0.08 : frame.baseZ * tanHalf * 0.42;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    let scroll = 0;
    const onScroll = () => { scroll = Math.min(1, window.scrollY / Math.max(1, el.clientHeight)); };
    window.addEventListener('scroll', onScroll, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    io.observe(el);

    const place = (t: number, progress: number) => {
      const settle = 1 - Math.pow(1 - progress, 3);
      // Dolly in while assembling, then drift back and turn as the page scrolls.
      camera.position.set(0, 0.1, frame.baseZ + (1 - settle) * 2.2 + scroll * 1.6);
      camera.lookAt(0, 0, 0);
      // In Arabic the text is on the right, so the brain moves to the left.
      const side = document.documentElement.dir === 'rtl' ? -1 : 1;
      rig.position.set(frame.x * side, frame.y - scroll * 0.35, 0);
      brain.rotation.y = -0.6 + t * 0.12 + pointer.x * 0.22 + scroll * 0.9;
      brain.rotation.x = 0.18 + Math.sin(t * 0.4) * 0.05 + pointer.y * 0.1;
      brain.scale.setScalar(1 + Math.sin(t * 0.9) * 0.012);
      const after = Math.max(0, (progress - 0.75) / 0.25);
      lineMat.opacity = 0.14 * after;
      arcMat.opacity = 0.12 * after;
      glowMat.opacity = 0.9 * settle * (1 - scroll * 0.6);
      pulses.visible = after > 0.5;
    };

    const start = performance.now();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      const t = (performance.now() - start) / 1000;
      const progress = Math.min(1, t / ASSEMBLE_SECONDS);
      uniforms.uTime.value = t;
      uniforms.uProgress.value = progress;
      place(t, progress);
      setPulses(t);
      renderer.render(scene, camera);
    };
    if (reduced) {
      place(0, 1);
      setPulses(0.35);
      pulses.visible = true;
      renderer.render(scene, camera);
    } else {
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      [geo, lineGeo, arcGeo, pulseGeo].forEach((g) => g.dispose());
      [mat, lineMat, arcMat, pulseMat, glowMat].forEach((m) => m.dispose());
      glowTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (failed) return <div className="brain-scene brain-fallback"><BrainTrendArt /></div>;
  return <div ref={host} className="brain-scene" />;
}
