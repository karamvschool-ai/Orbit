/* Orbit's singularity combines animated geometry with shaded orbital sprites. */
import { createCoreField } from './core-field.js';
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mix = (a, b, t) => a + (b - a) * t;
const gaussian = n => Math.exp(-(n*n));
const DISK_TILT = Math.PI / 15;
const BRIGHT_ANGLE = -2.35;

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
  if (!ctx) return { cue() {}, destroy() {} };
  const coreField = createCoreField();
  const orbitalImage = new Image();
  orbitalImage.decoding = 'async';
  orbitalImage.src = new URL('./assets/orbital-sphere.png',import.meta.url).href;
  const random = randomSource(34017);
  let width = 0, height = 0, dpr = 1, scale = 1, centerX = 0, centerY = 0;
  let frame = 0, refreshTimer = 0, destroyed = false, phase = 0, lastTime = 0, energy = 0, pressStrength = 0;
  let submitAge = Infinity, completeAge = Infinity, wakeUntil = 0, previousState = '', previousMotion = null, previousInteraction = null;
  const stateMix = { listening: 0, thinking: 0 };
  const visual = { listening: 0, thinking: 0, completeProgress: -1 };
  const scratch = [0, 0];
  const accretionBuffers = Array.from({length:11},()=>new Float32Array(87*2));
  const satellitePositions = Array.from({length: 3}, () => ({x: 0, y: 0, r: 0, depth: 0}));
  const pointer = { x: 0, y: 0, clientX: null, clientY: null, targetX: 0, targetY: 0, presence: 0, targetPresence: 0 };
  const satellites = [
    { a: 192, b: 139, tilt: 35 * Math.PI / 180, angle: 3.294, period: 24, direction: 1, radius: 11.4 },
    { a: 206, b: 149, tilt: -27 * Math.PI / 180, angle: 3.062, period: 31, direction: 1, radius: 12.1 },
    { a: 164, b: 124, tilt: 17 * Math.PI / 180, angle: .435, period: 20, direction: 1, radius: 12 },
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
    { p: [[-850,130],[-555,51],[-402,5],[-248,-18],[-177,-46],[-115,-93],[-37,-115]], spread: 13, bend: 17, alpha: .32, strands: 9 },
    { p: [[-236,-310],[-235,-252],[-206,-192],[-158,-158],[-78,-132],[-28,-59]], spread: 24, bend: 19, alpha: .62, strands: 20 },
    { p: [[-166,-365],[-192,-280],[-170,-197],[-99,-167],[-39,-108],[9,-14]], spread: 16, bend: 14, alpha: .29, strands: 11 },
    { p: [[-54,48],[-118,85],[-166,145],[-245,164],[-308,198],[-418,280]], spread: 29, bend: 24, alpha: .38, strands: 16 },
    { p: [[-62,24],[-155,90],[-185,165],[-240,191],[-353,179],[-487,219]], spread: 23, bend: 15, alpha: .25, strands: 11 },
    { p: [[34,-112],[109,-81],[176,-22],[236,-48],[304,-38],[384,29],[488,89],[656,130]], spread: 23, bend: 24, alpha: .55, strands: 21 },
    { p: [[64,-14],[184,-73],[259,-74],[331,22],[474,129],[636,231],[848,221]], spread: 31, bend: 14, alpha: .34, strands: 15 },
    { p: [[24,77],[103,115],[182,137],[228,187],[271,213],[356,228],[438,352]], spread: 25, bend: 22, alpha: .51, strands: 19 },
    { p: [[8,105],[131,169],[222,161],[257,185],[311,255],[350,368]], spread: 19, bend: 21, alpha: .25, strands: 12 },
    { p: [[51,-17],[112,-93],[170,-125],[202,-160],[179,-203],[107,-215]], spread: 14, bend: 13, alpha: .22, strands: 10 },
    { p: [[-242,-178],[-180,-154],[-127,-167],[-72,-129],[-25,-79]], spread: 11, bend: 10, alpha: .54, strands: 10 },
    { p: [[-151,91],[-106,106],[-78,152],[-19,136],[21,99],[0,43]], spread: 13, bend: 10, alpha: .45, strands: 10 },
    { p: [[126,46],[174,-44],[136,-128],[91,-144],[58,-90]], spread: 11, bend: 10, alpha: .44, strands: 8 },
  ].map((ribbon, i) => ({
    ...ribbon,
    inkStrength: [.40,.19,0,.78,.28,.39,0,.38,.20,.53,0,.26,.58,.50,.56][i],
    phase: i * 1.71,
    samples: Array.from({ length: 88 }, (_, n) => sampleCurve(ribbon.p, n / 87)),
    surface: new Float32Array(88 * 12),
    major: ribbon.alpha >= .38 && ribbon.spread >= 16,
  }));

  const wavePaths = [
    [[-705,-304],[-558,-311],[-431,-225],[-350,-20],[-181,64],[20,5]],
    [[-777,-114],[-599,-97],[-441,11],[-282,108],[-152,66],[49,24]],
    [[-778,84],[-519,114],[-324,140],[-126,61],[45,-8]],
    [[-194,-185],[-306,-199],[-428,-150],[-349,-48],[-179,-73],[41,-32]],
    [[85,-179],[194,-206],[279,-124],[247,12],[367,148],[499,147]],
  ].map(points => Array.from({length: 95}, (_, j) => sampleCurve(points, j / 94)));
  orbitalImage.onload = () => invalidate();

  function requestFrame() {
    if (!destroyed && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }
  function invalidate() {
    wakeUntil = performance.now() + 420;
    clearTimeout(refreshTimer); refreshTimer = 0;
    requestFrame();
  }
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
    invalidate();
  }
  function onPointer(event) {
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    pointer.targetX = (event.clientX - centerX) / scale;
    pointer.targetY = (event.clientY - centerY) / scale;
    pointer.targetPresence = 1;
    invalidate();
  }
  function onLeave() { pointer.targetPresence = 0; invalidate(); }

  // The rim and nearby plotted geometry share the core's material transport.
  // A broader, weaker field carries that displacement into the distant ribbons.
  function warp(x, y, strength = 1, out = scratch) {
    if (pointer.presence < .001) { out[0] = x; out[1] = y; return out; }
    const material = coreField.displacePoint(x, y);
    const dx = x - pointer.x, dy = y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const falloff = Math.max(0, 1 - distance / 190);
    const influence = falloff * falloff * pointer.presence * strength;
    const pull = influence * 7 / Math.max(distance, 22);
    const connection = clamp((225 - Math.hypot(x,y)) / 100, 0, 1) * strength;
    out[0] = x + (material[0] - x) * connection + dx * pull - dy * influence * .035;
    out[1] = y + (material[1] - y) * connection + dy * pull + dx * influence * .035;
    return out;
  }
  // A permanent lens bends the distant scene first; cursor transport then acts
  // on that apparent position, so the two fields never fight over the same ray.
  function lensPoint(x, y, strength = 1, out = scratch) {
    const radius = Math.hypot(x,y);
    if(radius<.01){out[0]=x;out[1]=y;return out;}
    const angle=Math.atan2(y,x);
    const radial=gaussian((radius-119)/59);
    const tangential=gaussian((radius-145)/90);
    const apparentRadius=radius+15*radial*strength;
    const apparentAngle=angle+.19*Math.sin(2*(angle-DISK_TILT))*tangential*strength;
    out[0]=Math.cos(apparentAngle)*apparentRadius;
    out[1]=Math.sin(apparentAngle)*apparentRadius;
    return out;
  }
  function filamentWarp(x,y,strength=1,out=scratch) {
    const lensed=lensPoint(x,y,strength,out);
    return warp(lensed[0],lensed[1],strength,out);
  }
  function ribbonEdge(ribbon, j, offset, flutter = 0) {
    const s = ribbon.surface, i = j * 12;
    const displacement = offset * s[i+6] + flutter;
    return filamentWarp(s[i] + s[i+4] * displacement, s[i+1] + s[i+5] * displacement);
  }
  function drawRibbonSignal(ribbon, index, time) {
    if (!getMotion()) return;
    const submission = submitAge < 1.35;
    const thinking = stateMix.thinking > .03;
    if (!submission && !thinking) return;
    const outerFirst = Math.hypot(...ribbon.samples[0]) > Math.hypot(...ribbon.samples[87]);
    let progress, alpha;
    if (submission) {
      progress = clamp((submitAge - index * .085) / 1.04, 0, 1);
      alpha = Math.sin(progress * Math.PI) * .70;
    } else {
      progress = (time * .29 + index * .32) % 1;
      alpha = Math.sin(progress * Math.PI) * stateMix.thinking * .34;
    }
    const head = (outerFirst ? progress : 1-progress) * 87;
    const tail = clamp(head + (outerFirst ? -9 : 9), 0, 87);
    const from = Math.floor(Math.min(head,tail)), to = Math.ceil(Math.max(head,tail));
    if (alpha < .015 || from === to) return;
    ctx.beginPath();
    for (let j=from;j<=to;j++) {
      const q=ribbonEdge(ribbon,j,-.10);
      if(j===from)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1]);
    }
    ctx.strokeStyle=`rgba(39,43,46,${alpha*.23})`;ctx.lineWidth=3.1;ctx.stroke();
    ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=1.05;
    ctx.shadowColor=`rgba(255,255,255,${alpha*.65})`;ctx.shadowBlur=3;
    ctx.stroke();ctx.shadowBlur=0;
  }
  function drawRibbons(time) {
    ctx.lineCap = 'round';
    const breath = Math.sin(time*.7)*1.5*(1-stateMix.listening) + Math.sin(time*3.2)*4*stateMix.listening;
    const sampleStep = width <= 600 ? 2 : 1;
    for (let n=0;n<ribbons.length;n++) {
      const ribbon = ribbons[n], s = ribbon.surface, major = ribbon.major;
      // Reuse a fixed geometry buffer; all strands share coherent surface folds.
      for (let j=0;j<88;j++) {
        const base=ribbon.samples[j], t=j/87, i=j*12;
        const before=ribbon.samples[Math.max(0,j-1)], after=ribbon.samples[Math.min(87,j+1)];
        const dx=after[0]-before[0], dy=after[1]-before[1], length=Math.hypot(dx,dy)||1;
        const envelope=Math.sin(Math.PI*t)**.85;
        const inner=gaussian((Math.hypot(base[0],base[1])-142)/135);
        const outerWave=Math.sin(t*4.8-time*.46+ribbon.phase);
        const innerWave=Math.sin(t*6-time*1.58+ribbon.phase);
        const outerDrift=Math.sin(time*.40+ribbon.phase*.6);
        const innerDrift=Math.sin(time*1.04+ribbon.phase*.6);
        const displacement=(mix(outerWave,innerWave,inner)*ribbon.bend*(1.25-inner*.60) +
          mix(outerDrift,innerDrift,inner)*(19+breath)*(1-inner*.56))*envelope*(1+energy*.12);
        s[i]=base[0]-dy/length*displacement;s[i+1]=base[1]+dx/length*displacement;
        s[i+2]=t;s[i+3]=envelope;
      }
      for(let j=0;j<88;j++) {
        const i=j*12, before=Math.max(0,j-1)*12, after=Math.min(87,j+1)*12;
        const dx=s[after]-s[before],dy=s[after+1]-s[before+1],length=Math.hypot(dx,dy)||1;
        const inner=gaussian((Math.hypot(s[i],s[i+1])-142)/135);
        const twist=mix(Math.sin(s[i+2]*3.4-time*.30+ribbon.phase*.55),
          Math.sin(s[i+2]*4.2-time*1.08+ribbon.phase*.55),inner);
        s[i+4]=-dy/length;s[i+5]=dx/length;s[i+7]=twist;
        s[i+6]=ribbon.spread*(.22+s[i+3]*.78)*(major?1.10+twist*.22:.68+twist*.32);
        let q=ribbonEdge(ribbon,j,-1);s[i+8]=q[0];s[i+9]=q[1];
        q=ribbonEdge(ribbon,j,1);s[i+10]=q[0];s[i+11]=q[1];
      }
      // Selected graphite folds create depth; the remainder stays transparent.
      const stripStep=width<=600?8:5;
      for(let j=0;j<87;j+=stripStep) {
        const i=j*12,k=Math.min(j+stripStep,87)*12,m=Math.min(j+Math.floor(stripStep/2),87)*12;
        const shade=ctx.createLinearGradient(s[m+8],s[m+9],s[m+10],s[m+11]);
        const body=ribbon.alpha*(.38+s[m+3]*.62);
        shade.addColorStop(0,`rgba(245,246,248,${body*.03})`);
        shade.addColorStop(.18,`rgba(169,174,178,${body*.09})`);
        shade.addColorStop(.44,`rgba(105,111,115,${body*(major?.18:.10)})`);
        shade.addColorStop(.69,`rgba(39,44,48,${body*((major?.32:.13)+s[m+7]*.065)})`);
        shade.addColorStop(.88,`rgba(249,250,251,${body*(major?.34:.15)})`);
        shade.addColorStop(1,'rgba(255,255,255,0)');
        ctx.beginPath();ctx.moveTo(s[i+8],s[i+9]);ctx.lineTo(s[k+8],s[k+9]);
        ctx.lineTo(s[k+10],s[k+11]);ctx.lineTo(s[i+10],s[i+11]);ctx.closePath();
        ctx.fillStyle=shade;ctx.fill();
      }
      for(let strand=0;strand<ribbon.strands;strand++) {
        if(width<=600 && strand%2 && strand!==Math.floor(ribbon.strands*.38))continue;
        const offset=(strand/(ribbon.strands-1)-.5)*2;
        const foreground=ribbon.inkStrength>0&&(strand===Math.floor(ribbon.strands*.38)||
          (ribbon.inkStrength>=.4&&strand===Math.floor(ribbon.strands*.72)));
        const middle=!foreground&&strand%4===1;
        ctx.beginPath();
        for(let j=0;j<88;j+=sampleStep) {
          const i=j*12,inner=gaussian((Math.hypot(s[i],s[i+1])-142)/135);
          const flutter=mix(Math.sin(s[i+2]*15-time*.98+strand*.6),
            Math.sin(s[i+2]*17-time*3.08+strand*.6),inner)*s[i+3]*(foreground?.45:.9+Math.abs(offset)*.7);
          const q=ribbonEdge(ribbon,j,offset,flutter);
          if(!j)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1]);
        }
        const weight=1-Math.abs(offset)*.65;
        if(foreground) {
          const ink=ctx.createLinearGradient(s[0],s[1],s[87*12],s[87*12+1]);
          const opacity=ribbon.inkStrength*weight,crest=strand<ribbon.strands*.5?.44:.68;
          ink.addColorStop(0,`rgba(26,29,31,${opacity*.02})`);
          ink.addColorStop(.20,`rgba(26,29,31,${opacity*.19})`);
          ink.addColorStop(crest,`rgba(26,29,31,${opacity})`);
          ink.addColorStop(.86,`rgba(26,29,31,${opacity*.48})`);
          ink.addColorStop(1,`rgba(26,29,31,${opacity*.08})`);
          ctx.strokeStyle=ink;ctx.lineWidth=strand<ribbon.strands*.5?(ribbon.inkStrength>=.7?1.08:.84):.51;
        } else {
          ctx.strokeStyle=`rgba(${middle?'55,58,60':'105,109,113'},${ribbon.alpha*weight*(middle?.19:.047)})`;
          ctx.lineWidth=.35+(strand%3)*.12;
        }
        ctx.stroke();
        if(foreground&&ribbon.inkStrength>=.4&&strand<ribbon.strands*.5) {
          for(const fraction of [.28,.48,.70]) {
            const q=ribbonEdge(ribbon,Math.round(fraction*87),offset);
            ctx.beginPath();ctx.arc(q[0],q[1],.62,0,TAU);ctx.fillStyle=`rgba(24,26,29,${ribbon.inkStrength*.8})`;ctx.fill();
          }
        }
      }
      if(n===0||n===3||n===7)drawRibbonSignal(ribbon,n===0?0:n===3?1:2,time);
    }
    ctx.strokeStyle='rgba(109,112,116,.15)';ctx.lineWidth=.48;
    for(let n=0;n<wavePaths.length;n++) {
      ctx.beginPath();
      for(let j=0;j<95;j+=sampleStep) {
        const p=wavePaths[n][j],inner=gaussian((Math.hypot(p[0],p[1])-142)/135);
        const wave=mix(Math.sin(j/94*TAU-time*.40+n),Math.sin(j/94*TAU*1.2-time*1.24+n),inner);
        const q=filamentWarp(p[0],p[1]+wave*22*(1-inner*.55));
        if(!j)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1]);
      }
      ctx.stroke();
    }
  }
  function accretionPoint(angle,track,time,rear,out=scratch,imageOffset=0) {
    const sin=Math.sin(angle),cos=Math.cos(angle),depth=Math.abs(sin);
    const radius=189+track*2.7;
    const shear=Math.sin(angle*4-time*(1.55-track*.025)+track*.63)*1.25*depth;
    const x=cos*radius;
    // The rear plane appears again above the shadow; its near-side image is
    // compressed below it. Both are drawn before the core masks the scene.
    const y=sin*(rear?52:43)+(rear?-70:64)*depth**1.7+track*.85+shear;
    const cosine=Math.cos(DISK_TILT),sine=Math.sin(DISK_TILT);
    const lensed=lensPoint(x*cosine-y*sine,x*sine+y*cosine,.93,out);
    const apparentRadius=Math.hypot(lensed[0],lensed[1])||1;
    const imageScale=1+imageOffset/apparentRadius;
    return warp(lensed[0]*imageScale,lensed[1]*imageScale,.93,out);
  }
  function drawAccretion(time) {
    const count=width<=600?54:86;
    ctx.lineCap='round';
    const trace=(buffer,from=0,to=count)=>{
      ctx.beginPath();ctx.moveTo(buffer[from*2],buffer[from*2+1]);
      for(let j=from+1;j<=to;j++)ctx.lineTo(buffer[j*2],buffer[j*2+1]);
    };
    const shade=(buffer,alpha,white=false)=>{
      const first=buffer[0]<buffer[count*2]?0:count*2,last=first?0:count*2;
      const gradient=ctx.createLinearGradient(buffer[first],buffer[first+1],buffer[last],buffer[last+1]);
      const rgb=white?'255,255,255':'30,35,39';
      const peak=.2+.5*(.5+.5*Math.cos(BRIGHT_ANGLE));
      for(const [position,weight] of [[0,0],[.10,.32],[peak,1],[.47,.78],[.70,.36],[.91,.12],[1,0]])
        gradient.addColorStop(position,`rgba(${rgb},${alpha*weight})`);
      return gradient;
    };
    for(const rear of [true,false]) {
      const start=rear?Math.PI:0;
      const tracks=rear?7:4;
      for(let track=0;track<tracks;track++) {
        const offset=track-(tracks-1)/2,buffer=accretionBuffers[(rear?0:7)+track];
        for(let j=0;j<=count;j++) {
          const point=accretionPoint(start+j/count*Math.PI,offset,time,rear);
          buffer[j*2]=point[0];buffer[j*2+1]=point[1];
        }
        const primary=rear&&(track===2||track===4);
        const alpha=rear?(primary?.61:.21):.15;
        trace(buffer);ctx.lineWidth=primary?.88:.44;
        ctx.strokeStyle=shade(buffer,alpha);ctx.stroke();
        if(rear&&track===3) {
          // A graphite shoulder makes the narrow white current legible on ivory.
          ctx.lineWidth=6.2;ctx.strokeStyle=shade(buffer,.19);ctx.stroke();
          ctx.lineWidth=1.2;ctx.strokeStyle=shade(buffer,.91,true);ctx.stroke();
        }
        if(rear&&primary) {
          const head=(time*(.19+track*.018)+track*.31)%1;
          const from=Math.max(1,Math.floor(head*count)-6),to=Math.min(count-1,Math.floor(head*count));
          if(to>from) {
            trace(buffer,from,to);ctx.lineWidth=.95;
            ctx.strokeStyle=`rgba(255,255,255,${Math.sin(head*Math.PI)*.46})`;ctx.stroke();
          }
        }
      }
      // A selected second image, rather than another complete construction ring.
      if(rear)for(const range of [[Math.PI*1.13,Math.PI*1.53],[Math.PI*1.63,Math.PI*1.88]]) {
        ctx.beginPath();
        for(let j=0;j<=40;j++) {
          const q=accretionPoint(mix(range[0],range[1],j/40),1,time,true,scratch,-6);
          if(!j)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1]);
        }
        ctx.lineWidth=.45;ctx.strokeStyle='rgba(66,73,78,.14)';ctx.stroke();
      }
    }
  }
  function traceOrbit(a,b,tilt,start,end,strength=.46) {
    const count=width<=600?44:68,cos=Math.cos(tilt),sin=Math.sin(tilt);
    ctx.beginPath();
    for(let i=0;i<=count;i++) {
      const angle=start+i/count*(end-start),x=Math.cos(angle)*a,y=Math.sin(angle)*b;
      const q=warp(x*cos-y*sin,x*sin+y*cos,strength);
      if(!i)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1]);
    }
  }
  function drawOrbits(time) {
    ctx.lineWidth = .45;
    for (let ring = 0; ring < 6; ring++) {
      const radius = 134 + ring * 8.1;
      const rotation = ring * .28 + time * (ring % 2 ? .075 : -.062);
      traceOrbit(radius,radius*(.97-(ring%5)*.012),rotation,.10+ring*.31,4.5+ring*.30);
      ctx.strokeStyle = `rgba(96,101,105,${ring % 3 === 0 ? .095 : .048})`;
      ctx.stroke();
    }
    // Inclined orbital ellipses bring a scientific wire-frame quality to the halo.
    for (let i = 0; i < 3; i++) {
      traceOrbit(195-i*6,73+i*12,i*.47+.2+time*.024,.2,TAU-.26);
      ctx.strokeStyle = `rgba(109,113,117,${i % 2 ? .035 : .055})`;
      ctx.lineWidth = .42; ctx.stroke();
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
      const r = particle.radius + Math.sin(time * .55 + particle.offset) * 5.5 - stateMix.listening * Math.sin(time*3.2+particle.offset*.25)*2.0;
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
      traceOrbit(satellite.a,satellite.b,satellite.tilt,0,TAU,.28);
      ctx.strokeStyle = 'rgba(83,88,92,.15)'; ctx.lineWidth = .45; ctx.stroke();
    }
  }
  function drawCore(surface) {
    const bounds=coreField.bounds;
    ctx.drawImage(surface,-bounds,-bounds,bounds*2,bounds*2);
  }
  function drawSatellite(satellite) {
    if(!orbitalImage.complete||!orbitalImage.naturalWidth)return;
    const p=warp(satellite.x,satellite.y,.28),depth=(satellite.depth+1)*.5;
    ctx.save();ctx.translate(p[0],p[1]);ctx.imageSmoothingQuality='high';
    ctx.globalAlpha=.68+depth*.32;
    ctx.filter=`blur(${(.92-depth*.77)*dpr*scale}px)`;
    const extent=satellite.r/.891;
    ctx.drawImage(orbitalImage,-extent,-extent,extent*2,extent*2);ctx.restore();
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
    frame=0;
    if(destroyed||document.hidden)return;
    const delta=lastTime?Math.max(0,Math.min((timestamp-lastTime)/1000,.05)):1/60;
    lastTime=timestamp;
    const state=getState(),motion=getMotion(),interaction=getInteraction(),blend=1-Math.exp(-delta/.24);
    if(state!==previousState||motion!==previousMotion||interaction!==previousInteraction){
      previousState=state;previousMotion=motion;previousInteraction=interaction;wakeUntil=timestamp+900;
    }
    stateMix.listening=mix(stateMix.listening,state==='listening'?1:0,blend);
    stateMix.thinking=mix(stateMix.thinking,state==='thinking'?1:0,blend);
    if(motion)phase+=delta*(.90+stateMix.listening*.10+stateMix.thinking*.36);
    if(motion){submitAge+=delta;completeAge+=delta;}else{submitAge=Infinity;completeAge=Infinity;}
    pointer.x=pointer.targetX;pointer.y=pointer.targetY;
    pointer.presence=interaction?pointer.targetPresence:0;
    pressStrength=clamp((147-Math.hypot(pointer.x,pointer.y))/27,0,1)*pointer.presence;
    energy=mix(energy,clamp(Number(getEnergy())||0,0,1),1-Math.exp(-delta/.075));
    visual.listening=stateMix.listening;visual.thinking=stateMix.thinking;
    visual.completeProgress=completeAge<1.25?completeAge/1.25:-1;
    // Advance transport once, before any geometry samples its shared displacement.
    const surface=coreField.render(pointer,pressStrength,energy,delta,phase,visual);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.translate(centerX,centerY);ctx.scale(scale,scale);
    drawRibbons(phase);drawOrbits(phase);drawAccretion(phase);drawGlint(phase);
    for(let i=0;i<satellites.length;i++) {
      const satellite=satellites[i],position=satellitePositions[i];
      const angle=satellite.angle+phase*TAU/satellite.period*satellite.direction;
      const x=satellite.a*Math.cos(angle),y=satellite.b*Math.sin(angle);
      position.x=x*Math.cos(satellite.tilt)-y*Math.sin(satellite.tilt);
      position.y=x*Math.sin(satellite.tilt)+y*Math.cos(satellite.tilt);
      position.depth=Math.sin(angle);position.r=satellite.radius*(.94+position.depth*.14);
    }
    // Small visual separation prevents different orbital periods overlapping.
    for(let a=0;a<3;a++)for(let b=a+1;b<3;b++) {
      const p=satellitePositions[a],q=satellitePositions[b],dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);
      if(d>0&&d<29){const push=(29-d)*.5/d;p.x-=dx*push;p.y-=dy*push;q.x+=dx*push;q.y+=dy*push;}
    }
    for(const satellite of satellitePositions)if(satellite.depth<0)drawSatellite(satellite);
    drawCore(surface);
    for(const satellite of satellitePositions)if(satellite.depth>=0)drawSatellite(satellite);
    const cueActive=submitAge<1.35||completeAge<1.25;
    const settling=Math.abs(stateMix.listening-(state==='listening'?1:0))>.003||Math.abs(stateMix.thinking-(state==='thinking'?1:0))>.003;
    if(motion||cueActive||settling||timestamp<wakeUntil)requestFrame();
    else refreshTimer=setTimeout(()=>{refreshTimer=0;requestFrame();},180);
  }
  function onVisibility() {
    clearTimeout(refreshTimer);refreshTimer=0;lastTime=0;
    if(document.hidden){cancelAnimationFrame(frame);frame=0;}
    else invalidate();
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pointermove',onPointer,{passive:true});
  function onPointerUp(event){if(event.pointerType!=='mouse')onLeave();}
  window.addEventListener('pointerup',onPointerUp,{passive:true});
  window.addEventListener('pointercancel',onLeave,{passive:true});
  document.addEventListener('pointerleave',onLeave);
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('blur',onLeave);
  requestFrame();
  return {
    cue(type) {
      if(destroyed||!getMotion())return;
      if(type==='submit')submitAge=0;
      else if(type==='complete')completeAge=0;
      else return;
      invalidate();
    },
    destroy() {
      destroyed=true;cancelAnimationFrame(frame);clearTimeout(refreshTimer);
      orbitalImage.onload=null;
      window.removeEventListener('resize',resize);
      window.removeEventListener('pointermove',onPointer);
      window.removeEventListener('pointerup',onPointerUp);
      window.removeEventListener('pointercancel',onLeave);
      document.removeEventListener('pointerleave',onLeave);
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('blur',onLeave);
      coreField.destroy();
    },
  };
}
