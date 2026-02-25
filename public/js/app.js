/* ===== RYLAC APP - Main Frontend Script ===== */

// ===== STATE =====
let currentUser = null;
let currentChat = null; // { userId, username, displayName, avatar, isOnline, lastSeen }
let socket = null;
let typingTimer = null;
let mediaToSend = null; // { data: base64, mime: string, type: 'image'|'audio' }
let gifToSend = null;
let searchDebounce = null;
let activeMenus = [];
let isMobile = window.innerWidth <= 768;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });
  document.addEventListener('click', closeAllMenus);
  try {
    const res = await api('/api/auth/me');
    if (res.user) {
      currentUser = res.user;
      initApp();
    } else {
      showPage('auth-page');
    }
  } catch {
    showPage('auth-page');
  }
});

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function initApp() {
  showPage('chat-page');
  applyTheme(currentUser.theme);
  updateSelfInfo();
  initSocket();
  loadContacts();
  if (currentUser.role === 'admin') {
    document.getElementById('admin-menu-btn').classList.remove('hidden');
  }
}

// ===== API HELPER =====
async function api(url, options = {}) {
  const defaults = { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  const config = { ...defaults, ...options };
  if (config.body && typeof config.body === 'object') config.body = JSON.stringify(config.body);
  const res = await fetch(url, config);
  if (res.status === 401) {
    // Try refresh
    try {
      await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      const res2 = await fetch(url, config);
      return res2.json();
    } catch {
      currentUser = null;
      showPage('auth-page');
      return {};
    }
  }
  return res.json();
}

// ===== AUTH =====
function switchTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').classList.toggle('active', tab === 'login');
  document.getElementById('register-form').classList.toggle('active', tab === 'register');
  document.getElementById('tab-slider').classList.toggle('right', tab === 'register');
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  setLoading(btn, true);
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: {
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value,
      }
    });
    if (res.error) { showError(errEl, res.error); return; }
    currentUser = res.user;
    initApp();
  } catch (err) {
    showError(errEl, 'Login gagal. Coba lagi.');
  } finally { setLoading(btn, false); }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const errEl = document.getElementById('register-error');
  errEl.classList.add('hidden');
  setLoading(btn, true);
  try {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: {
        username: document.getElementById('reg-username').value,
        displayName: document.getElementById('reg-displayname').value,
        password: document.getElementById('reg-password').value,
      }
    });
    if (res.error) { showError(errEl, res.error); return; }
    currentUser = res.user;
    initApp();
  } catch { showError(errEl, 'Registrasi gagal. Coba lagi.'); }
  finally { setLoading(btn, false); }
}

async function handleLogout() {
  closeAllMenus();
  await api('/api/auth/logout', { method: 'POST' });
  if (socket) socket.disconnect();
  socket = null; currentUser = null; currentChat = null;
  document.getElementById('contacts-items').innerHTML = '';
  document.getElementById('messages-list').innerHTML = '';
  showPage('auth-page');
}

// ===== SOCKET =====
function initSocket() {
  if (typeof io === 'undefined') {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onload = connectSocket;
    document.head.appendChild(script);
  } else { connectSocket(); }
}

function connectSocket() {
  socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });

  socket.on('connect', () => console.log('Socket connected'));
  socket.on('connect_error', err => console.warn('Socket error:', err.message));

  socket.on('message:new', (msg) => {
    if (currentChat && (msg.fromId === currentChat.userId || msg.toId === currentChat.userId)) {
      appendMessage(msg);
      socket.emit('message:read', { fromId: msg.fromId });
      scrollToBottom();
    } else {
      incrementUnread(msg.fromId);
      showToast(`Pesan dari @${msg.fromId}`, 'info');
    }
    refreshContactForMessage(msg);
  });

  socket.on('message:sent', (msg) => {
    // Replace optimistic with real
    const optimistic = document.querySelector(`[data-id="${msg.tempId}"]`);
    if (optimistic) {
        optimistic.dataset.msgId = msg._id;
        optimistic.setAttribute('data-optimistic', 'false');
    }
    refreshContactForMessage(msg);
  });

  socket.on('message:read', ({ byUserId }) => {
    if (currentChat && byUserId === currentChat.userId) markChatRead();
  });

  socket.on('user:status', ({ userId, isOnline, lastSeen }) => {
    if (currentChat && userId === currentChat.userId) {
      currentChat.isOnline = isOnline;
      currentChat.lastSeen = lastSeen;
      updateChatHeader();
    }
    updateContactStatus(userId, isOnline);
  });

  socket.on('typing:start', ({ fromId }) => {
    if (currentChat && fromId === currentChat.userId) {
      document.getElementById('typing-indicator').classList.remove('hidden');
      scrollToBottom();
    }
  });

  socket.on('typing:stop', ({ fromId }) => {
    if (currentChat && fromId === currentChat.userId) {
      document.getElementById('typing-indicator').classList.add('hidden');
    }
  });

  socket.on('error', ({ message }) => showToast(message, 'error'));
}

// ===== CONTACTS =====
async function loadContacts() {
  const loading = document.getElementById('contacts-loading');
  const empty = document.getElementById('contacts-empty');
  const items = document.getElementById('contacts-items');
  loading.style.display = 'block'; empty.classList.add('hidden');

  try {
    const [contactsRes, unreadRes] = await Promise.all([
      api('/api/users/contacts'),
      api('/api/messages/unread'),
    ]);
    loading.style.display = 'none';
    const contacts = contactsRes.contacts || [];
    const unread = unreadRes.unread || {};

    if (contacts.length === 0) { empty.classList.remove('hidden'); return; }
    items.innerHTML = '';
    contacts.forEach(u => renderContactItem(u, unread[u.userId] || 0));
  } catch { loading.style.display = 'none'; }
}

function renderContactItem(user, unreadCount = 0) {
  const items = document.getElementById('contacts-items');
  const existing = document.getElementById(`contact-${user.userId}`);
  const el = existing || document.createElement('div');

  el.id = `contact-${user.userId}`;
  el.className = 'contact-item' + (currentChat?.userId === user.userId ? ' active' : '');
  el.onclick = () => openChat(user);
  el.innerHTML = `
    <div class="avatar-wrap">
      <img class="avatar" src="${user.avatar || avatarFallback(user.username)}" alt="" onerror="this.src='${avatarFallback(user.username)}'"/>
      <div class="online-dot ${user.isOnline ? 'active' : ''}" id="status-dot-${user.userId}"></div>
    </div>
    <div class="contact-content">
      <div class="contact-name">${escHtml(user.displayName || user.username)}</div>
      <div class="contact-last-msg" id="last-msg-${user.userId}">@${escHtml(user.username)}</div>
    </div>
    <div class="contact-meta">
      <span class="contact-time" id="contact-time-${user.userId}"></span>
      ${unreadCount > 0 ? `<span class="contact-unread" id="unread-${user.userId}">${unreadCount}</span>` : `<span id="unread-${user.userId}" style="display:none"></span>`}
    </div>`;

  if (!existing) items.appendChild(el);
}

function refreshContactForMessage(msg) {
  const otherId = msg.fromId === currentUser.userId ? msg.toId : msg.fromId;
  const lastMsgEl = document.getElementById(`last-msg-${otherId}`);
  const timeEl = document.getElementById(`contact-time-${otherId}`);
  if (lastMsgEl) {
    const preview = msg.type === 'text' ? msg.content : msg.type === 'gif' ? '🎬 GIF' : msg.type === 'image' ? '🖼️ Gambar' : '🎵 Audio';
    lastMsgEl.textContent = preview;
  }
  if (timeEl) timeEl.textContent = formatTime(msg.timestamp);
  // Move to top
  const contactEl = document.getElementById(`contact-${otherId}`);
  if (contactEl) {
    const items = document.getElementById('contacts-items');
    items.prepend(contactEl);
  }
}

function updateContactStatus(userId, isOnline) {
  const dot = document.getElementById(`status-dot-${userId}`);
  if (dot) dot.className = `online-dot ${isOnline ? 'active' : ''}`;
}

function incrementUnread(fromId) {
  const el = document.getElementById(`unread-${fromId}`);
  if (el) {
    const current = parseInt(el.textContent) || 0;
    el.textContent = current + 1;
    el.style.display = '';
  }
}

// ===== OPEN CHAT =====
async function openChat(user) {
  currentChat = { ...user };
  // Update active state
  document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
  const contactEl = document.getElementById(`contact-${user.userId}`);
  if (contactEl) contactEl.classList.add('active');

  // Reset unread
  const unreadEl = document.getElementById(`unread-${user.userId}`);
  if (unreadEl) { unreadEl.textContent = '0'; unreadEl.style.display = 'none'; }

  document.getElementById('chat-welcome').style.display = 'none';
  document.getElementById('chat-area').style.display = 'flex';
  updateChatHeader();

  if (isMobile) {
    document.getElementById('sidebar').classList.add('hidden-mobile');
    document.getElementById('chat-area').classList.add('mobile-active');
  }

  // Load messages
  const msgList = document.getElementById('messages-list');
  const loading = document.getElementById('messages-loading');
  msgList.innerHTML = ''; loading.style.display = 'block';

  try {
    const res = await api(`/api/messages/${user.userId}`);
    loading.style.display = 'none';
    (res.messages || []).forEach(m => appendMessage(m));
    scrollToBottom();
    await api(`/api/messages/read/${user.userId}`, { method: 'PUT' });
  } catch { loading.style.display = 'none'; }

  document.getElementById('message-input').focus();
}

function closeChatMobile() {
  document.getElementById('sidebar').classList.remove('hidden-mobile');
  document.getElementById('chat-area').classList.remove('mobile-active');
}

function updateChatHeader() {
  if (!currentChat) return;
  document.getElementById('chat-avatar').src = currentChat.avatar || avatarFallback(currentChat.username);
  document.getElementById('chat-display-name').textContent = currentChat.displayName || currentChat.username;
  const statusEl = document.getElementById('chat-status');
  const dotEl = document.getElementById('chat-online-dot');
  if (currentChat.isOnline) {
    statusEl.textContent = 'online';
    statusEl.className = 'chat-status online';
    dotEl.className = 'online-dot active';
  } else {
    statusEl.textContent = currentChat.lastSeen ? 'terakhir ' + formatRelativeTime(currentChat.lastSeen) : 'offline';
    statusEl.className = 'chat-status';
    dotEl.className = 'online-dot';
  }
}

// ===== MESSAGES =====
function appendMessage(msg, isOptimistic = false) {
  const list = document.getElementById('messages-list');
  const isOut = msg.fromId === currentUser.userId;
  const groupClass = isOut ? 'out' : 'in';

  const group = document.createElement('div');
  group.className = `msg-group ${groupClass}`;
  group.dataset.id = msg._id;
  if (isOptimistic) group.setAttribute('data-optimistic', 'true');

  const avatar = isOut ? (currentUser.avatar || avatarFallback(currentUser.username)) : (currentChat.avatar || avatarFallback(currentChat.username));
  const username = isOut ? currentUser.username : currentChat.username;

  let bubbleContent = '';
  if (msg.type === 'text') {
    bubbleContent = `<div class="msg-bubble">${escHtml(msg.content)}</div>`;
  } else if (msg.type === 'image') {
    const src = msg.mediaData ? `data:${msg.mediaMime};base64,${msg.mediaData}` : '';
    bubbleContent = `<div class="msg-bubble is-image"><img src="${src}" alt="image" onclick="openImageFull(this.src)" loading="lazy"/></div>`;
  } else if (msg.type === 'audio') {
    const src = msg.mediaData ? `data:${msg.mediaMime};base64,${msg.mediaData}` : '';
    bubbleContent = `<div class="msg-bubble is-audio"><audio controls src="${src}"></audio></div>`;
  } else if (msg.type === 'gif') {
    bubbleContent = `<div class="msg-bubble is-gif"><img src="${msg.gifUrl}" alt="GIF" loading="lazy"/></div>`;
  }

  const checkmark = isOut ? `<span class="read-check">${msg.read ? '✓✓' : '✓'}</span>` : '';
  
  group.innerHTML = `
    <img class="msg-avatar" src="${avatar}" alt="" onerror="this.src='${avatarFallback(username)}'"/>
    <div class="msg-content-wrap">
      ${bubbleContent}
      <div class="msg-meta">${formatTime(msg.timestamp)}${checkmark}</div>
    </div>
  `;
  list.appendChild(group);
}

function markChatRead() {
  document.querySelectorAll('.msg-group.out .read-check').forEach(el => el.textContent = '✓✓');
}

function scrollToBottom() {
  const container = document.getElementById('messages-container');
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

// ===== SEND MESSAGE =====
async function sendMessage() {
  if (!currentChat) return;
  const input = document.getElementById('message-input');
  const text = input.value.trim();

  if (gifToSend) { sendGif(); return; }
  if (mediaToSend) { sendMedia(); return; }
  if (!text) return;

  input.value = ''; autoResize(input);

  const tempId = 'opt_' + Date.now();
  // Optimistic UI
  const optimisticMsg = {
    _id: tempId,
    fromId: currentUser.userId,
    toId: currentChat.userId,
    type: 'text',
    content: text,
    timestamp: new Date().toISOString(),
    read: false,
  };
  appendMessage(optimisticMsg, true);
  scrollToBottom();

  socket.emit('message:send', {
    toId: currentChat.userId,
    type: 'text',
    content: text,
    tempId
  });
  clearTyping();
}

async function sendMedia() {
  if (!mediaToSend || !currentChat) return;
  const preview = document.getElementById('media-preview');
  preview.classList.add('hidden');
  const { data, mime, type } = mediaToSend;
  mediaToSend = null;

  socket.emit('message:send', {
    toId: currentChat.userId,
    type,
    mediaData: data,
    mediaMime: mime,
  });

  const optimistic = {
    _id: 'opt_' + Date.now(),
    fromId: currentUser.userId,
    toId: currentChat.userId,
    type,
    mediaData: data,
    mediaMime: mime,
    timestamp: new Date().toISOString(),
    read: false,
  };
  appendMessage(optimistic);
  scrollToBottom();
}

async function sendGif() {
  if (!gifToSend || !currentChat) return;
  const gif = gifToSend;
  gifToSend = null;
  closeGifPicker();

  socket.emit('message:send', {
    toId: currentChat.userId,
    type: 'gif',
    gifUrl: gif.url,
    gifPreview: gif.preview,
  });

  const optimistic = {
    _id: 'opt_' + Date.now(),
    fromId: currentUser.userId,
    toId: currentChat.userId,
    type: 'gif',
    gifUrl: gif.url,
    timestamp: new Date().toISOString(),
    read: false,
  };
  appendMessage(optimistic);
  scrollToBottom();
}

function handleInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleTyping() {
  if (!currentChat || !socket) return;
  socket.emit('typing:start', { toId: currentChat.userId });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { socket.emit('typing:stop', { toId: currentChat.userId }); }, 2000);
}

function clearTyping() {
  clearTimeout(typingTimer);
  if (socket && currentChat) socket.emit('typing:stop', { toId: currentChat.userId });
}

// ===== FILE UPLOAD =====
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  if (file.size > 1 * 1024 * 1024) { showToast('File terlalu besar! Maksimal 1MB.', 'error'); return; }

  const type = file.type.startsWith('image/') ? 'image' : 'audio';
  const reader = new FileReader();
  reader.onload = (ev) => {
    const base64 = ev.target.result.split(',')[1];
    mediaToSend = { data: base64, mime: file.type, type };
    const preview = document.getElementById('media-preview');
    preview.classList.remove('hidden');
    const img = document.getElementById('preview-img');
    const audio = document.getElementById('preview-audio');
    if (type === 'image') {
      img.src = ev.target.result; img.style.display = 'block'; audio.style.display = 'none';
    } else {
      audio.src = ev.target.result; audio.style.display = 'block'; img.style.display = 'none';
    }
    gifToSend = null;
  };
  reader.readAsDataURL(file);
}

function cancelMedia() {
  mediaToSend = null;
  document.getElementById('media-preview').classList.add('hidden');
}

// ===== GIF PICKER =====
let gifSearchDebounce = null;

function toggleGifPicker() {
  const picker = document.getElementById('gif-picker');
  const isHidden = picker.classList.contains('hidden');
  picker.classList.toggle('hidden');
  if (isHidden) loadTrendingGifs();
}

function closeGifPicker() { document.getElementById('gif-picker').classList.add('hidden'); }

async function loadTrendingGifs() {
  const grid = document.getElementById('gif-grid');
  grid.innerHTML = '<div class="gif-loading">Memuat GIF trending...</div>';
  try {
    const res = await api('/api/messages/giphy/trending');
    renderGifs(res.data || []);
  } catch { grid.innerHTML = '<div class="gif-loading">Gagal memuat GIF</div>'; }
}

function searchGifs(q) {
  clearTimeout(gifSearchDebounce);
  if (!q.trim()) { loadTrendingGifs(); return; }
  gifSearchDebounce = setTimeout(async () => {
    const grid = document.getElementById('gif-grid');
    grid.innerHTML = '<div class="gif-loading">Mencari...</div>';
    try {
      const res = await api(`/api/messages/giphy/search?q=${encodeURIComponent(q)}`);
      renderGifs(res.data || []);
    } catch { grid.innerHTML = '<div class="gif-loading">Gagal mencari GIF</div>'; }
  }, 400);
}

function renderGifs(gifs) {
  const grid = document.getElementById('gif-grid');
  if (!gifs.length) { grid.innerHTML = '<div class="gif-loading">Tidak ada hasil</div>'; return; }
  grid.innerHTML = gifs.map(g => {
    const url = g.images.fixed_height_small?.url || g.images.preview_gif?.url;
    const full = g.images.fixed_height?.url || g.images.original?.url;
    return `<div class="gif-item" onclick="selectGif('${full}','${url}')"><img src="${url}" alt="gif" loading="lazy"/></div>`;
  }).join('');
}

function selectGif(url, preview) {
  gifToSend = { url, preview };
  closeGifPicker();
  // Show preview
  const prev = document.getElementById('media-preview');
  prev.classList.remove('hidden');
  const img = document.getElementById('preview-img');
  img.src = url; img.style.display = 'block';
  document.getElementById('preview-audio').style.display = 'none';
  mediaToSend = null;
}

// Override cancel for GIF
function cancelMedia() {
  mediaToSend = null; gifToSend = null;
  document.getElementById('media-preview').classList.add('hidden');
}

// ===== SEARCH USERS =====
function openSearch() {
  document.getElementById('search-bar-wrap').style.display = 'block';
  document.getElementById('search-input').focus();
}
function closeSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-results').classList.add('hidden');
}

function handleSearch(q) {
  clearTimeout(searchDebounce);
  if (!q.trim()) { closeSearch(); return; }
  searchDebounce = setTimeout(async () => {
    const resultsEl = document.getElementById('search-results');
    try {
      const res = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
      const users = res.users || [];
      resultsEl.classList.remove('hidden');
      if (!users.length) {
        resultsEl.innerHTML = '<div class="search-no-result">Pengguna tidak ditemukan</div>';
        return;
      }
      resultsEl.innerHTML = users.map(u => `
        <div class="search-result-item" onclick="startChatFromSearch(${JSON.stringify(u).replace(/"/g,'&quot;')})">
          <img class="avatar" style="width:36px;height:36px" src="${u.avatar || avatarFallback(u.username)}" onerror="this.src='${avatarFallback(u.username)}'"/>
          <div>
            <div class="search-result-name">${escHtml(u.displayName || u.username)}</div>
            <div class="search-result-id">@${escHtml(u.username)} · ID: ${u.userId}</div>
          </div>
        </div>`).join('');
    } catch {}
  }, 350);
}

function startChatFromSearch(user) {
  closeSearch();
  renderContactItem(user, 0);
  document.getElementById('contacts-empty').classList.add('hidden');
  openChat(user);
}

// ===== PROFILE =====
function updateSelfInfo() {
  document.getElementById('self-avatar').src = currentUser.avatar || avatarFallback(currentUser.username);
  document.getElementById('self-display-name').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('self-userid-badge').textContent = 'ID: ' + currentUser.userId;
  applyTheme(currentUser.theme);
}

function openProfile() {
  closeAllMenus();
  const u = currentUser;
  document.getElementById('profile-avatar').src = u.avatar || avatarFallback(u.username);
  document.getElementById('profile-userid').textContent = 'ID: ' + u.userId;
  document.getElementById('prof-displayname').value = u.displayName || '';
  document.getElementById('prof-username').value = u.username;
  document.getElementById('prof-bio').value = u.bio || '';
  document.getElementById('prof-avatar-url').value = u.avatar || '';
  openModal('profile-modal');
}

async function saveProfile(e) {
  e.preventDefault();
  const errEl = document.getElementById('profile-error');
  errEl.classList.add('hidden');
  try {
    const res = await api('/api/users/me/profile', {
      method: 'PUT',
      body: {
        displayName: document.getElementById('prof-displayname').value,
        bio: document.getElementById('prof-bio').value,
        avatar: document.getElementById('prof-avatar-url').value,
      }
    });
    if (res.error) { showError(errEl, res.error); return; }
    currentUser = res.user;
    updateSelfInfo();
    showToast('Profil berhasil disimpan!', 'success');
    closeModal('profile-modal');
  } catch { showError(errEl, 'Gagal menyimpan profil'); }
}

function viewPeerProfile() {
  if (!currentChat) return;
  closeAllMenus();
  const u = currentChat;
  document.getElementById('view-user-avatar').src = u.avatar || avatarFallback(u.username);
  document.getElementById('view-user-name').textContent = u.displayName || u.username;
  document.getElementById('view-user-username').textContent = '@' + u.username;
  document.getElementById('view-user-bio').textContent = u.bio || '';
  document.getElementById('view-user-id').textContent = 'ID: ' + u.userId;
  const dotEl = document.getElementById('view-user-online-dot');
  const statusEl = document.getElementById('view-user-status');
  dotEl.className = `online-dot ${u.isOnline ? 'active' : ''}`;
  statusEl.textContent = u.isOnline ? 'Online' : (u.lastSeen ? 'Terakhir ' + formatRelativeTime(u.lastSeen) : 'Offline');
  openModal('view-user-modal');
}

function startChatFromProfile() {
  closeModal('view-user-modal');
}

// ===== SETTINGS =====
function openSettings() {
  closeAllMenus();
  const toggle = document.getElementById('theme-toggle');
  toggle.classList.toggle('on', currentUser.theme === 'dark');
  openModal('settings-modal');
}

async function toggleTheme() {
  const isDark = currentUser.theme !== 'dark';
  currentUser.theme = isDark ? 'dark' : 'light';
  applyTheme(currentUser.theme);
  document.getElementById('theme-toggle').classList.toggle('on', isDark);
  await api('/api/users/me/profile', { method: 'PUT', body: { theme: currentUser.theme } });
}

function applyTheme(theme) {
  document.getElementById('app-body').className = theme === 'dark' ? 'theme-dark' : 'theme-light';
}

// ===== ADMIN =====
async function openAdmin() {
  closeAllMenus();
  openModal('admin-modal');
  const [statsRes, usersRes] = await Promise.all([
    api('/api/admin/stats'),
    api('/api/admin/users'),
  ]);
  if (statsRes.stats) {
    document.getElementById('stat-users').textContent = statsRes.stats.totalUsers;
    document.getElementById('stat-messages').textContent = statsRes.stats.totalMessages;
    document.getElementById('stat-online').textContent = statsRes.stats.onlineUsers;
  }
  const listEl = document.getElementById('admin-users-list');
  const users = usersRes.users || [];
  listEl.innerHTML = users.map(u => `
    <div class="admin-user-row" id="admin-row-${u.userId}">
      <img class="avatar" src="${u.avatar || avatarFallback(u.username)}" style="width:34px;height:34px;border-radius:50%" onerror="this.src='${avatarFallback(u.username)}'"/>
      <div class="admin-user-info">
        <div class="admin-user-name">${escHtml(u.displayName || u.username)} <span style="font-size:.73rem;color:var(--primary)">[${u.role}]</span></div>
        <div class="admin-user-meta">@${escHtml(u.username)} · ID: ${u.userId}</div>
      </div>
      ${u.userId !== currentUser.userId ? `<button class="admin-delete-btn" onclick="adminDeleteUser(${u.userId})">Hapus</button>` : '<span style="font-size:.75rem;color:var(--text-muted)">Saya</span>'}
    </div>`).join('');
}

async function adminDeleteUser(userId) {
  if (!confirm('Yakin hapus pengguna ini?')) return;
  const res = await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
  if (res.message) {
    document.getElementById(`admin-row-${userId}`)?.remove();
    showToast('Pengguna dihapus', 'success');
  } else { showToast(res.error || 'Gagal hapus', 'error'); }
}

// ===== MODAL =====
function openModal(id) { document.getElementById(id).classList.add('open'); document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); document.getElementById(id).style.display='none'; }

// ===== MENU =====
function toggleMainMenu() {
  const menu = document.getElementById('main-menu');
  menu.classList.toggle('open');
  event.stopPropagation();
}
function toggleChatMenu() {
  const menu = document.getElementById('chat-menu');
  menu.classList.toggle('open');
  event.stopPropagation();
}
function closeAllMenus() {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
}

// ===== OPEN IMAGE FULL =====
function openImageFull(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out';
  overlay.innerHTML = `<img src="${src}" style="max-width:95vw;max-height:95vh;border-radius:12px;object-fit:contain"/>`;
  overlay.onclick = () => document.body.removeChild(overlay);
  document.body.appendChild(overlay);
}

// ===== TOAST =====
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut .25s ease forwards';
    setTimeout(() => toast.remove(), 280);
  }, 3000);
}

// ===== UTILS =====
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarFallback(username) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username || 'user')}`;
}

function setLoading(btn, loading) {
  const span = btn.querySelector('span');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (span) span.style.opacity = loading ? '0' : '1';
  if (loader) loader.classList.toggle('hidden', !loading);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  return new Date(ts).toLocaleDateString('id-ID');
}
