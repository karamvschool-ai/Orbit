/* Orbit's singularity combines animated geometry with shaded orbital sprites. */
import { createCoreField } from './core-field.js';
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mix = (a, b, t) => a + (b - a) * t;

function randomSource(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function sampleCurve(points, t) {
  const position = t * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(position));
  const u = position - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i];
  const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  const component = axis => .5 * ((2 * p1[axis]) + (-p0[axis] + p2[axis]) * u +
    (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * u2 +
    (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * u3);
  return [component(0), component(1)];
}

export function createSingularity(canvas, { getEnergy = () => 0, getMotion = () => true, getInteraction = () => true, getState = () => 'idle' } = {}) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { destroy() {} };
  const coreField = createCoreField();
  const orbitalImage = new Image();
  orbitalImage.decoding = 'async';
  orbitalImage.src = new URL('./assets/orbital-sphere.png',import.meta.url).href;
  const random = randomSource(34017);
  let width = 0, height = 0, dpr = 1, scale = 1, centerX = 0, centerY = 0;
  let frame = 0, destroyed = false, phase = 0, lastTime = 0, energy = 0, pressStrength = 0;
  const pointer = { x: 0, y: 0, clientX: null, clientY: null, targetX: 0, targetY: 0, presence: 0, targetPresence: 0 };
  const satellites = [
    { a: 178, b: 125, tilt: 35 * Math.PI / 180, angle: 3.294, period: 20, direction: 1, radius: 11.4 },
    { a: 192, b: 135, tilt: -27 * Math.PI / 180, angle: 3.062, period: 20, direction: 1, radius: 12.1 },
    { a: 150, b: 110, tilt: 17 * Math.PI / 180, angle: .435, period: 20, direction: 1, radius: 12 },
  ];
  const particles = Array.from({ length: 225 }, (_, i) => ({
    angle: random() * TAU,
    radius: 110 + random() ** .78 * 109,
    speed: (random() - .5) * .085,
    squash: .88 + random() * .12,
    size: i % 37 === 0 ? 1.65 : .35 + random() * .67,
    alpha: .25 + random() * .62,
    offset: random() * TAU,
  }));
  const dust = Array.from({ length: 105 }, () => ({
    x: (random() - .5) * 800,
    y: (random() - .5) * 510,
    radius: .3 + random() * .65,
    alpha: .10 + random() * .42,
    phase: random() * TAU,
  }));
  const ribbons = [
    { p: [[-740,-91],[-539,-214],[-451,-218],[-334,-99],[-236,-77],[-140,-80],[-50,-37]], spread: 17, bend: 16, alpha: .54, strands: 19 },
    { p: [[-795,85],[-608,-136],[-473,-50],[-370,40],[-208,6],[-94,-22],[20,15]], spread: 23, bend: 30, alpha: .27, strands: 12 },
    { p: [[-850,130],[-555,51],[-402,5],[-248,2],[-110,1],[19,-14]], spread: 13, bend: 17, alpha: .26, strands: 9 },
    { p: [[-236,-310],[-235,-252],[-206,-192],[-158,-158],[-78,-132],[-28,-59]], spread: 24, bend: 19, alpha: .62, strands: 20 },
    { p: [[-166,-365],[-192,-280],[-170,-197],[-99,-167],[-39,-108],[9,-14]], spread: 16, bend: 14, alpha: .29, strands: 11 },
    { p: [[-54,48],[-118,85],[-166,145],[-245,164],[-308,198],[-418,280]], spread: 29, bend: 24, alpha: .38, strands: 16 },
    { p: [[-62,24],[-155,90],[-185,165],[-240,191],[-353,179],[-487,219]], spread: 23, bend: 15, alpha: .25, strands: 11 },
    { p: [[38,22],[151,-11],[236,-85],[304,-60],[384,29],[488,89],[656,130]], spread: 23, bend: 24, alpha: .55, strands: 21 },
    { p: [[64,-14],[184,-73],[259,-74],[331,22],[474,129],[636,231],[848,221]], spread: 31, bend: 14, alpha: .34, strands: 15 },
    { p: [[24,77],[103,115],[182,137],[228,187],[271,213],[356,228],[438,352]], spread: 25, bend: 22, alpha: .51, strands: 19 },
    { p: [[8,105],[131,169],[222,161],[257,185],[311,255],[350,368]], spread: 19, bend: 21, alpha: .25, strands: 12 },
    { p: [[51,-17],[112,-93],[170,-125],[202,-160],[179,-203],[107,-215]], spread: 14, bend: 13, alpha: .22, strands: 10 },
    { p: [[-242,-178],[-180,-154],[-127,-167],[-72,-129],[-25,-79]], spread: 11, bend: 10, alpha: .54, strands: 10 },
    { p: [[-151,91],[-106,106],[-78,152],[-19,136],[21,99],[0,43]], spread: 13, bend: 10, alpha: .45, strands: 10 },
    { p: [[126,46],[174,-44],[136,-128],[91,-144],[58,-90]], spread: 11, bend: 10, alpha: .44, strands: 8 },
  ].map((ribbon, i) => ({
    ...ribbon,
    inkStrength: [.28,.16,0,.74,.24,.32,0,.27,.17,.42,0,.23,.52,.44,.50][i],
    phase: i * 1.71,
    samples: Array.from({ length: 88 }, (_, n) => sampleCurve(ribbon.p, n / 87)),
  }));

  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    scale = width <= 900 ? Math.min(width * .0015, height / 850, 1) : Math.min(width / 1672, height / 941);
    centerX = width * (width <= 900 ? .50 : .495);
    centerY = height * (width <= 900 ? .42 : .46);
    if (pointer.clientX !== null) {
      pointer.targetX = (pointer.clientX - centerX) / scale;
      pointer.targetY = (pointer.clientY - centerY) / scale;
    }
  }
  function onPointer(event) {
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    pointer.targetX = (event.clientX - centerX) / scale;
    pointer.targetY = (event.clientY - centerY) / scale;
    pointer.targetPresence = 1;
  }
  function onLeave() { pointer.targetPresence = 0; }

  // A local repulsive field pushes and bends the finest filaments.
  function warp(x, y, strength = 1) {
    if (pointer.presence < .001) return [x, y];
    const dx = x - pointer.x, dy = y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const falloff = Math.max(0, 1 - distance / 190);
    const influence = falloff * falloff * pointer.presence * strength;
    const pull = influence * 22 / Math.max(distance, 22);
    return [x + dx * pull - dy * influence * .10, y + dy * pull + dx * influence * .10];
  }
  function drawRibbons(time) {
    ctx.lineCap = 'round';
    const listening = getState() === 'listening';
    const breath = listening ? Math.sin(time * 2.6) * 3 : Math.sin(time * .7) * 1.5;
    for (const ribbon of ribbons) {
      const major = ribbon.alpha >= .38 && ribbon.spread >= 16;
      // Every strand shares one smooth, slowly folding surface. Small edge
      // flutter adds detail without turning the whole stream into a tight coil.
      const centers = ribbon.samples.map((base, j) => {
        const t = j / (ribbon.samples.length - 1);
        const before = ribbon.samples[Math.max(0,j-1)], after = ribbon.samples[Math.min(ribbon.samples.length-1,j+1)];
        const dx = after[0] - before[0], dy = after[1] - before[1], length = Math.hypot(dx,dy) || 1;
        const envelope = Math.sin(Math.PI * t) ** .85;
        const displacement = (Math.sin(t * 4.8 - time * .95 + ribbon.phase) * ribbon.bend * 1.35 +
          Math.sin(time * .74 + ribbon.phase * .6) * (19 + breath)) * envelope * (1 + energy * .12);
        return { x: base[0] - dy / length * displacement, y: base[1] + dx / length * displacement, t, envelope };
      });
      const surface = centers.map((point, j) => {
        const before = centers[Math.max(0,j-1)], after = centers[Math.min(centers.length-1,j+1)];
        const dx = after.x - before.x, dy = after.y - before.y, length = Math.hypot(dx,dy) || 1;
        const twist = Math.sin(point.t * 3.4 - time * .46 + ribbon.phase * .55);
        return { ...point, nx: -dy / length, ny: dx / length,
          width: ribbon.spread * (.22 + point.envelope * .78) *
            (major ? 1.10 + twist * .22 : .68 + twist * .32), twist };
      });
      function edge(point, offset, flutter = 0) {
        const displacement = offset * point.width + flutter;
        return warp(point.x + point.nx * displacement,point.y + point.ny * displacement);
      }
      // Shaded cross-sections make the folds translucent surfaces, with a soft
      // graphite underside and a pale reflective edge, rather than thick lines.
      for (let j = 0; j < surface.length - 1; j += 3) {
        const a = surface[j], b = surface[Math.min(j+3,surface.length-1)];
        const leftA = edge(a,-1), rightA = edge(a,1), leftB = edge(b,-1), rightB = edge(b,1);
        const midpoint = surface[Math.min(j+1,surface.length-1)];
        const left = edge(midpoint,-1), right = edge(midpoint,1);
        const shade = ctx.createLinearGradient(left[0],left[1],right[0],right[1]);
        const body = ribbon.alpha * (.38 + midpoint.envelope * .62);
        shade.addColorStop(0, `rgba(245,246,248,${body * .035})`);
        shade.addColorStop(.16, `rgba(181,184,188,${body * .09})`);
        shade.addColorStop(.43, `rgba(139,143,148,${body * (major ? .17 : .12)})`);
        shade.addColorStop(.69, `rgba(52,56,61,${body * ((major ? .26 : .12) + midpoint.twist * .035)})`);
        shade.addColorStop(.9, `rgba(244,245,247,${body * (major ? .28 : .16)})`);
        shade.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();ctx.moveTo(...leftA);ctx.lineTo(...leftB);ctx.lineTo(...rightB);ctx.lineTo(...rightA);ctx.closePath();
        ctx.fillStyle = shade;ctx.fill();
      }
      for (let strand = 0; strand < ribbon.strands; strand++) {
        const offset = (strand / (ribbon.strands - 1) - .5) * 2;
        const foreground = ribbon.inkStrength > 0 && (strand === Math.floor(ribbon.strands * .38) ||
          (ribbon.inkStrength >= .4 && strand === Math.floor(ribbon.strands * .72)));
        const middle = !foreground && strand % 4 === 1;
        ctx.beginPath();
        for (let j = 0; j < surface.length; j++) {
          const point = surface[j];
          const flutter = Math.sin(point.t * 15 - time * 1.75 + strand * .6) * point.envelope *
            (foreground ? .45 : .9 + Math.abs(offset) * .7);
          const position = edge(point,offset,flutter);
          if (!j) ctx.moveTo(...position); else ctx.lineTo(...position);
        }
        const weight = 1 - Math.abs(offset) * .65;
        if (foreground) {
          const first = surface[0], last = surface[surface.length-1];
          const ink = ctx.createLinearGradient(first.x,first.y,last.x,last.y);
          const opacity = ribbon.inkStrength * weight;
          const crest = strand < ribbon.strands * .5 ? .44 : .68;
          ink.addColorStop(0, `rgba(28,30,31,${opacity * .025})`);
          ink.addColorStop(.20, `rgba(28,30,31,${opacity * .20})`);
          ink.addColorStop(crest, `rgba(28,30,31,${opacity})`);
          ink.addColorStop(.86, `rgba(28,30,31,${opacity * .52})`);
          ink.addColorStop(1, `rgba(28,30,31,${opacity * .10})`);
          ctx.strokeStyle = ink;
          ctx.lineWidth = strand < ribbon.strands * .5 ? (ribbon.inkStrength >= .7 ? .94 : .72) : .56;
        } else {
          ctx.strokeStyle = `rgba(${middle ? '55,58,60' : '105,109,113'},${ribbon.alpha * weight * (middle ? .20 : .052)})`;
          ctx.lineWidth = .38 + (strand % 3) * .13;
        }
        ctx.stroke();
        if (foreground && ribbon.inkStrength >= .4 && strand < ribbon.strands * .5) {
          for (const fraction of [.28,.48,.70]) {
            const point = surface[Math.round(fraction * (surface.length-1))];
            const position = edge(point,offset);
            ctx.beginPath();ctx.arc(...position,.66,0,TAU);
            ctx.fillStyle = `rgba(24,26,29,${ribbon.inkStrength * .9})`;ctx.fill();
          }
        }
      }
    }
    // Long, barely visible orbital waves provide the composition's airy reach.
    ctx.strokeStyle = 'rgba(109,112,116,.17)'; ctx.lineWidth = .48;
    const wavePaths = [
      [[-705,-304],[-558,-311],[-431,-225],[-350,-20],[-181,64],[20,5]],
      [[-777,-114],[-599,-97],[-441,11],[-282,108],[-152,66],[49,24]],
      [[-778,84],[-519,114],[-324,140],[-126,61],[45,-8]],
      [[-194,-185],[-306,-199],[-428,-150],[-349,-48],[-179,-73],[41,-32]],
      [[85,-179],[194,-206],[279,-124],[247,12],[367,148],[499,147]],
    ];
    for (let n = 0; n < wavePaths.length; n++) {
      ctx.beginPath();
      for (let j = 0; j < 95; j++) {
        const t = j / 94, p = sampleCurve(wavePaths[n], t);
        const q = warp(p[0], p[1] + Math.sin(t * TAU - time * .66 + n) * 22);
        if (!j) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
    }
  }
  function drawOrbits(time) {
    ctx.lineWidth = .45;
    for (let ring = 0; ring < 15; ring++) {
      const radius = 111 + ring * 5.6;
      const rotation = ring * .28 + time * (ring % 2 ? .075 : -.062);
      ctx.save(); ctx.rotate(rotation);
      ctx.scale(1, .97 - (ring % 5) * .012);
      ctx.beginPath();
      ctx.arc(0,0,radius, .10 + ring * .31, 4.5 + ring * .30);
      ctx.strokeStyle = `rgba(96,101,105,${ring % 3 === 0 ? .22 : .115})`;
      ctx.stroke(); ctx.restore();
    }
    // Inclined orbital ellipses bring a scientific wire-frame quality to the halo.
    for (let i = 0; i < 7; i++) {
      ctx.save(); ctx.rotate(i * .47 + .2 + time * .024);
      ctx.beginPath(); ctx.ellipse(0, 0, 195 - i * 6, 73 + i * 12, 0, .2, TAU - .26);
      ctx.strokeStyle = `rgba(109,113,117,${i % 2 ? .078 : .12})`;
      ctx.lineWidth = .42; ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(0,-244); ctx.lineTo(0,237);
    ctx.strokeStyle = 'rgba(66,70,74,.40)'; ctx.lineWidth = .45; ctx.stroke();
    ctx.setLineDash([1, 13]);
    ctx.beginPath(); ctx.moveTo(-350,0); ctx.lineTo(258,0);
    ctx.strokeStyle = 'rgba(79,83,85,.29)'; ctx.stroke(); ctx.setLineDash([]);
    for (const y of [-190,-153,-135,135,168]) {
      ctx.beginPath(); ctx.arc(0,y,y === -135 ? 1.7 : 2.8,0,TAU);
      ctx.fillStyle = '#141616'; ctx.fill();
    }
    for (const particle of particles) {
      const a = particle.angle + time * particle.speed * 1.8;
      const r = particle.radius + Math.sin(time * .55 + particle.offset) * 5.5;
      const p = warp(Math.cos(a) * r, Math.sin(a) * r * particle.squash, .7);
      ctx.beginPath(); ctx.arc(p[0],p[1],particle.size,0,TAU);
      ctx.fillStyle = `rgba(22,25,26,${particle.alpha})`; ctx.fill();
    }
    for (const particle of dust) {
      const p = warp(particle.x + Math.sin(time * .28 + particle.phase) * 10, particle.y + Math.cos(time * .24 + particle.phase) * 8, .6);
      ctx.beginPath(); ctx.arc(p[0],p[1],particle.radius,0,TAU);
      ctx.fillStyle = `rgba(38,42,44,${particle.alpha})`; ctx.fill();
    }
    for (const satellite of satellites) {
      ctx.beginPath();
      ctx.ellipse(0, 0, satellite.a, satellite.b, satellite.tilt, 0, TAU);
      ctx.strokeStyle = 'rgba(83,88,92,.15)'; ctx.lineWidth = .45; ctx.stroke();
    }
  }
  function drawCore(delta) {
    const surface = coreField.render(pointer, pressStrength, energy, delta, phase);
    const bounds = coreField.bounds;
    ctx.drawImage(surface, -bounds, -bounds, bounds * 2, bounds * 2);
  }
  function drawSatellite(x,y,r) {
    if (!orbitalImage.complete || !orbitalImage.naturalWidth) return;
    const p = warp(x,y,.18);
    ctx.save(); ctx.translate(p[0],p[1]);
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = `blur(${.55 * dpr * scale}px)`;
    const extent = r / .891;
    ctx.drawImage(orbitalImage,-extent,-extent,extent*2,extent*2);
    ctx.restore();
  }
  function drawGlint(time) {
    const x = 229 + Math.sin(time * .36) * 9, y = -183 + Math.cos(time * .31) * 8;
    const flare = ctx.createRadialGradient(x,y,0,x,y,27);
    flare.addColorStop(0,'rgba(255,255,255,.96)'); flare.addColorStop(.16,'rgba(255,255,255,.68)');
    flare.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = flare; ctx.fillRect(x-27,y-27,54,54);
    ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(x-20,y); ctx.lineTo(x+20,y); ctx.moveTo(x,y-23); ctx.lineTo(x,y+23); ctx.stroke();
    ctx.beginPath(); ctx.arc(202,-166,4.2,0,TAU); ctx.fillStyle = 'rgba(86,89,88,.36)'; ctx.fill();
  }
  function render(timestamp) {
    if (destroyed) return;
    const delta = lastTime ? Math.min((timestamp-lastTime)/1000,.05) : 0;
    lastTime = timestamp;
    if (getMotion()) phase += delta * (getState() === 'thinking' ? 1.15 : 1);
    const presenceFade = 1 - Math.exp(-delta / .075);
    pointer.x = pointer.targetX;
    pointer.y = pointer.targetY;
    pointer.presence = getInteraction() ? pointer.targetPresence : 0;
    const coreProximity = clamp((133 - Math.hypot(pointer.x, pointer.y)) / 27, 0, 1);
    pressStrength = coreProximity * pointer.presence;
    energy = mix(energy,clamp(Number(getEnergy()) || 0,0,1),presenceFade);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.translate(centerX,centerY); ctx.scale(scale,scale);
    drawRibbons(phase); drawOrbits(phase); drawGlint(phase);
    const positions = satellites.map(satellite => {
      const angle = satellite.angle + phase * TAU / satellite.period * satellite.direction;
      const x = satellite.a * Math.cos(angle), y = satellite.b * Math.sin(angle);
      return {
        x: x * Math.cos(satellite.tilt) - y * Math.sin(satellite.tilt),
        y: x * Math.sin(satellite.tilt) + y * Math.cos(satellite.tilt),
        r: satellite.radius * (1 + Math.sin(angle) * .10),
        depth: Math.sin(angle),
      };
    });
    for (const satellite of positions.filter(p => p.depth < 0)) drawSatellite(satellite.x, satellite.y, satellite.r);
    drawCore(delta);
    for (const satellite of positions.filter(p => p.depth >= 0)) drawSatellite(satellite.x, satellite.y, satellite.r);
    frame = requestAnimationFrame(render);
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pointermove',onPointer,{passive:true});
  function onPointerUp(event) { if (event.pointerType !== 'mouse') onLeave(); }
  window.addEventListener('pointerup',onPointerUp,{passive:true});
  window.addEventListener('pointercancel',onLeave,{passive:true});
  document.addEventListener('pointerleave',onLeave);
  window.addEventListener('blur',onLeave);
  frame = requestAnimationFrame(render);
  return {
    destroy() {
      destroyed = true; cancelAnimationFrame(frame);
      window.removeEventListener('resize',resize);
      window.removeEventListener('pointermove',onPointer);
      window.removeEventListener('pointerup',onPointerUp);
      window.removeEventListener('pointercancel',onLeave);
      document.removeEventListener('pointerleave',onLeave);
      window.removeEventListener('blur',onLeave);
      coreField.destroy();
    },
  };
}
