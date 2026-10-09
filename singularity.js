/* Orbit's singularity is painted entirely from geometry, light and noise. */
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

function makeCloudTexture() {
  const size = 384;
  const surface = document.createElement('canvas');
  surface.width = surface.height = size;
  const ctx = surface.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  const random = randomSource(71803);
  const fieldSize = 128;
  const field = Float32Array.from({ length: fieldSize * fieldSize }, random);
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => field[((b % fieldSize + fieldSize) % fieldSize) * fieldSize + (a % fieldSize + fieldSize) % fieldSize];
    return mix(mix(at(ix, iy), at(ix + 1, iy), fx), mix(at(ix, iy + 1), at(ix + 1, iy + 1), fx), fy);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - size / 2) / (size / 2), ny = (y - size / 2) / (size / 2);
      const r = Math.hypot(nx, ny);
      let value = 0, weight = 0.52, frequency = 4;
      for (let octave = 0; octave < 5; octave++) {
        value += noise(nx * frequency + 48, ny * frequency + 37) * weight;
        weight *= .49; frequency *= 2.1;
      }
      const folds = Math.pow(Math.abs(Math.sin(nx * 5 + ny * 3 + value * 10)), 9);
      const shade = clamp(4 + value * 18 + folds * 13 + Math.pow(r, 5) * value * 20, 0, 55);
      const index = (y * size + x) * 4;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = shade;
      pixels.data[index + 3] = r < 1.05 ? 255 : 0;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return surface;
}

function makeLuminousMist() {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 440;
  const ctx = surface.getContext('2d');
  const random = randomSource(12861);
  for (let i = 0; i < 170; i++) {
    const a = random() * TAU;
    const r = 174 + random() * 28;
    const x = 220 + Math.cos(a) * r, y = 220 + Math.sin(a) * r;
    const size = 7 + random() * 18;
    const light = ctx.createRadialGradient(x,y,0,x,y,size);
    light.addColorStop(0,`rgba(255,255,255,${.08 + random() * .26})`);
    light.addColorStop(.40,'rgba(255,255,255,.04)');
    light.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = light; ctx.fillRect(x-size,y-size,size*2,size*2);
  }
  return surface;
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

export function createSingularity(canvas, { getEnergy = () => 0, getMotion = () => true, getInteraction = () => true } = {}) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { destroy() {} };
  const random = randomSource(34017);
  const cloudTexture = makeCloudTexture();
  const luminousMist = makeLuminousMist();
  let width = 0, height = 0, dpr = 1, scale = 1, centerX = 0, centerY = 0;
  let frame = 0, destroyed = false, phase = 0, lastTime = 0, energy = 0;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, presence: 0, targetPresence: 0 };
  const particles = Array.from({ length: 225 }, (_, i) => ({
    angle: random() * TAU,
    radius: 110 + random() ** .78 * 109,
    speed: (random() - .5) * .023,
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
  const coreStars = Array.from({ length: 82 }, () => {
    const a = random() * TAU, r = Math.sqrt(random()) * 97;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, size: .22 + random() * .55, phase: random() * TAU };
  });
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
  ].map((ribbon, i) => ({ ...ribbon, phase: i * 1.71, samples: Array.from({ length: 88 }, (_, n) => sampleCurve(ribbon.p, n / 87)) }));

  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    scale = width <= 900 ? Math.min(width * .0015, height / 850, 1) : Math.min(width / 1672, height / 941);
    centerX = width * (width <= 900 ? .50 : .495);
    centerY = height * (width <= 900 ? .42 : .46);
  }
  function onPointer(event) {
    pointer.targetX = (event.clientX - centerX) / scale;
    pointer.targetY = (event.clientY - centerY) / scale;
    pointer.targetPresence = 1;
  }
  function onLeave() { pointer.targetPresence = 0; }

  // A locally applied gravitational field pulls and bends the finest filaments.
  function warp(x, y, strength = 1) {
    if (pointer.presence < .001) return [x, y];
    const dx = x - pointer.x, dy = y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const falloff = Math.max(0, 1 - distance / 190);
    const influence = falloff * falloff * pointer.presence * strength;
    const pull = influence * 22 / Math.max(distance, 22);
    return [x - dx * pull - dy * influence * .10, y - dy * pull + dx * influence * .10];
  }
  function pathAtRadius(radius, time, variation = 1, start = 0, end = TAU) {
    ctx.beginPath();
    const steps = Math.ceil((end - start) / TAU * 148);
    for (let i = 0; i <= steps; i++) {
      const a = start + (end - start) * i / steps;
      const distortion = Math.sin(a * 7 + time * .52) * 1.15 + Math.sin(a * 13 - time * .31) * .62 + Math.sin(a * 23 + time * .18) * .38;
      const r = radius + distortion * variation;
      const p = warp(Math.cos(a) * r, Math.sin(a) * r, .15);
      if (!i) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    if (end - start >= TAU - .001) ctx.closePath();
  }
  function drawRibbons(time) {
    ctx.lineCap = 'round';
    for (const ribbon of ribbons) {
      for (let strand = 0; strand < ribbon.strands; strand++) {
        const offset = (strand / (ribbon.strands - 1) - .5) * 2;
        ctx.beginPath();
        for (let j = 0; j < ribbon.samples.length; j++) {
          const t = j / (ribbon.samples.length - 1);
          const base = ribbon.samples[j];
          const before = ribbon.samples[Math.max(0,j-1)], after = ribbon.samples[Math.min(ribbon.samples.length-1,j+1)];
          const dx = after[0] - before[0], dy = after[1] - before[1], length = Math.hypot(dx, dy) || 1;
          const envelope = Math.sin(Math.PI * t) ** .65;
          const oscillation = Math.sin(t * 11 + time * .13 + ribbon.phase + offset * 1.5);
          const displacement = offset * ribbon.spread * (.35 + envelope * .65) + oscillation * ribbon.bend * envelope + Math.sin(t * 24 + strand * .48 - time * .17) * 2.3 * envelope;
          const p = warp(base[0] - dy / length * displacement, base[1] + dx / length * displacement);
          if (!j) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        }
        const weight = 1 - Math.abs(offset) * .65;
        ctx.strokeStyle = `rgba(82,85,86,${ribbon.alpha * weight * (strand % 4 === 0 ? .14 : .067)})`;
        ctx.lineWidth = strand % 5 === 0 ? 2.5 : .48 + (strand % 3) * .29;
        ctx.stroke();
      }
      // A soft, translucent fold gives each stream a gauzy three-dimensional body.
      ctx.beginPath();
      ribbon.samples.forEach((p, i) => {
        const q = warp(p[0], p[1]);
        if (!i) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      });
      ctx.strokeStyle = `rgba(82,84,86,${ribbon.alpha * .052})`;
      ctx.lineWidth = ribbon.spread * .65;
      ctx.shadowColor = `rgba(90,93,96,${ribbon.alpha * .10})`; ctx.shadowBlur = 6;
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    // Long, barely visible orbital waves provide the composition's airy reach.
    ctx.strokeStyle = 'rgba(109,112,116,.12)'; ctx.lineWidth = .48;
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
        const q = warp(p[0], p[1] + Math.sin(t * TAU + time * .09 + n) * 5);
        if (!j) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
    }
  }
  function drawOrbits(time) {
    ctx.lineWidth = .45;
    for (let ring = 0; ring < 15; ring++) {
      const radius = 111 + ring * 5.6;
      const rotation = ring * .28 + time * (ring % 2 ? .011 : -.008);
      ctx.save(); ctx.rotate(rotation);
      ctx.scale(1, .97 - (ring % 5) * .012);
      ctx.beginPath();
      ctx.arc(0,0,radius, .10 + ring * .31, 4.5 + ring * .30);
      ctx.strokeStyle = `rgba(96,101,105,${ring % 3 === 0 ? .16 : .082})`;
      ctx.stroke(); ctx.restore();
    }
    // Inclined orbital ellipses bring a scientific wire-frame quality to the halo.
    for (let i = 0; i < 7; i++) {
      ctx.save(); ctx.rotate(i * .47 + .2 + time * .007);
      ctx.beginPath(); ctx.ellipse(0, 0, 195 - i * 6, 73 + i * 12, 0, .2, TAU - .26);
      ctx.strokeStyle = `rgba(109,113,117,${i % 2 ? .057 : .088})`;
      ctx.lineWidth = .42; ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(0,-244); ctx.lineTo(0,237);
    ctx.strokeStyle = 'rgba(66,70,74,.32)'; ctx.lineWidth = .45; ctx.stroke();
    ctx.setLineDash([1, 13]);
    ctx.beginPath(); ctx.moveTo(-350,0); ctx.lineTo(258,0);
    ctx.strokeStyle = 'rgba(79,83,85,.22)'; ctx.stroke(); ctx.setLineDash([]);
    for (const y of [-190,-153,-135,135,168]) {
      ctx.beginPath(); ctx.arc(0,y,y === -135 ? 1.7 : 2.8,0,TAU);
      ctx.fillStyle = '#141616'; ctx.fill();
    }
    for (const particle of particles) {
      const a = particle.angle + time * particle.speed;
      const r = particle.radius + Math.sin(time * .13 + particle.offset) * 2;
      const p = warp(Math.cos(a) * r, Math.sin(a) * r * particle.squash, .7);
      ctx.beginPath(); ctx.arc(p[0],p[1],particle.size,0,TAU);
      ctx.fillStyle = `rgba(22,25,26,${particle.alpha})`; ctx.fill();
    }
    for (const particle of dust) {
      const p = warp(particle.x + Math.sin(time * .05 + particle.phase) * 5, particle.y + Math.cos(time * .04 + particle.phase) * 4, .6);
      ctx.beginPath(); ctx.arc(p[0],p[1],particle.radius,0,TAU);
      ctx.fillStyle = `rgba(38,42,44,${particle.alpha})`; ctx.fill();
    }
  }
  function drawCore(time) {
    ctx.save();
    const nearCore = Math.max(0, 1 - Math.hypot(pointer.x, pointer.y) / 280) * pointer.presence;
    ctx.translate(pointer.x * nearCore * .012, pointer.y * nearCore * .012);
    ctx.scale(1.055,1.055);
    const pulse = Math.sin(time * .35) * .55 + energy * 1.7;
    // A distant gray veil makes the brighter corona read as scattered light.
    const haze = ctx.createRadialGradient(0,0,96,0,0,145);
    haze.addColorStop(0,'rgba(87,94,95,0)');
    haze.addColorStop(.32,'rgba(87,94,95,.06)');
    haze.addColorStop(.58,'rgba(87,94,95,.038)');
    haze.addColorStop(1,'rgba(87,94,95,0)');
    ctx.fillStyle = haze; ctx.beginPath(); ctx.arc(0,0,145,0,TAU); ctx.fill();
    // White scattered light stays narrow and luminous around a deeply black body.
    let light = ctx.createRadialGradient(0,0,87,0,0,139);
    light.addColorStop(0,'rgba(255,255,255,0)');
    light.addColorStop(.25,'rgba(255,255,255,.29)');
    light.addColorStop(.42,'rgba(255,255,255,.88)');
    light.addColorStop(.62,'rgba(255,255,255,.37)');
    light.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = light; ctx.beginPath(); ctx.arc(0,0,139,0,TAU); ctx.fill();
    // The outer rim is many irregular, translucent folds rather than a flat stroke.
    ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = 12;
    for (let layer = 9; layer >= 0; layer--) {
      pathAtRadius(99.5 + layer * .9 + pulse, time + layer * .31, 1.2 + layer * .10);
      ctx.strokeStyle = `rgba(255,255,255,${.07 + (9 - layer) * .037})`;
      ctx.lineWidth = layer < 3 ? 1.8 : 1.4; ctx.stroke();
    }
    ctx.shadowBlur = 0;
    pathAtRadius(99 + pulse, time, .72);
    const body = ctx.createRadialGradient(-18,-23,9,3,2,102);
    body.addColorStop(0,'#020303'); body.addColorStop(.47,'#020303');
    body.addColorStop(.76,'#080909'); body.addColorStop(.92,'#252828'); body.addColorStop(1,'#747777');
    ctx.fillStyle = body; ctx.fill(); ctx.save(); ctx.clip();
    ctx.save(); ctx.rotate(time * .016);
    ctx.globalAlpha = .62; ctx.drawImage(cloudTexture,-108,-108,216,216);
    ctx.globalAlpha = .26; ctx.rotate(-time * .031 + .8); ctx.drawImage(cloudTexture,-119,-116,234,234);
    ctx.restore();
    const darkness = ctx.createRadialGradient(-5,-7,16,0,0,100);
    darkness.addColorStop(0,'rgba(0,0,0,.65)'); darkness.addColorStop(.69,'rgba(0,0,0,.41)');
    darkness.addColorStop(.95,'rgba(0,0,0,0)'); darkness.addColorStop(1,'rgba(255,255,255,.08)');
    ctx.fillStyle = darkness; ctx.fillRect(-110,-110,220,220);
    // Lensing arcs travel through the sphere's face as very fine strands of light.
    for (let i = 0; i < 8; i++) {
      const angles = [.36, -.45, .10, -.28, .63, -.62, 1.1, .89];
      ctx.save(); ctx.rotate(angles[i] + Math.sin(time * .06 + i) * .035);
      ctx.beginPath();
      ctx.ellipse(0, Math.sin(i * 2.4 + time * .05) * 12, 116 - i * 1.5, 20 + (i % 4) * 9, 0, .1, TAU - .32);
      ctx.strokeStyle = `rgba(225,234,234,${i % 3 === 0 ? .39 : .11})`;
      ctx.lineWidth = i % 3 === 0 ? .68 : .35;
      ctx.shadowColor = 'rgba(255,255,255,.7)'; ctx.shadowBlur = i % 3 === 0 ? 2 : 0;
      ctx.stroke(); ctx.restore();
    }
    for (const star of coreStars) {
      const shimmer = .35 + Math.sin(time * .4 + star.phase) * .20;
      ctx.beginPath(); ctx.arc(star.x,star.y,star.size,0,TAU);
      ctx.fillStyle = `rgba(244,249,248,${shimmer})`; ctx.fill();
    }
    // Scattered light penetrates the smoky edge, giving the hole a soft optical rim.
    const rimLight = ctx.createRadialGradient(-1, -1, 65, 0, 0, 101);
    rimLight.addColorStop(0,'rgba(255,255,255,0)');
    rimLight.addColorStop(.30,'rgba(255,255,255,.025)');
    rimLight.addColorStop(.48,'rgba(255,255,255,.10)');
    rimLight.addColorStop(.68,'rgba(255,255,255,.37)');
    rimLight.addColorStop(.84,'rgba(255,255,255,.78)');
    rimLight.addColorStop(1,'rgba(255,255,255,1)');
    ctx.fillStyle = rimLight; ctx.fillRect(-108,-108,216,216);
    ctx.save(); ctx.rotate(time * .018);
    ctx.drawImage(luminousMist,-110,-110,220,220);
    ctx.restore();
    for (let fold = 0; fold < 11; fold++) {
      const angle = fold * .571 + Math.sin(time * .18 + fold) * .07;
      ctx.beginPath();
      for (let step = 0; step < 30; step++) {
        const a = angle + step / 29 * (.31 + fold % 3 * .1);
        const r = 90 + Math.sin(a * 9 + time * .2) * 2.4 + Math.sin(a * 19 - time * .27) * 1.4;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (!step) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.strokeStyle = `rgba(244,249,248,${fold % 3 === 0 ? .46 : .19})`;
      ctx.lineWidth = fold % 3 === 0 ? 2.8 : 1.3;
      ctx.shadowColor = 'rgba(255,255,255,.8)'; ctx.shadowBlur = 5;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
    // Broken white caustics and lit crescents make the perimeter feel volumetric.
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 5;
    for (let i = 0; i < 18; i++) {
      const angle = i * .349 + Math.sin(time * .1 + i) * .015;
      pathAtRadius(99.7 + pulse + Math.sin(i * 2.7) * .65, time + i * .05, 1.15, angle, angle + .09 + (i % 4) * .046);
      ctx.strokeStyle = `rgba(255,255,255,${.36 + (Math.sin(i * 1.7) + 1) * .21})`;
      ctx.lineWidth = 1 + (i % 3) * .6; ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(.2 + i * .31 + time * .003);
      ctx.beginPath(); ctx.ellipse(0,0,103 + i * .8,92 + i * 2.8,0,3.45,5.6);
      ctx.strokeStyle = `rgba(255,255,255,${.20 - i * .027})`;
      ctx.lineWidth = .8; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
  function drawSatellite(x,y,r,time,offset) {
    x += Math.sin(time * .09 + offset) * 2.3;
    y += Math.cos(time * .07 + offset) * 2.3;
    const p = warp(x,y,.18);
    ctx.save(); ctx.translate(p[0],p[1]);
    const halo = ctx.createRadialGradient(0,0,r*.5,0,0,r*1.7);
    halo.addColorStop(0,'rgba(255,255,255,.8)'); halo.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0,0,r*1.7,0,TAU); ctx.fill();
    const sphere = ctx.createRadialGradient(-r*.33,-r*.38,r*.04,-r*.05,-r*.04,r);
    sphere.addColorStop(0,'#626564'); sphere.addColorStop(.25,'#292b2a');
    sphere.addColorStop(.58,'#040605'); sphere.addColorStop(.81,'#0b0d0c'); sphere.addColorStop(1,'#8b8e8c');
    ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.68)'; ctx.lineWidth = .7; ctx.stroke();
    ctx.restore();
  }
  function drawGlint(time) {
    const x = 229 + Math.sin(time * .07) * 3, y = -183 + Math.cos(time * .06) * 3;
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
    if (getMotion()) phase += delta;
    pointer.x = mix(pointer.x,pointer.targetX,.075);
    pointer.y = mix(pointer.y,pointer.targetY,.075);
    pointer.presence = mix(pointer.presence,getInteraction() ? pointer.targetPresence : 0,.055);
    energy = mix(energy,clamp(Number(getEnergy()) || 0,0,1),.04);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.translate(centerX,centerY); ctx.scale(scale,scale);
    drawRibbons(phase); drawOrbits(phase); drawGlint(phase); drawCore(phase);
    drawSatellite(-134,-117,11.4,phase,.2);
    drawSatellite(-165,96,12.1,phase,2.2);
    drawSatellite(115,84,12,phase,4.2);
    frame = requestAnimationFrame(render);
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pointermove',onPointer,{passive:true});
  document.addEventListener('pointerleave',onLeave);
  window.addEventListener('blur',onLeave);
  frame = requestAnimationFrame(render);
  return {
    destroy() {
      destroyed = true; cancelAnimationFrame(frame);
      window.removeEventListener('resize',resize);
      window.removeEventListener('pointermove',onPointer);
      document.removeEventListener('pointerleave',onLeave);
      window.removeEventListener('blur',onLeave);
    },
  };
}
