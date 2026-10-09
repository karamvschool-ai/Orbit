import { createSingularity } from './singularity.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const settings = { motion: !reducedMotion.matches, interaction: true };
let energy = 0;
let voicePreview = false;
let processingTimer;
let toastTimer;
let attachedFiles = [];
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

function closePopovers() {
  for (const id of ['attach', 'response']) {
    $(`#${id}-menu`).hidden = true;
    $(id === 'attach' ? '#attach-button' : '#response-more').setAttribute('aria-expanded', 'false');
  }
}

function togglePopover(name) {
  const menu = $(`#${name}-menu`);
  const shouldOpen = menu.hidden;
  closePopovers();
  menu.hidden = !shouldOpen;
  $(name === 'attach' ? '#attach-button' : '#response-more').setAttribute('aria-expanded', String(shouldOpen));
}

function setVoice(active) {
  voicePreview = active;
  energy = active ? .55 : 0;
  $('#mic-button').setAttribute('aria-pressed', String(active));
  $('#mic-button').setAttribute('aria-label', active ? 'Stop voice preview' : 'Preview voice mode');
  $('#message-input').placeholder = active ? 'Listening... tap the mic to stop' : 'Type a message or ask me anything...';
  if (active) {
    $('#request-method use').setAttribute('href', '#i-wave');
    $('#request-status').textContent = 'Listening preview...';
    toast('Voice preview · no microphone recording');
  } else {
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
$('#choose-files').addEventListener('click', () => { closePopovers(); $('#file-input').click(); });
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
  closePopovers();
  try {
    await navigator.clipboard.writeText($('#current-response').textContent);
    toast('Response copied.');
  } catch { toast('Copy is unavailable in this browser.'); }
});
$('#replay-response').addEventListener('click', () => {
  closePopovers();
  demoPrompt($('#current-request').textContent, $('#request-method use').getAttribute('href') === '#i-wave' ? 'voice' : 'text');
});

function setTasks(open) {
  const mobile = matchMedia('(max-width: 900px)').matches;
  $('#task-panel').classList.toggle('is-closed', !open);
  $('#task-panel').classList.toggle('mobile-open', open);
  $('#task-panel').inert = !open;
  $('#restore-tasks').classList.toggle('visible', !open && !mobile);
  if (!open) $('#restore-tasks').focus({ preventScroll: true });
}
$('#close-tasks').addEventListener('click', () => setTasks(false));
$('#restore-tasks').addEventListener('click', () => {
  setTasks(true);
  $('#close-tasks').focus({ preventScroll: true });
});
const mobileQuery = matchMedia('(max-width: 900px)');
$('#task-panel').inert = mobileQuery.matches;
mobileQuery.addEventListener('change', (event) => {
  $('#task-panel').classList.remove('is-closed', 'mobile-open');
  $('#restore-tasks').classList.remove('visible');
  $('#task-panel').inert = event.matches;
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
  button.addEventListener('click', () => openPanel('home'));
  header.append(heading, button);
  return header;
}

function openPanel(name) {
  const panel = $('#side-panel');
  document.querySelectorAll('.nav-button').forEach((button) => {
    const active = button.dataset.panel === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  panel.replaceChildren();
  panel.hidden = name === 'home';
  if (name === 'home') return;
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
      button.addEventListener('click', () => { demoPrompt(item.prompt); openPanel('home'); });
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
    const isOpen = button.classList.contains('active');
    openPanel(isOpen ? 'home' : button.dataset.panel);
  });
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.popover, #attach-button, #response-more')) closePopovers();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePopovers();
    openPanel('home');
    if (voicePreview) setVoice(false);
    if ($('#task-panel').classList.contains('mobile-open')) setTasks(false);
    $('#message-input').blur();
  }
  if (event.key === '/' && !event.target.matches('input, textarea')) {
    event.preventDefault();
    $('#message-input').focus();
  }
});
reducedMotion.addEventListener('change', (event) => { settings.motion = !event.matches; });
window.addEventListener('pagehide', () => { scene.destroy(); clearInterval(processingTimer); clearTimeout(toastTimer); });
