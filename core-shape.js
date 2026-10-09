/* A single elastic silhouette: contact moves its boundary; it never punches a hole. */
const TAU = Math.PI * 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const angleDelta = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function spring(state, target, dt, stiffness, damping) {
  // Small fixed substeps keep the response consistent after an occasional slow frame.
  const steps = Math.max(1, Math.ceil(dt / .008));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * h;
    state.value += state.velocity * h;
  }
}

export function createCoreShape({ radius = 104 } = {}) {
  radius = Math.max(12, Number(radius) || 104);
  const count = 192;
  const x = new Float32Array(count), y = new Float32Array(count);
  const dent = { value: 0, velocity: 0 };
  const drift = { value: 0, velocity: 0 };
  const direction = { value: 0, velocity: 0 };
  const spread = { value: .48, velocity: 0 };
  let approach = 0;

  function update(pointer, strength = 0, delta = 1 / 60, time = 0, energy = 0) {
    const px = Number(pointer?.x) || 0, py = Number(pointer?.y) || 0;
    const distance = Math.hypot(px, py);
    strength = clamp(Number(strength) || 0, 0, 1);
    const dt = clamp(Number(delta) || 0, 0, .06);
    // At the center the approach side remains stable, rather than flipping with noise.
    if (distance > radius * .25 && strength > .001) approach = Math.atan2(py, px);
    const desiredDirection = direction.value + angleDelta(approach - direction.value);
    spring(direction, desiredDirection, dt, 115, 22);

    const penetration = clamp(radius - distance + radius * .23, 0, radius * .58);
    const deepPress = clamp((radius * .76 - distance) / (radius * .76), 0, 1);
    const contact = clamp((radius * 1.43 - distance) / (radius * 1.43), 0, 1);
    const targetDrift = (radius * .18 * contact + radius * .29 * deepPress) * strength;
    spring(dent, penetration * strength, dt, 205, 24);
    spring(drift, targetDrift, dt, 145, 22);
    spring(spread, .45 + deepPress * .23, dt, 110, 21);

    const depth = clamp(dent.value, 0, radius * .64);
    const shift = clamp(drift.value, 0, radius * .51);
    const sigma = clamp(spread.value, .43, .72);
    const dx = -Math.cos(direction.value) * shift;
    const dy = -Math.sin(direction.value) * shift;
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU;
      const local = angleDelta(angle - direction.value);
      const notch = Math.exp(-.5 * (local / sigma) ** 2);
      const shoulderWidth = sigma * .42;
      const shoulderA = Math.exp(-.5 * ((local - sigma * 1.65) / shoulderWidth) ** 2);
      const shoulderB = Math.exp(-.5 * ((local + sigma * 1.65) / shoulderWidth) ** 2);
      const ripple = Math.sin(angle * 7 + time * .73) * .39 +
        Math.sin(angle * 13 - time * .51) * .15 +
        Math.sin(angle * 5 + time * .91) * clamp(energy, 0, 1) * .10;
      const r = Math.max(radius * .30, radius - depth * notch + depth * .105 * (shoulderA + shoulderB) + ripple);
      x[i] = Math.cos(angle) * r + dx;
      y[i] = Math.sin(angle) * r + dy;
    }
  }

  function trace(ctx, offset = 0) {
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      let px = x[i], py = y[i];
      if (offset) {
        const previous = (i + count - 1) % count, next = (i + 1) % count;
        const tx = x[next] - x[previous], ty = y[next] - y[previous];
        const length = Math.hypot(tx, ty) || 1;
        // Offset along the outward boundary normal, including the concave contact dent.
        px += ty / length * offset; py -= tx / length * offset;
      }
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  update(null, 0, 0, 0, 0);
  return { update, trace };
}
