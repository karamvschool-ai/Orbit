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
  let layout;
  let wordmark;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer); clearTimeout(loadTimer);
    if (decodedFrame !== undefined) video.cancelVideoFrameCallback?.(decodedFrame);
    video.removeEventListener('loadeddata', onLoaded);
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
    const time = Math.max(0, video.currentTime - mediaStart);
    const trace = ease(time, .2, 1.65);
    const formation = ease(time, 1.45, 2.25);
    const handoff = ease(time, 4.65, 1.65);
    circle.style.strokeDashoffset = String(1 - trace);
    circle.style.opacity = String(ease(time, .2, .08) * (1 - ease(time, 2.15, 1.15)));
    video.style.opacity = String(formation * (1 - handoff));
    wordmark.style.opacity = String(ease(time, 3.55, .9));
    const farthest = Math.hypot(Math.max(layout.x, innerWidth-layout.x), Math.max(layout.y, innerHeight-layout.y));
    const radius = handoff * (farthest + 150);
    const feather = handoff * 110;
    const mask = `radial-gradient(circle at ${layout.x}px ${layout.y}px, transparent ${Math.max(-4,radius-feather-4)}px, #000 ${radius+feather-2}px)`;
    overlay.style.maskImage = mask;
    overlay.style.webkitMaskImage = mask;
    // The opaque black overlay already covers the page before the handoff.
    // Reveal the actual canvas through a feathered aperture, with no scale jump.
    app.style.opacity = handoff > 0 ? '1' : '0';
    if (time >= 6.3) { finish(); return; }
    frame = requestAnimationFrame(render);
  };
  const begin = (_timestamp, metadata) => {
    if (finished || mediaStart !== undefined) return;
    clearTimeout(loadTimer);
    mediaStart = metadata?.mediaTime ?? video.currentTime;
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
  app.inert = true;
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('keydown', onKey);
  reduced.addEventListener('change', onPreference);
  video.addEventListener('loadeddata', onLoaded, { once: true });
  if (video.readyState >= 2) onLoaded();
  video.play().catch(finish);
  loadTimer = setTimeout(() => { if (mediaStart === undefined) finish(); }, 2500);
  timer = setTimeout(finish, 11000);
}
