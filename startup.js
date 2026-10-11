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
  timer = setTimeout(finish, 9800);
}
