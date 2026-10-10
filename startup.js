import { sceneLayout } from './scene-layout.js';

export function playStartup(app) {
  const overlay = document.querySelector('#startup');
  const video = overlay.querySelector('video');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let finished = false;
  let timer;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    document.documentElement.classList.remove('is-starting');
    app.inert = false;
    video.pause();
    video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
    video.removeAttribute('poster');
    video.load();
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
  const onKey = event => { if (event.key === 'Escape') finish(); };
  const onPreference = () => { if (reduced.matches) finish(); };
  if (reduced.matches) { finish(); return; }
  app.inert = true;
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('keydown', onKey);
  reduced.addEventListener('change', onPreference);
  // Animation begins immediately; network delays never hold the page hostage.
  video.play().catch(() => {});
  overlay.addEventListener('animationend', event => {
    if (event.target === overlay && event.animationName === 'startup-exit') finish();
  });
  timer = setTimeout(finish, 7200);
}
