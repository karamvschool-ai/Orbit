import { sceneLayout } from './scene-layout.js';

export function playStartup(app) {
  const overlay = document.querySelector('#startup');
  const video = overlay.querySelector('video');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let finished = false;
  let timer;
  let decodedFrame;
  const revealVideo = () => { if (!finished) video.classList.add("is-ready"); };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    document.documentElement.classList.remove('is-starting');
    app.inert = false;
    if (decodedFrame !== undefined) video.cancelVideoFrameCallback?.(decodedFrame);
    video.removeEventListener("loadeddata", onLoaded);
    video.pause();
    video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
    video.removeAttribute('poster');
    overlay.remove();
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    reduced.removeEventListener('change', onPreference);
  };
  const resize = () => {
    const layout = sceneLayout(innerWidth, innerHeight);
    overlay.style.setProperty('--intro-x', `${layout.x}px`);
    overlay.style.setProperty('--intro-y', `${layout.y}px`);
    overlay.style.setProperty('--intro-radius', `${112 * layout.scale}px`);
  };
  const onLoaded = () => {
    // Reveal only an actual decoded frame; a differently framed poster would jump.
    if (video.requestVideoFrameCallback) decodedFrame = video.requestVideoFrameCallback(revealVideo);
    else revealVideo();
  };
  const onKey = event => { if (event.key === 'Escape') finish(); };
  const onPreference = () => { if (reduced.matches) finish(); };
  if (reduced.matches) { finish(); return; }
  const wordmark = app.querySelector(".orbit-wordmark").cloneNode(true);
  wordmark.classList.add("startup-wordmark");
  overlay.append(wordmark);
  const svgNS = 'http://www.w3.org/2000/svg';
  const field = document.createElementNS(svgNS, 'svg');
  field.setAttribute('viewBox', '-520 -320 1040 640');
  field.classList.add('startup-currents');
  for (let i = 0; i < 28; i++) {
    const angle = i * Math.PI * 2 / 28;
    const point = (r,a) => `${(Math.cos(a)*r).toFixed(2)},${(Math.sin(a)*r*.78).toFixed(2)}`;
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', `M${point(440,angle)} C${point(330,angle+.32)} ${point(190,angle+.8)} ${point(118,angle+1.25)}`);
    path.setAttribute('pathLength', '1');
    path.style.setProperty('--trail-delay', `${.75+(i%7)*.12}s`);
    path.style.setProperty('--trail-width', `${i%4===0?1.5:.65}px`);
    field.append(path);
  }
  for (let i = 0; i < 3; i++) {
    const ring = document.createElementNS(svgNS, 'circle');
    ring.setAttribute('r', '112');
    ring.classList.add('startup-shock');
    ring.style.setProperty('--shock-delay', `${3.3+i*.18}s`);
    field.append(ring);
  }
  overlay.querySelector('.startup-position').append(field);
  app.inert = true;
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('keydown', onKey);
  reduced.addEventListener('change', onPreference);
  // Animation begins immediately; network delays never hold the page hostage.
  video.addEventListener("loadeddata", onLoaded, { once: true });
  if (video.readyState >= 2) onLoaded();
  video.play().catch(() => {});
  overlay.addEventListener('animationend', event => {
    if (event.target === overlay && event.animationName === 'startup-exit') finish();
  });
  timer = setTimeout(finish, 7400);
}
