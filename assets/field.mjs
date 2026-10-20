import { makeMoatBodies, stepWorld, keepOutside, seededRandom } from './physics.mjs?v=ff76b54c802c';

export function initField(element) {
  const canvas = element.querySelector('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  const readingArea = document.querySelector('[data-reading-area]');
  const toggle = document.querySelector('[data-motion]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reducedMotion.matches;
  try { paused ||= localStorage.getItem('alex-motion') === 'paused'; } catch { /* Storage may be disabled. */ }
  let width = 0, height = 0, bodies = [], obstacle, frame = 0, last = 0, elapsed = 0;
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false };
  let pointerTime = 0;

  function measureObstacle() {
    const rect = readingArea.getBoundingClientRect();
    const gap = width <= 650 ? 8 : 20;
    obstacle = { left: rect.left - gap, right: rect.right + gap, top: rect.top - gap, bottom: rect.bottom + gap };
    for (const body of bodies) keepOutside(body, obstacle, width, height);
  }
  function draw() {
    context.clearRect(0, 0, width, height);
    if (!obstacle) return;
    context.save();
    // A second, visual boundary keeps strokes out of the reading area too.
    context.beginPath(); context.rect(0, 0, width, height);
    context.rect(obstacle.left, obstacle.top, obstacle.right - obstacle.left, obstacle.bottom - obstacle.top);
    context.clip('evenodd');
    for (const body of bodies) {
      context.save(); context.translate(body.x, body.y); context.rotate(body.angle);
      const scale = body.r / 30;
      context.scale(scale, scale); context.globalAlpha = body.opacity;
      context.lineJoin = 'round'; context.lineCap = 'round';
      context.lineWidth = 1.3 / Math.sqrt(scale);
      context.strokeStyle = '#729cf3'; context.fillStyle = '#111f38';
      context.beginPath();
      context.moveTo(-24, -15); context.lineTo(-7, -5); context.lineTo(14, -24);
      context.lineTo(24, -17); context.lineTo(3, 0); context.lineTo(24, 17);
      context.lineTo(14, 24); context.lineTo(-7, 5); context.lineTo(-24, 15);
      context.lineTo(-15, 0); context.closePath(); context.fill(); context.stroke();
      context.beginPath();
      context.moveTo(-7, -5); context.lineTo(3, 0); context.lineTo(-7, 5);
      context.moveTo(14, -24); context.lineTo(15, -8);
      context.moveTo(14, 24); context.lineTo(15, 8);
      context.moveTo(-24, -15); context.lineTo(-7, 5);
      context.moveTo(-24, 15); context.lineTo(-7, -5);
      context.stroke(); context.restore();
    }
    context.restore();
  }
  function tick(now) {
    frame = 0;
    if (paused || document.hidden) return;
    const delta = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now; elapsed += delta;
    if (now - pointerTime > 80) { pointer.vx *= 0.8; pointer.vy *= 0.8; }
    stepWorld(bodies, { width, height, obstacle }, pointer, delta, elapsed);
    draw(); frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    toggle.textContent = paused ? 'resume motion' : 'pause motion';
    toggle.setAttribute('aria-pressed', String(paused));
    element.dataset.paused = String(paused); draw();
    if (!paused && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function resize() {
    const nextWidth = element.clientWidth, nextHeight = element.clientHeight;
    if (nextWidth < 4 || nextHeight < 4) return;
    const changed = nextWidth !== width || nextHeight !== height;
    width = nextWidth; height = nextHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    measureObstacle();
    if (changed || !bodies.length) bodies = makeMoatBodies(width, height, obstacle, seededRandom(93));
    draw();
  }
  window.addEventListener('pointermove', event => {
    const now = performance.now(), dt = Math.max((now - pointerTime) / 1000, 0.008);
    const { clientX: x, clientY: y } = event;
    pointer.vx = pointer.active ? (x - pointer.x) / dt : 0;
    pointer.vy = pointer.active ? (y - pointer.y) / dt : 0;
    pointer.x = x; pointer.y = y;
    pointer.active = !(x >= obstacle.left && x <= obstacle.right && y >= obstacle.top && y <= obstacle.bottom);
    pointerTime = now;
  }, { passive: true });
  const release = () => { pointer.active = false; };
  document.documentElement.addEventListener('pointerleave', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') release(); });
  window.addEventListener('blur', release);
  window.addEventListener('scroll', () => { release(); measureObstacle(); draw(); }, { passive: true });
  toggle.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('alex-motion', paused ? 'paused' : 'running'); } catch { /* Optional preference. */ }
    sync();
  });
  reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; sync(); });
  document.addEventListener('visibilitychange', () => { release(); sync(); });
  const observer = new ResizeObserver(resize);
  observer.observe(element); observer.observe(readingArea);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); });
  window.addEventListener('pageshow', () => { resize(); sync(); });
  resize(); sync();
}
