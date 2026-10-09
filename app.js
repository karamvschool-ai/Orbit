import { createSingularity } from './singularity.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const settings = { motion: !reducedMotion.matches, interaction: true };
let energy = 0;
let voicePreview = false;
let processingTimer = null;
let toastTimer;
let attachedFiles = [];
let activePopover = null;
let panelInvoker = null;
const overlays = [];
const mobileQuery = matchMedia('(max-width: 900px)');
const compactInputQuery = matchMedia('(max-width: 550px)');
let tasksOpen = !mobileQuery.matches;
const conversations = [
  { title: 'Research notes', time: 'Today', prompt: 'Make me a summary of my research notes.' },
  { title: 'Weekly planning', time: 'Yesterday', prompt: 'Help me plan a thoughtful week.' },
  { title: 'Project ideas', time: 'Yesterday', prompt: 'Help me explore ideas for my next project.' },
];
const scene = createSingularity($('#singularity'), {
  getEnergy: () => energy,
  getMotion: () => settings.motion,
  getInteraction: () => settings.interaction,
  getState: () => voicePreview ? 'listening' : energy > .7 ? 'thinking' : 'idle',
});

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
}

function rememberOverlay(name) {
  forgetOverlay(name);
  overlays.push(name);
}

function forgetOverlay(name) {
  const index = overlays.indexOf(name);
  if (index !== -1) overlays.splice(index, 1);
}

function popoverTrigger(name) {
  return $(name === 'attach' ? '#attach-button' : '#response-more');
}

function closePopovers({ restoreFocus = false } = {}) {
  const trigger = activePopover ? popoverTrigger(activePopover) : null;
  for (const id of ['attach', 'response']) {
    $(`#${id}-menu`).hidden = true;
    popoverTrigger(id).setAttribute('aria-expanded', 'false');
  }
  activePopover = null;
  forgetOverlay('popover');
  if (restoreFocus && trigger) trigger.focus({ preventScroll: true });
}

function togglePopover(name) {
  const menu = $(`#${name}-menu`);
  const shouldOpen = menu.hidden;
  closePopovers();
  menu.hidden = !shouldOpen;
  popoverTrigger(name).setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) {
    activePopover = name;
    rememberOverlay('popover');
    menu.querySelector('button').focus({ preventScroll: true });
  }
}

function updateInputPlaceholder() {
  $('#message-input').placeholder = voicePreview ? 'Listening... tap the mic to stop' :
    compactInputQuery.matches ? 'Ask me anything...' : 'Type a message or ask me anything...';
}

updateInputPlaceholder();
compactInputQuery.addEventListener('change', updateInputPlaceholder);

function setVoice(active) {
  voicePreview = active;
  energy = active ? .55 : 0;
  $('#mic-button').setAttribute('aria-pressed', String(active));
  $('#mic-button').setAttribute('aria-label', active ? 'Stop voice preview' : 'Preview voice mode');
  updateInputPlaceholder();
  if (active) {
    if (processingTimer !== null) {
      clearInterval(processingTimer);
      processingTimer = null;
      $('#active-task-description').textContent = 'Preview paused';
      $('.task-row.running').setAttribute('aria-label', `${$('#active-task-title').textContent}, preview paused at ${$('#task-percent').textContent}`);
      $('#current-response').textContent = 'Your text preview is paused. Send a message to start again.';
    }
    $('.response-island').classList.remove('is-thinking');
    $('#status-ring').classList.remove('ready');
    $('#request-method use').setAttribute('href', '#i-wave');
    $('#request-status').textContent = 'Listening preview...';
    toast('Voice preview · no microphone recording');
  } else {
    $('#status-ring').classList.add('ready');
    $('#request-status').textContent = 'Ready when you are.';
  }
}

function replyFor(text) {
  const words = text.toLowerCase();
  if (words.includes('research') || words.includes('notes') || words.includes('summar')) {
    return 'I reviewed your notes, organized the key points, and prepared a concise summary for you.';
  }
  if (words.includes('plan') || words.includes('week') || words.includes('schedule')) {
    return 'I mapped out your priorities and made room for focused work, a little curiosity, and time to recharge.';
  }
  if (words.includes('idea') || words.includes('project') || words.includes('creat')) {
    return 'I gathered a few directions to explore. Let’s start with the idea that sparks your curiosity most.';
  }
  return 'Your thought is here, in orbit. I’m ready to help you explore it when we bring this space to life.';
}

function demoPrompt(text, method = 'text') {
  clearInterval(processingTimer);
  processingTimer = null;
  closePopovers();
  if (voicePreview) setVoice(false);
  $('#current-request').textContent = text;
  $('#request-method use').setAttribute('href', method === 'voice' ? '#i-wave' : '#i-keyboard');
  $('#request-status').textContent = 'Working on your request...';
  $('#status-ring').classList.remove('ready');
  $('.response-island').classList.add('is-thinking');
  $('#current-response').textContent = 'Following the thread of your thought...';
  $('#active-task-title').textContent = /research|notes|summar/i.test(text) ? 'Summarizing research notes' : 'Exploring your request';
  $('#active-task-description').textContent = 'Gathering the pieces...';
  $('.task-row.running').classList.remove('is-complete');
  energy = .8;
  let progress = 0;
  const update = () => {
    $('.task-check.progress').style.setProperty('--progress', `${progress}%`);
    $('#task-percent').textContent = `${progress}%`;
    $('.task-row.running').setAttribute('aria-label', `${$('#active-task-title').textContent}, ${progress} percent complete`);
  };
  update();
  processingTimer = setInterval(() => {
    progress = Math.min(100, progress + 7 + Math.round(Math.random() * 8));
    update();
    if (progress >= 45) $('#active-task-description').textContent = 'Connecting the key points...';
    if (progress === 100) {
      clearInterval(processingTimer);
      processingTimer = null;
      $('#request-status').textContent = 'Your request is complete.';
      $('#status-ring').classList.add('ready');
      $('#current-response').textContent = replyFor(text);
      $('.response-island').classList.remove('is-thinking');
      $('#active-task-description').textContent = 'Complete';
      energy = 0;
      $('#live-status').textContent = 'Preview complete. ' + $('#current-response').textContent;
    }
  }, 240);
  if (!conversations.some((item) => item.prompt === text)) {
    conversations.unshift({ title: text.length > 32 ? text.slice(0, 32) + '…' : text, time: 'Just now', prompt: text });
    conversations.splice(8);
  }
}

$('#composer').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('#message-input').value.trim();
  if (!text) {
    $('#message-input').focus();
    toast('Add a thought to send it into orbit.');
    return;
  }
  demoPrompt(text);
  $('#message-input').value = '';
});
$('#mic-button').addEventListener('click', () => setVoice(!voicePreview));
$('#attach-button').addEventListener('click', () => togglePopover('attach'));
$('#response-more').addEventListener('click', () => togglePopover('response'));
$('#choose-files').addEventListener('click', () => { closePopovers({ restoreFocus: true }); $('#file-input').click(); });
$('#use-example').addEventListener('click', () => {
  closePopovers();
  $('#message-input').value = 'Help me plan a thoughtful week.';
  $('#message-input').focus();
});
$('#file-input').addEventListener('change', (event) => {
  attachedFiles = Array.from(event.target.files);
  $('#attachment-chip').hidden = attachedFiles.length === 0;
  $('#attachment-name').textContent = attachedFiles.length === 1 ? attachedFiles[0].name : `${attachedFiles.length} files attached`;
  toast(attachedFiles.length === 1 ? 'File added to your workspace.' : `${attachedFiles.length} files added to your workspace.`);
  if ($('.nav-button[data-panel=workspace]').classList.contains('active')) openPanel('workspace');
});
$('#remove-attachment').addEventListener('click', () => {
  attachedFiles = [];
  $('#file-input').value = '';
  $('#attachment-chip').hidden = true;
});
$('#copy-response').addEventListener('click', async () => {
  closePopovers({ restoreFocus: true });
  try {
    await navigator.clipboard.writeText($('#current-response').textContent);
    toast('Response copied.');
  } catch { toast('Copy is unavailable in this browser.'); }
});
$('#replay-response').addEventListener('click', () => {
  closePopovers({ restoreFocus: true });
  demoPrompt($('#current-request').textContent, $('#request-method use').getAttribute('href') === '#i-wave' ? 'voice' : 'text');
});

function setTasks(open, { restoreFocus = false } = {}) {
  const mobile = mobileQuery.matches;
  const panel = $('#task-panel');
  const toggle = $('#restore-tasks');
  tasksOpen = open;
  panel.classList.toggle('is-closed', !open);
  panel.classList.toggle('mobile-open', mobile && open);
  panel.inert = !open;
  panel.setAttribute('aria-hidden', String(!open));
  toggle.hidden = !mobile && open;
  toggle.classList.toggle('visible', !open && !mobile);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', mobile && open ? 'Close tasks' : 'Open tasks');
  if (mobile && open) rememberOverlay('tasks');
  else forgetOverlay('tasks');
  if (restoreFocus && !open) toggle.focus({ preventScroll: true });
}
$('#close-tasks').addEventListener('click', () => setTasks(false, { restoreFocus: true }));
$('#restore-tasks').addEventListener('click', () => {
  setTasks(!tasksOpen);
  if (tasksOpen) $('#close-tasks').focus({ preventScroll: true });
});
setTasks(tasksOpen);
mobileQuery.addEventListener('change', (event) => {
  const panelHadFocus = $('#task-panel').contains(document.activeElement);
  const toggleHadFocus = document.activeElement === $('#restore-tasks');
  setTasks(!event.matches, { restoreFocus: event.matches && panelHadFocus });
  if (!event.matches && toggleHadFocus) $('#close-tasks').focus({ preventScroll: true });
});
document.querySelectorAll('.task-row').forEach((row) => {
  row.addEventListener('click', () => {
    if (row.classList.contains('running')) {
      toast(`${$('#active-task-title').textContent} · ${$('#task-percent').textContent} complete`);
      return;
    }
    const complete = row.classList.toggle('is-complete');
    row.setAttribute('aria-pressed', String(complete));
    const description = row.querySelector('.task-description');
    if (!description.dataset.original) description.dataset.original = description.textContent;
    description.textContent = complete ? 'Complete' : description.dataset.original;
  });
});

function panelHeader(title) {
  const header = document.createElement('div');
  header.className = 'panel-header';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const button = document.createElement('button');
  button.className = 'plain-button';
  button.setAttribute('aria-label', `Close ${title.toLowerCase()}`);
  button.innerHTML = '<svg class="icon"><use href="#i-close"/></svg>';
  button.addEventListener('click', () => openPanel('home', { restoreFocus: true }));
  header.append(heading, button);
  return header;
}

function openPanel(name, { restoreFocus = false } = {}) {
  const panel = $('#side-panel');
  const invoker = panelInvoker;
  document.querySelectorAll('.nav-button').forEach((button) => {
    const active = button.dataset.panel === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    if (button.dataset.panel !== 'home') button.setAttribute('aria-expanded', String(active));
  });
  panel.replaceChildren();
  panel.hidden = name === 'home';
  if (name === 'home') {
    forgetOverlay('panel');
    panelInvoker = null;
    if (restoreFocus && invoker) invoker.focus({ preventScroll: true });
    return;
  }
  panelInvoker = $(`.nav-button[data-panel="${name}"]`);
  rememberOverlay('panel');
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  panel.setAttribute('aria-label', title);
  panel.append(panelHeader(title));
  if (name === 'conversations') {
    conversations.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'conversation-item';
      button.innerHTML = '<svg class="icon"><use href="#i-chat"/></svg><span><strong></strong><small></small></span>';
      button.querySelector('strong').textContent = item.title;
      button.querySelector('small').textContent = item.time;
      button.addEventListener('click', () => { demoPrompt(item.prompt); openPanel('home', { restoreFocus: true }); });
      panel.append(button);
    });
  }
  if (name === 'workspace') {
    const caption = document.createElement('p');
    caption.className = 'panel-caption';
    caption.textContent = 'A little space for the things you’re working on.';
    panel.append(caption);
    const files = attachedFiles.length ? attachedFiles.map((file) => file.name) : ['Research notes.pdf', 'Project outline.md', 'Reading list.txt'];
    files.forEach((name) => {
      const row = document.createElement('div');
      row.className = 'workspace-file';
      row.innerHTML = '<svg class="icon"><use href="#i-file"/></svg><span></span>';
      row.querySelector('span').textContent = name;
      panel.append(row);
    });
    const button = document.createElement('button');
    button.className = 'panel-action';
    button.innerHTML = '<svg class="icon"><use href="#i-plus"/></svg> Add files';
    button.addEventListener('click', () => $('#file-input').click());
    panel.append(button);
  }
  if (name === 'settings') {
    const caption = document.createElement('p');
    caption.className = 'panel-caption';
    caption.textContent = 'Make this space feel like yours.';
    panel.append(caption);
    for (const setting of [
      { key: 'motion', label: 'Ambient motion', description: 'Let the singularity drift' },
      { key: 'interaction', label: 'Cursor gravity', description: 'Bend the space around you' },
    ]) {
      const row = document.createElement('div');
      row.className = 'setting-row';
      row.innerHTML = `<span>${setting.label}<small>${setting.description}</small></span><button class="switch" role="switch" aria-label="${setting.label}" aria-checked="${settings[setting.key]}"></button>`;
      row.querySelector('button').addEventListener('click', (event) => {
        settings[setting.key] = !settings[setting.key];
        event.currentTarget.setAttribute('aria-checked', String(settings[setting.key]));
      });
      panel.append(row);
    }
    const hint = document.createElement('p');
    hint.className = 'keyboard-hint';
    hint.innerHTML = 'Press <kbd>/</kbd> to start a thought.';
    panel.append(hint);
  }
}
document.querySelectorAll('.nav-button').forEach((button) => {
  button.addEventListener('click', () => {
    closePopovers();
    const isOpen = button.classList.contains('active');
    openPanel(isOpen ? 'home' : button.dataset.panel);
  });
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.popover, #attach-button, #response-more')) closePopovers();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const overlay = overlays.at(-1);
    if (overlay === 'popover') closePopovers({ restoreFocus: true });
    else if (overlay === 'panel') openPanel('home', { restoreFocus: true });
    else if (overlay === 'tasks') setTasks(false, { restoreFocus: true });
    else if (voicePreview) setVoice(false);
    else return;
    event.preventDefault();
    return;
  }
  if (event.key === '/' && !event.target.matches('input, textarea')) {
    event.preventDefault();
    $('#message-input').focus();
  }
});
reducedMotion.addEventListener('change', (event) => { settings.motion = !event.matches; });
window.addEventListener('pagehide', () => { scene.destroy(); clearInterval(processingTimer); clearTimeout(toastTimer); });
