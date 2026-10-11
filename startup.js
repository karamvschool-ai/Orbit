import { sceneLayout } from './scene-layout.js';

const ease = (time, start, duration) => {
  const t = Math.max(0, Math.min(1, (time - start) / duration));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function playStartup(app) {
  const overlay = document.querySelector('#startup');
  const video = overlay.querySelector('video');
  const circle = overlay.querySelector('.startup-trace circle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let finished = false, frame = 0, decodedFrame, mediaStart, timer, loadTimer;
  let mediaSpan = 6.3, elapsed = 0;
  const trails = [];
  const heads = [];
  const echoes = [];
  let flare, backdrop;
  let layout;
  let wordmark;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer); clearTimeout(loadTimer);
    if (decodedFrame !== undefined) video.cancelVideoFrameCallback?.(decodedFrame);
    video.removeEventListener('loadeddata', onLoaded);
    video.removeEventListener('ended', finish);
    video.pause();
    overlay.remove();
    app.style.removeProperty('opacity');
    document.documentElement.classList.remove('is-starting');
    app.inert = false;
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    reduced.removeEventListener('change', onPreference);
  };
  const resize = () => {
    layout = sceneLayout(innerWidth, innerHeight);
    overlay.style.setProperty('--intro-x', `${layout.x}px`);
    overlay.style.setProperty('--intro-y', `${layout.y}px`);
    overlay.style.setProperty('--intro-radius', `${112 * layout.scale}px`);
  };
  const render = () => {
    if (finished) return;
    // Every visual samples the same decoded-media clock. Buffering pauses the
    // entire composition instead of letting CSS run ahead of the black hole.
    elapsed = Math.max(elapsed, video.currentTime - mediaStart);
    const time = elapsed * 6.3 / mediaSpan;
    const trace = ease(time, .2, 1.65);
    const formation = ease(time, 1.45, 1.65);
    const handoff = ease(time, 4.55, 1.75);
    const coreMerge = ease(time, 4.95, 1.35);
    const arrival = ease(time, 1.2, .35) * (1 - ease(time, 1.7, .45));
    circle.style.strokeWidth = String(1.25 + arrival * .55);
    circle.style.strokeDashoffset = String(1 - trace);
    circle.style.opacity = String(ease(time, .2, .08) * (1 - ease(time, 1.9, .85)));
    const trailOpacity = ease(time, .2, .12) * (1 - ease(time, 1.55, .3));
    for (const trail of trails) {
      trail.style.strokeDashoffset = String(.1 - trace * 1.2);
      trail.style.opacity = String(trailOpacity * .7);
    }
    // Rim echoes carry the same arrival energy into the disk's lensing pulse.
    const ignition = ease(time, 1.85, .55) * (1 - ease(time, 2.75, .8));
    for (let i=0; i<echoes.length; i++) {
      const ring=echoes[i];
      ring.style.strokeDashoffset=String(1-trace);
      ring.style.opacity=String((arrival*.38+ignition*.5)*(1-i*.19));
      ring.style.transform=`rotate(${i*19}deg) scale(${1+ignition*(.055+i*.025)})`;
    }
    flare.style.opacity=String(ignition*.75);
    flare.style.transform=`rotate(${ignition*4}deg)`;
    const headProgress=Math.min(1,trace*1.2), u=1-headProgress;
    for (const head of heads) {
      const p=head.points, t=headProgress;
      head.node.setAttribute('cx',u*u*u*p[0]+3*u*u*t*p[2]+3*u*t*t*p[4]+t*t*t*p[6]);
      head.node.setAttribute('cy',u*u*u*p[1]+3*u*u*t*p[3]+3*u*t*t*p[5]+t*t*t*p[7]);
      head.node.style.opacity=String(trailOpacity*(.4+trace*.6));
    }
    // Uncover the actual footage from the photon ring outward. Brightness stays
    // fixed: the disk forms spatially rather than dissolving in as a flat image.
    // Reveal an annulus first: footage also contains a bright disk across its
    // center, so an outer aperture alone exposes that stripe before the rim.
    const revealRadius = 112 * layout.scale * (.5 + formation * 4.78) * (1 - handoff * .78);
    const revealFeather = 112 * layout.scale * (.04 + formation * .31);
    const innerRadius = 112 * layout.scale * 1.18 * (1-ease(time,1.85,.7));
    const innerFeather = 112 * layout.scale * .09;
    const horizonMask = `radial-gradient(circle at center, #000 ${revealRadius-revealFeather}px, rgba(0,0,0,.5) ${revealRadius}px, transparent ${revealRadius+revealFeather}px), radial-gradient(circle at center, transparent ${innerRadius-innerFeather}px, #000 ${innerRadius+innerFeather}px)`;
    video.style.maskImage = horizonMask;
    video.style.webkitMaskImage = horizonMask;
    video.style.maskComposite = 'intersect';
    video.style.webkitMaskComposite = 'source-in';
    video.style.opacity = String(1 - coreMerge);
    wordmark.style.opacity = String(ease(time, 3.55, .6) * (1-coreMerge));
    for (const [i,letter] of [...wordmark.children].entries()) {
      const reveal=ease(time,3.55+i*.055,.7);
      letter.style.clipPath=`inset(${(1-reveal)*50}% 0 ${(1-reveal)*50}% 0)`;
    }
    const farthest = Math.hypot(Math.max(layout.x, innerWidth-layout.x), Math.max(layout.y, innerHeight-layout.y));
    // The darkness recedes toward the fixed core while the disk collapses into
    // its rim. Keep the footage separate so the page reveal cannot cut it off.
    const radius = (farthest + 150) * (1-handoff) + 112 * layout.scale * handoff;
    const feather = 100 + handoff * 70;
    const mask = `radial-gradient(circle at ${layout.x}px ${layout.y}px, #000 ${Math.max(0,radius-feather)}px, rgba(0,0,0,.5) ${radius}px, transparent ${radius+feather}px)`;
    backdrop.style.maskImage = mask;
    backdrop.style.webkitMaskImage = mask;
    backdrop.style.opacity = String(1-coreMerge);
    app.style.opacity = handoff > 0 ? '1' : '0';
    if (time >= 6.3) { finish(); return; }
    frame = requestAnimationFrame(render);
  };
  const begin = (_timestamp, metadata) => {
    if (finished || mediaStart !== undefined) return;
    clearTimeout(loadTimer);
    mediaStart = metadata?.mediaTime ?? video.currentTime;
    mediaSpan = Number.isFinite(video.duration) ? Math.max(.1, Math.min(6.3, video.duration - mediaStart - .12)) : 6.3;
    video.classList.add('is-ready');
    frame = requestAnimationFrame(render);
  };
  const onLoaded = () => {
    if (video.requestVideoFrameCallback) decodedFrame = video.requestVideoFrameCallback(begin);
    else begin();
  };
  const onKey = event => { if (event.key === 'Escape') finish(); };
  const onPreference = () => { if (reduced.matches) finish(); };
  if (reduced.matches) { finish(); return; }
  wordmark = app.querySelector('.orbit-wordmark').cloneNode(true);
  wordmark.classList.add('startup-wordmark');
  overlay.append(wordmark);
  const ns = 'http://www.w3.org/2000/svg';
  backdrop=document.createElement('div'); backdrop.classList.add('startup-backdrop');
  overlay.append(backdrop);
  flare=document.createElement('div'); flare.classList.add('startup-lensing-flare');
  overlay.querySelector('.startup-position').append(flare);
  const field = document.createElementNS(ns, 'svg');
  field.setAttribute('viewBox', '-520 -320 1040 640');
  field.classList.add('startup-currents');
  // A real circular exclusion zone absorbs incoming strokes at the rim.
  const defs = document.createElementNS(ns, 'defs');
  const gradient = document.createElementNS(ns, 'radialGradient');
  gradient.setAttribute('id', 'startup-rim-gradient');
  gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
  gradient.setAttribute('cx', '0'); gradient.setAttribute('cy', '0'); gradient.setAttribute('r', '136');
  for (const [offset,color] of [['84%','#000'],['100%','#fff']]) {
    const stop = document.createElementNS(ns, 'stop');
    stop.setAttribute('offset', offset); stop.setAttribute('stop-color', color); gradient.append(stop);
  }
  const exclusion = document.createElementNS(ns, 'mask');
  exclusion.setAttribute('id', 'startup-rim-exclusion');
  exclusion.setAttribute('maskUnits', 'userSpaceOnUse');
  exclusion.setAttribute('x', '-520'); exclusion.setAttribute('y', '-320');
  exclusion.setAttribute('width', '1040'); exclusion.setAttribute('height', '640');
  const bounds = document.createElementNS(ns, 'rect');
  bounds.setAttribute('x','-520'); bounds.setAttribute('y','-320'); bounds.setAttribute('width','1040'); bounds.setAttribute('height','640'); bounds.setAttribute('fill','#fff');
  const absorption = document.createElementNS(ns, 'circle');
  absorption.setAttribute('r','136'); absorption.setAttribute('fill','url(#startup-rim-gradient)');
  exclusion.append(bounds,absorption); defs.append(gradient,exclusion); field.append(defs);
  const currents = document.createElementNS(ns, 'g');
  currents.setAttribute('mask', 'url(#startup-rim-exclusion)'); field.append(currents);
  for (let i=0; i<28; i++) {
    const angle = i*Math.PI*2/28;
    const point = (radius,a,squash=1) => `${(Math.cos(a)*radius).toFixed(2)},${(Math.sin(a)*radius*squash).toFixed(2)}`;
    const endAngle = angle + .78;
    const endX = Math.cos(endAngle)*116, endY = Math.sin(endAngle)*116;
    const controlX = endX + Math.cos(endAngle)*48 - Math.sin(endAngle)*90;
    const controlY = endY + Math.sin(endAngle)*48 + Math.cos(endAngle)*90;
    const trail = document.createElementNS(ns, 'path');
    trail.setAttribute('d', `M${point(440,angle,.78)} C${point(320,angle+.18,.88)} ${controlX.toFixed(2)},${controlY.toFixed(2)} ${endX.toFixed(2)},${endY.toFixed(2)}`);
    trail.setAttribute('pathLength', '1');
    trail.style.strokeWidth = i%4===0 ? '1.4px' : '.7px';
    currents.append(trail); trails.push(trail);
    const head = document.createElementNS(ns,'circle');
    head.setAttribute('r',i%4===0?'1.65':'.9');head.setAttribute('fill','#fff');head.style.opacity='0';
    currents.append(head);
    heads.push({node:head,points:[Math.cos(angle)*440,Math.sin(angle)*440*.78,Math.cos(angle+.18)*320,Math.sin(angle+.18)*320*.88,controlX,controlY,endX,endY]});
  }
  const rim=document.createElementNS(ns,'g');rim.classList.add('startup-rim-echoes');
  for(let i=0;i<3;i++) {
    const echo=document.createElementNS(ns,'circle');
    echo.setAttribute('r',String(115+i*4));echo.setAttribute('pathLength','1');
    echo.setAttribute('fill','none');echo.setAttribute('stroke','#fff');echo.setAttribute('stroke-width',i===0?'1.15':'.5');
    echo.setAttribute('stroke-dasharray','1 1');echo.setAttribute('stroke-dashoffset','1');echo.style.opacity='0';
    rim.append(echo);echoes.push(echo);
  }
  field.append(rim);
  overlay.querySelector('.startup-position').append(field);
  app.inert = true;
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('keydown', onKey);
  reduced.addEventListener('change', onPreference);
  video.loop = false;
  video.addEventListener('ended', finish, { once: true });
  video.addEventListener('loadeddata', onLoaded, { once: true });
  if (video.readyState >= 2) onLoaded();
  video.play().catch(finish);
  loadTimer = setTimeout(() => { if (mediaStart === undefined) finish(); }, 2500);
  timer = setTimeout(finish, 11000);
}
