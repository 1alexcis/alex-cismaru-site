export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function seededRandom(seed = 73) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function makeBodies(width, height, random = Math.random, count = width < 400 ? 10 : 13) {
  return Array.from({ length: count }, (_, i) => {
    const angle = random() * Math.PI * 2;
    const radius = (i % 4 === 0 ? 39 : 17 + random() * 15) * Math.min(1, width / 440);
    return {
      x: (0.13 + (i % 3) * 0.34 + random() * 0.05) * width,
      y: (0.12 + Math.floor(i / 3) * 0.18 + random() * 0.04) * height,
      vx: Math.cos(angle) * 15, vy: Math.sin(angle) * 15,
      r: Math.max(6, radius), angle, spin: (random() - 0.5) * 0.3,
      phase: random() * 9, filled: i % 3 !== 1, opacity: 0.4 + random() * 0.55
    };
  });
}

export function fitBody(body, width, height) {
  const radius = Math.min(body.r, Math.max(1, Math.min(width, height) / 2 - 2));
  body.x = clamp(body.x, radius + 1, Math.max(radius + 1, width - radius - 1));
  body.y = clamp(body.y, radius + 1, Math.max(radius + 1, height - radius - 1));
  return radius;
}

export function keepOutside(body, obstacle, width, height) {
  if (!obstacle) return;
  const r = body.r + 2;
  const left = obstacle.left - r, right = obstacle.right + r;
  const top = obstacle.top - r, bottom = obstacle.bottom + r;
  if (body.x <= left || body.x >= right || body.y <= top || body.y >= bottom) return;
  const exits = [
    { axis: 'x', value: left, direction: -1, room: left >= body.r + 1 },
    { axis: 'x', value: right, direction: 1, room: right <= width - body.r - 1 },
    { axis: 'y', value: top, direction: -1, room: top >= body.r + 1 },
    { axis: 'y', value: bottom, direction: 1, room: bottom <= height - body.r - 1 }
  ].filter(exit => exit.room).sort((a, b) => Math.abs(body[a.axis] - a.value) - Math.abs(body[b.axis] - b.value));
  const exit = exits[0];
  if (!exit) return;
  body[exit.axis] = exit.value;
  const velocity = `v${exit.axis}`;
  if (body[velocity] * exit.direction < 0) body[velocity] *= -0.9;
}

export function makeMoatBodies(width, height, obstacle, random = Math.random) {
  const count = width > 1000 ? 16 : width > 650 ? 12 : 8;
  const gutter = Math.min(obstacle.left, width - obstacle.right);
  const maxRadius = Math.max(3, Math.min(30, (gutter - 6) / 2));
  const bodies = makeBodies(width, height, random, count);
  for (const [i, body] of bodies.entries()) {
    body.r = maxRadius * (0.55 + random() * 0.45);
    // Start on alternating sides so a narrow viewport has a balanced perimeter.
    body.x = i % 2 ? width - gutter / 2 : gutter / 2;
    body.y = height * (0.1 + random() * 0.8);
    if (i === 0 && obstacle.top > body.r * 2 + 6) {
      body.x = width * (0.2 + random() * 0.6); body.y = obstacle.top / 2;
    }
    if (i === 1 && height - obstacle.bottom > body.r * 2 + 6) {
      body.x = width * (0.2 + random() * 0.6); body.y = (height + obstacle.bottom) / 2;
    }
    body.vx *= 0.7; body.vy *= 0.7;
    body.opacity = 0.3 + random() * 0.35;
    fitBody(body, width, height); keepOutside(body, obstacle, width, height);
  }
  return bodies;
}

export function stepWorld(bodies, bounds, pointer, delta, time = 0) {
  const { width, height } = bounds;
  if (width < 4 || height < 4) return;
  const dt = clamp(delta, 0, 1 / 30);
  if (!dt) return;
  for (const b of bodies) {
    b.vx += Math.cos(time * 0.3 + b.phase) * 8 * dt;
    b.vy += Math.sin(time * 0.4 + b.phase) * 8 * dt;
    if (pointer?.active) {
      const dx = b.x - pointer.x, dy = b.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      const reach = 115 + b.r;
      if (distance < reach) {
        const safeDistance = Math.max(0.01, distance);
        const nx = distance > 0.01 ? dx / safeDistance : Math.cos(b.phase);
        const ny = distance > 0.01 ? dy / safeDistance : Math.sin(b.phase);
        const force = (1 - distance / reach) ** 2;
        b.vx += (nx * 1700 + clamp(pointer.vx || 0, -800, 800) * 1.2) * force * dt;
        b.vy += (ny * 1700 + clamp(pointer.vy || 0, -800, 800) * 1.2) * force * dt;
        b.spin += clamp((nx * (pointer.vy || 0) - ny * (pointer.vx || 0)) * 0.00001, -0.1, 0.1);
      }
    }
    const damping = Math.exp(-0.25 * dt);
    b.vx *= damping; b.vy *= damping;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 650) { b.vx *= 650 / speed; b.vy *= 650 / speed; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.angle += b.spin * dt;
    b.spin *= Math.exp(-0.06 * dt);
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const gap = a.r + b.r;
      if (distance >= gap) continue;
      const nx = distance > 0.001 ? dx / distance : 1;
      const ny = distance > 0.001 ? dy / distance : 0;
      const massA = a.r * a.r, massB = b.r * b.r, total = massA + massB;
      const overlap = gap - distance + 0.1;
      a.x -= nx * overlap * massB / total; a.y -= ny * overlap * massB / total;
      b.x += nx * overlap * massA / total; b.y += ny * overlap * massA / total;
      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative < 0) {
        const impulse = -1.85 * relative / (1 / massA + 1 / massB);
        a.vx -= impulse * nx / massA; a.vy -= impulse * ny / massA;
        b.vx += impulse * nx / massB; b.vy += impulse * ny / massB;
      }
    }
  }
  for (const b of bodies) {
    const r = Math.min(b.r, Math.max(1, Math.min(width, height) / 2 - 2));
    if (b.x <= r + 1 && b.vx < 0 || b.x >= width - r - 1 && b.vx > 0) b.vx *= -0.88;
    if (b.y <= r + 1 && b.vy < 0 || b.y >= height - r - 1 && b.vy > 0) b.vy *= -0.88;
    fitBody(b, width, height);
    keepOutside(b, bounds.obstacle, width, height);
  }
}

export function scatter(bodies, width, height, random = Math.random) {
  for (const b of bodies) {
    const angle = Math.atan2(b.y - height / 2, b.x - width / 2) + (random() - 0.5) * 0.5;
    const speed = 190 + random() * 210;
    b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed;
    b.spin = (random() - 0.5) * 2;
  }
}
