import { createSingularity } from './singularity.js';
import { playStartup } from './startup.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const settings = { motion: true, interaction: true };
const app = $('.orbit-app');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let energy = 0;
let voicePreview = false;
let assistantState = 'idle';
let settleTimer;
let processingTimer = null;
let toastTimer;
let attachedFiles = [];
let activePopover = null;
let panelInvoker = null;
let activePage = 'home';
let pageExpanded = false;
let conversationQuery = '';
let fileQuery = '';
let selectedConversation = 'Make me a summary of my research notes.';
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
  getMotion: () => settings.motion && !reducedMotion.matches,
  getInteraction: () => settings.interaction && !pageExpanded,
  getState: () => assistantState,
  onLight: (strength,position) => {
    app.style.setProperty('--scene-reflection', strength.toFixed(3));
    app.style.setProperty('--scene-light-position', `${position.toFixed(1)}%`);
  },
});

function setAssistantState(state) {
  clearTimeout(settleTimer);
  assistantState = state;
  app.dataset.state = state;
  if (state === 'complete') settleTimer = setTimeout(() => setAssistantState('idle'), 2100);
}

function syncVisualPreferences() {
  app.dataset.motion = String(settings.motion && !reducedMotion.matches);
  if (!settings.motion || reducedMotion.matches) {
    app.querySelectorAll('.is-arriving, .is-revealed, .is-sending, .just-completed').forEach(node => {
      node.classList.remove('is-arriving', 'is-revealed', 'is-sending', 'just-completed');
    });
    clearSurfaceLight();
  }
}

function animateSurface(node, className) {
  node.classList.remove(className);
  if (!settings.motion || reducedMotion.matches) return;
  void node.offsetWidth;
  node.classList.add(className);
}

for (const node of [$('.request-island'), $('.response-island'), $('#composer'), $('#task-panel'), ...document.querySelectorAll('.task-row')]) {
  node.addEventListener('animationend', event => {
    if (event.target === node) node.classList.remove('is-arriving', 'is-revealed', 'is-sending', 'just-completed');
  });
}

// Light follows the cursor only within a glass surface, without moving its content.
let lightFrame = 0;
let lightSurface = null;
let lightPosition = null;
function clearSurfaceLight() {
  lightSurface?.classList.remove('is-lit');
  lightSurface = null;
  lightPosition = null;
  cancelAnimationFrame(lightFrame);
  lightFrame = 0;
}
function onSurfacePointer(event) {
  if (!finePointer.matches || !settings.motion || reducedMotion.matches || pageExpanded) return clearSurfaceLight();
  const surface = event.target.closest('.request-island, .response-island, .composer, .task-panel');
  if (surface !== lightSurface) {
    clearSurfaceLight();
    lightSurface = surface;
  }
  if (!surface) return;
  lightPosition = { x: event.clientX, y: event.clientY };
  if (lightFrame) return;
  lightFrame = requestAnimationFrame(() => {
    lightFrame = 0;
    if (!lightSurface || !lightPosition) return;
    const rect = lightSurface.getBoundingClientRect();
    lightSurface.style.setProperty('--light-x', `${((lightPosition.x - rect.left) / rect.width * 100).toFixed(1)}%`);
    lightSurface.style.setProperty('--light-y', `${((lightPosition.y - rect.top) / rect.height * 100).toFixed(1)}%`);
    lightSurface.classList.add('is-lit');
  });
}
document.addEventListener('pointermove', onSurfacePointer, { passive: true });
document.addEventListener('pointerleave', clearSurfaceLight);
window.addEventListener('blur', clearSurfaceLight);
setAssistantState('idle');
syncVisualPreferences();

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
  setAssistantState(active ? 'listening' : 'idle');
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
  setAssistantState('thinking');
  scene.cue?.('submit');
  animateSurface($('.request-island'), 'is-arriving');
  animateSurface($('#composer'), 'is-sending');
  $('#current-request').textContent = text;
  selectedConversation = text;
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
      setAssistantState('complete');
      scene.cue?.('complete');
      animateSurface($('.response-island'), 'is-revealed');
      animateSurface($('.task-row.running'), 'just-completed');
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
  const added = Array.from(event.target.files);
  if (!added.length) return;
  attachedFiles.push(...added);
  updateAttachmentChip();
  $('#file-input').value = '';
  fileQuery = '';
  selectedWorkspaceFile = workspaceFiles().at(-1).id;
  toast(added.length === 1 ? 'File added to your workspace.' : `${added.length} files added to your workspace.`);
  if (activePage === 'workspace') {
    openPanel('workspace');
    ($(`.file-card[data-file="${selectedWorkspaceFile}"]`) || $('#workspace-add-files')).focus({ preventScroll: true });
  }
});
$('#remove-attachment').addEventListener('click', () => {
  attachedFiles = [];
  $('#file-input').value = '';
  selectedWorkspaceFile = exampleFiles[0].id;
  updateAttachmentChip();
  if (activePage === 'workspace') openPanel('workspace');
  $('#attach-button').focus({ preventScroll: true });
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
  panel.inert = pageExpanded || !open;
  panel.setAttribute('aria-hidden', String(pageExpanded || !open));
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
    if (complete) animateSurface(row, 'just-completed');
    row.setAttribute('aria-pressed', String(complete));
    const description = row.querySelector('.task-description');
    if (!description.dataset.original) description.dataset.original = description.textContent;
    description.textContent = complete ? 'Complete' : description.dataset.original;
  });
});

function icon(symbol, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${symbol}`);
  svg.append(use);
  return svg;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(text, symbol, className, action) {
  const button = element('button', className);
  button.type = 'button';
  if (symbol) button.append(icon(symbol));
  button.append(element('span', '', text));
  button.addEventListener('click', action);
  return button;
}

function syncExpandedPage() {
  clearSurfaceLight();
  $('.orbit-app').classList.toggle('is-page-open', pageExpanded);
  $('#side-panel').classList.toggle('is-expanded', pageExpanded);
  for (const selector of ['.request-island', '.response-island', '#composer', '.orbit-wordmark', '#singularity']) {
    const node = $(selector);
    node.inert = pageExpanded;
    node.setAttribute('aria-hidden', String(pageExpanded));
  }
  $('#task-panel').inert = pageExpanded || !tasksOpen;
  $('#task-panel').setAttribute('aria-hidden', String(pageExpanded || !tasksOpen));
  $('#restore-tasks').inert = pageExpanded;
  $('#restore-tasks').setAttribute('aria-hidden', String(pageExpanded));
  const nav = $('.navigation');
  const navHadFocus = nav.contains(document.activeElement);
  nav.inert = pageExpanded && compactInputQuery.matches;
  nav.setAttribute('aria-hidden', String(pageExpanded && compactInputQuery.matches));
  if (nav.inert && navHadFocus) $('#panel-expand')?.focus({ preventScroll: true });
}
compactInputQuery.addEventListener('change', syncExpandedPage);

function setPanelExpanded(expanded) {
  closePopovers();
  openPanel(activePage, { expanded });
  $('#panel-expand').focus({ preventScroll: true });
}

function panelHeader(title) {
  const header = element('header', 'panel-header');
  const heading = element('div', 'panel-heading');
  if (pageExpanded) heading.append(element('span', 'panel-eyebrow', 'ORBIT / YOUR SPACE'));
  const titleNode = element('h2', '', title);
  titleNode.id = 'panel-title';
  heading.append(titleNode);
  const actions = element('div', 'panel-header-actions');
  const expand = actionButton(pageExpanded ? 'Quick view' : 'Expand', pageExpanded ? 'collapse' : 'expand', 'plain-button expand-button', () => setPanelExpanded(!pageExpanded));
  expand.id = 'panel-expand';
  expand.setAttribute('aria-label', `${pageExpanded ? 'Collapse' : 'Expand'} ${title.toLowerCase()}`);
  expand.setAttribute('aria-expanded', String(pageExpanded));
  expand.setAttribute('aria-controls', 'panel-body');
  expand.title = pageExpanded ? 'Return to quick view' : 'Open full page';
  const close = actionButton('Close', 'close', 'plain-button panel-close', () => openPanel('home', { restoreFocus: true }));
  close.setAttribute('aria-label', `Close ${title.toLowerCase()}`);
  actions.append(expand, close);
  header.append(heading, actions);
  return header;
}

function intro(title, description) {
  const section = element('div', 'page-intro');
  section.append(element('h3', '', title), element('p', '', description));
  return section;
}

function searchField(label, value, onInput) {
  const field = element('label', 'page-search');
  field.append(icon('search'));
  const input = element('input');
  input.type = 'search';
  input.placeholder = label;
  input.setAttribute('aria-label', label);
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  field.append(input);
  return field;
}

function beginMessage(text = '') {
  openPanel('home');
  $('#message-input').value = text;
  $('#message-input').focus({ preventScroll: true });
}

function selectedConversationItem() {
  return conversations.find(item => item.prompt === selectedConversation) || conversations[0];
}

function renderConversationDetail() {
  const detail = $('.conversation-detail');
  if (!detail) return;
  const item = selectedConversationItem();
  detail.replaceChildren();
  const header = element('div', 'detail-header');
  header.append(element('small', '', `${item.time} · Conversation`), element('h3', '', item.title));
  const thread = element('div', 'detail-thread');
  const request = element('div', 'thread-message is-user');
  request.append(element('span', 'message-label', 'YOU'), element('p', '', item.prompt));
  const response = element('div', 'thread-message is-assistant');
  response.append(element('span', 'message-label', 'ORBIT'), element('p', '', replyFor(item.prompt)));
  thread.append(request, response);
  const footer = element('div', 'detail-footer');
  footer.append(actionButton('Continue conversation', 'arrow', 'page-secondary', () => beginMessage(item.prompt)));
  detail.append(header, thread, footer);
}

function renderConversationCards() {
  const list = $('.conversation-list');
  if (!list) return;
  list.replaceChildren();
  const query = conversationQuery.trim().toLowerCase();
  const matches = conversations.filter(item => `${item.title} ${item.prompt}`.toLowerCase().includes(query));
  if (!matches.length) {
    list.append(element('div', 'page-empty', 'No conversations found. Try another search.'));
    return;
  }
  matches.forEach(item => {
    const button = element('button', 'conversation-card');
    button.type = 'button';
    button.dataset.prompt = item.prompt;
    button.classList.toggle('active', selectedConversationItem().prompt === item.prompt);
    button.setAttribute('aria-pressed', String(selectedConversationItem().prompt === item.prompt));
    const mark = element('span', 'conversation-icon');
    mark.append(icon('chat'));
    const copy = element('span', 'conversation-copy');
    copy.append(element('strong', '', item.title), element('p', '', item.prompt), element('small', '', item.time));
    button.append(mark, copy, icon('arrow', 'icon conversation-arrow'));
    button.addEventListener('click', () => {
      selectedConversation = item.prompt;
      list.querySelectorAll('.conversation-card').forEach(card => {
        const selected = card.dataset.prompt === selectedConversation;
        card.classList.toggle('active', selected);
        card.setAttribute('aria-pressed', String(selected));
      });
      renderConversationDetail();
    });
    list.append(button);
  });
}

function renderConversations(body) {
  if (!pageExpanded) {
    conversations.forEach(item => {
      const button = element('button', 'conversation-item');
      const copy = element('span');
      copy.append(element('strong', '', item.title), element('small', '', item.time));
      button.append(icon('chat'), copy);
      button.addEventListener('click', () => { demoPrompt(item.prompt); openPanel('home', { restoreFocus: true }); });
      body.append(button);
    });
    return;
  }
  body.append(intro('Pick up a thought.', 'A little room for the things you’re exploring.'));
  const toolbar = element('div', 'page-toolbar');
  toolbar.append(searchField('Search conversations', conversationQuery, value => { conversationQuery = value; renderConversationCards(); }),
    actionButton('New conversation', 'plus', 'page-primary', () => beginMessage()));
  const layout = element('div', 'conversation-layout');
  const index = element('section', 'conversation-index');
  index.setAttribute('aria-label', 'Conversation list');
  index.append(element('div', 'conversation-list'));
  const detail = element('section', 'conversation-detail');
  detail.setAttribute('aria-label', 'Selected conversation');
  detail.setAttribute('aria-live', 'polite');
  layout.append(index, detail);
  body.append(toolbar, layout);
  renderConversationCards();
  renderConversationDetail();
}

const exampleFiles = [
  { id: 'example-research', name: 'Research notes.pdf', type: 'PDF', label: 'Research · Example', title: 'Research notes', content: ['A few threads worth following.', 'The strongest ideas connect a clear question with a small, observable experiment. Start with the problems that appear repeatedly in your notes.', 'Key points', 'Keep the original question visible.', 'Group related observations before drawing conclusions.', 'Turn each promising idea into a simple next step.'] },
  { id: 'example-project', name: 'Project outline.md', type: 'MD', label: 'Planning · Example', title: 'Project outline', content: ['A quiet, personal assistant.', 'Orbit brings your thoughts, files, and plans into one calm space.', 'Next steps', 'Make the core interactions feel natural.', 'Give conversations and files room to breathe.', 'Keep the interface simple and focused.'] },
  { id: 'example-reading', name: 'Reading list.txt', type: 'TXT', label: 'Reading · Example', title: 'Reading list', content: ['Something to get curious about.', 'A short collection of topics to return to when there’s room to explore.', 'On the list', 'Human-centered interfaces', 'Creative routines and focused work', 'Patterns in natural motion'] },
];
const fileIds = new WeakMap();
let fileIdSequence = 0;
let selectedWorkspaceFile = exampleFiles[0].id;
let previewSequence = 0;

function workspaceFiles() {
  return [...exampleFiles, ...attachedFiles.map(file => {
    if (!fileIds.has(file)) fileIds.set(file, `local-${++fileIdSequence}`);
    const extension = file.name.split('.').pop();
    const type = file.name.includes('.') ? extension.toUpperCase().slice(0, 5) : 'FILE';
    const size = file.size < 1024 ? `${file.size} B` : file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1048576).toFixed(1)} MB`;
    return { id: fileIds.get(file), name: file.name, type, label: `${size} · On this device`, title: file.name, file };
  })];
}

function updateAttachmentChip() {
  $('#attachment-chip').hidden = !attachedFiles.length;
  $('#attachment-name').textContent = attachedFiles.length === 1 ? attachedFiles[0].name : `${attachedFiles.length} files attached`;
}

async function renderFilePreview() {
  const detail = $('.workspace-detail');
  if (!detail) return;
  const files = workspaceFiles();
  const item = files.find(file => file.id === selectedWorkspaceFile) || files[0];
  selectedWorkspaceFile = item.id;
  const sequence = ++previewSequence;
  detail.replaceChildren();
  const preview = element('div', 'file-preview');
  preview.append(element('small', '', item.file ? item.label : 'EXAMPLE DOCUMENT'), element('h3', '', item.title));
  detail.append(preview);
  if (item.content) {
    preview.append(element('p', '', item.content[0]), element('p', '', item.content[1]), element('h4', '', item.content[2]));
    const list = element('ul');
    item.content.slice(3).forEach(text => list.append(element('li', '', text)));
    preview.append(list);
  } else if (item.file.size > 2 * 1048576) {
    preview.append(element('p', 'workspace-note', 'This file is attached. Text previews are available for files up to 2 MB.'));
  } else if (/\.(txt|md|csv|json|log)$/i.test(item.name) || item.file.type.startsWith('text/')) {
    const text = element('pre', 'file-preview-text', 'Opening your file…');
    preview.append(text);
    try {
      const content = await item.file.text();
      if (sequence !== previewSequence || !text.isConnected) return;
      text.textContent = content.slice(0, 16000) || 'This file is empty.';
      if (content.length > 16000) preview.append(element('p', 'workspace-note', 'Showing the first 16,000 characters.'));
    } catch { text.textContent = 'This file could not be previewed.'; }
  } else {
    preview.append(element('p', 'workspace-note', 'Your file is attached and ready to use in a message. A text preview is not available for this file type.'));
  }
  const footer = element('div', 'detail-footer');
  footer.append(actionButton('Use in a message', 'arrow', 'page-secondary', () => beginMessage(`Help me review ${item.name}.`)));
  if (item.file) footer.append(actionButton('Remove file', null, 'file-remove', () => {
    attachedFiles = attachedFiles.filter(file => file !== item.file);
    $('#file-input').value = '';
    updateAttachmentChip();
    selectedWorkspaceFile = exampleFiles[0].id;
    renderFileCards();
    renderFilePreview();
    ($('.file-card') || $('.page-search input')).focus({ preventScroll: true });
  }));
  detail.append(footer);
}

function renderFileCards() {
  const grid = $('.file-grid');
  if (!grid) return;
  grid.replaceChildren();
  const query = fileQuery.trim().toLowerCase();
  const matches = workspaceFiles().filter(file => `${file.name} ${file.type}`.toLowerCase().includes(query));
  if (!matches.length) {
    grid.append(element('div', 'page-empty', 'No files found. Try another search or add a file.'));
    return;
  }
  matches.forEach(file => {
    const card = element('button', 'file-card');
    card.type = 'button';
    card.dataset.file = file.id;
    card.classList.toggle('active', file.id === selectedWorkspaceFile);
    card.setAttribute('aria-pressed', String(file.id === selectedWorkspaceFile));
    const mark = element('span', 'file-icon');
    mark.append(icon('file'));
    const copy = element('span', 'file-info');
    copy.append(element('strong', '', file.name), element('small', '', file.label));
    card.append(mark, copy, element('span', 'file-badge', file.type));
    card.addEventListener('click', () => {
      selectedWorkspaceFile = file.id;
      grid.querySelectorAll('.file-card').forEach(button => {
        const selected = button.dataset.file === file.id;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      renderFilePreview();
    });
    grid.append(card);
  });
}

function renderWorkspace(body) {
  const addFiles = actionButton('Add files', 'plus', pageExpanded ? 'page-primary' : 'panel-action', () => $('#file-input').click());
  addFiles.id = 'workspace-add-files';
  if (!pageExpanded) {
    body.append(element('p', 'panel-caption', 'A little space for the things you’re working on.'));
    workspaceFiles().forEach(file => {
      const row = element('div', 'workspace-file');
      row.append(icon('file'), element('span', '', file.name));
      body.append(row);
    });
    body.append(addFiles);
    return;
  }
  body.append(intro('Room for your ideas.', 'Notes, outlines, and the things that make a thought clearer.'));
  const toolbar = element('div', 'page-toolbar');
  toolbar.append(searchField('Search files', fileQuery, value => { fileQuery = value; renderFileCards(); }),
    addFiles);
  const layout = element('div', 'workspace-layout');
  layout.append(element('section', 'file-grid'), element('section', 'workspace-detail'));
  layout.firstChild.setAttribute('aria-label', 'Workspace files');
  layout.lastChild.setAttribute('aria-label', 'Selected file preview');
  body.append(toolbar, layout, element('p', 'workspace-note', 'Files you add stay on this device.'));
  renderFileCards();
  renderFilePreview();
}

function settingControl(setting) {
  const row = element('div', 'setting-row');
  const copy = element('span', '', setting.label);
  copy.append(element('small', '', setting.description));
  const button = element('button', 'switch');
  button.type = 'button';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', setting.label);
  const systemPaused = setting.key === 'motion' && reducedMotion.matches;
  button.setAttribute('aria-checked', String(settings[setting.key] && !systemPaused));
  button.disabled = systemPaused;
  if (systemPaused) copy.querySelector('small').textContent = 'Paused by your device’s reduced-motion setting';
  button.addEventListener('click', () => {
    settings[setting.key] = !settings[setting.key];
    syncVisualPreferences();
    button.setAttribute('aria-checked', String(settings[setting.key]));
    updateSettingsPreview();
  });
  row.append(copy, button);
  return row;
}

function updateSettingsPreview() {
  const motionEnabled = settings.motion && !reducedMotion.matches;
  const motionControl = $('.setting-row .switch[aria-label="Ambient motion"]');
  if (motionControl) {
    motionControl.disabled = reducedMotion.matches;
    motionControl.setAttribute('aria-checked', String(motionEnabled));
    motionControl.closest('.setting-row').querySelector('small').textContent = reducedMotion.matches
      ? 'Paused by your device’s reduced-motion setting' : 'Let the singularity drift';
  }
  const preview = $('.settings-preview');
  if (!preview) return;
  preview.dataset.motion = String(motionEnabled);
  preview.querySelector('.preview-motion-status').textContent = reducedMotion.matches
    ? 'Ambient motion is paused by your device' : motionEnabled ? 'Ambient motion is on' : 'Ambient motion is paused';
  preview.querySelector('.preview-interaction-status').textContent = settings.interaction ? 'Cursor gravity is on' : 'Cursor gravity is off';
}

function renderSettings(body) {
  const controls = [
    { key: 'motion', label: 'Ambient motion', description: 'Let the singularity drift' },
    { key: 'interaction', label: 'Cursor gravity', description: 'Bend the space around you' },
  ];
  if (!pageExpanded) {
    body.append(element('p', 'panel-caption', 'Make this space feel like yours.'));
    controls.forEach(setting => body.append(settingControl(setting)));
    const hint = element('p', 'keyboard-hint');
    hint.append(document.createTextNode('Press '), element('kbd', '', '/'), document.createTextNode(' to start a thought.'));
    body.append(hint);
    return;
  }
  body.append(intro('Make space feel like you.', 'A few thoughtful controls for a calmer orbit.'));
  const layout = element('div', 'settings-layout');
  const column = element('div', 'settings-controls');
  const motion = element('section', 'settings-card');
  motion.append(element('h3', '', 'Singularity'), element('p', '', 'Choose how your space moves and responds.'));
  controls.forEach(setting => motion.append(settingControl(setting)));
  const shortcuts = element('section', 'settings-card settings-shortcuts');
  shortcuts.append(element('h3', '', 'A little quicker'), element('p', '', 'Keep your hands on a thought.'));
  for (const [key, label] of [['/', 'Start a message'], ['Esc', 'Return to quick view'], ['Tab', 'Move between controls']]) {
    const row = element('div', 'shortcut-row');
    row.append(element('span', '', label), element('kbd', '', key));
    shortcuts.append(row);
  }
  column.append(motion, shortcuts);
  const preview = element('section', 'settings-preview');
  preview.setAttribute('aria-label', 'Singularity preferences preview');
  const orbital = element('div', 'preview-orbit');
  orbital.setAttribute('aria-hidden', 'true');
  orbital.append(element('span'), element('span'), element('span'));
  preview.append(element('small', 'panel-eyebrow', 'YOUR ORBIT'), orbital, element('h3', '', 'A quiet kind of energy.'), element('p', 'preview-motion-status'), element('p', 'preview-interaction-status'));
  layout.append(column, preview);
  body.append(layout);
  updateSettingsPreview();
}

function openPanel(name, { restoreFocus = false, expanded = pageExpanded } = {}) {
  const panel = $('#side-panel');
  const invoker = panelInvoker;
  activePage = name;
  pageExpanded = name !== 'home' && expanded;
  document.querySelectorAll('.nav-button').forEach(button => {
    const active = button.dataset.panel === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    if (button.dataset.panel !== 'home') button.setAttribute('aria-expanded', String(active));
  });
  panel.replaceChildren();
  panel.hidden = name === 'home';
  panel.dataset.page = name;
  if (name === 'home') {
    forgetOverlay('panel');
    panelInvoker = null;
    syncExpandedPage();
    if (restoreFocus && invoker) invoker.focus({ preventScroll: true });
    return;
  }
  panelInvoker = $(`.nav-button[data-panel="${name}"]`);
  rememberOverlay('panel');
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  panel.setAttribute('aria-label', title);
  panel.setAttribute('aria-labelledby', 'panel-title');
  panel.append(panelHeader(title));
  const body = element('div', 'panel-body');
  body.id = 'panel-body';
  panel.append(body);
  if (name === 'conversations') renderConversations(body);
  if (name === 'workspace') renderWorkspace(body);
  if (name === 'settings') renderSettings(body);
  syncExpandedPage();
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
    else if (overlay === 'panel') {
      if (pageExpanded) setPanelExpanded(false);
      else openPanel('home', { restoreFocus: true });
    }
    else if (overlay === 'tasks') setTasks(false, { restoreFocus: true });
    else if (voicePreview) setVoice(false);
    else return;
    event.preventDefault();
    return;
  }
  if (event.key === '/' && !event.target.matches('input, textarea')) {
    event.preventDefault();
    if (pageExpanded) beginMessage();
    else $('#message-input').focus();
  }
});
reducedMotion.addEventListener('change', () => {
  syncVisualPreferences();
  updateSettingsPreview();
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted) {
    clearSurfaceLight();
    return;
  }
  scene.destroy();
  clearInterval(processingTimer);
  clearTimeout(toastTimer);
  clearTimeout(settleTimer);
  clearSurfaceLight();
  document.removeEventListener('pointermove', onSurfacePointer);
  document.removeEventListener('pointerleave', clearSurfaceLight);
  window.removeEventListener('blur', clearSurfaceLight);
});

playStartup(app);
