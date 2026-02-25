// ============================================================
// Rylac App - Chat Page Logic
// ============================================================

const GIPHY_API_KEY = "dc6zaTOxFJmzC";
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

// ── State ──────────────────────────────────────────────────
let currentUser = null;
let currentChat = null; // { userId, displayName, username, avatar }
let socket = null;
let messages = [];
let currentPage = 1;
let hasMoreMessages = false;
let typingTimer = null;
let isTyping = false;
let pendingMediaData = null;
let pendingMediaType = null;
let pendingMediaMime = null;
let contextMenuTarget = null;
let gifSearchTimer = null;
let contacts = [];

// ── Init ───────────────────────────────────────────────────
(async function init() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res.json();
    currentUser = data.data;

    // Apply saved theme
    document.documentElement.setAttribute("data-theme", currentUser.theme || "light");
    updateThemeIcon();

    // Set my avatar
    const myAvatar = document.getElementById("my-avatar");
    if (myAvatar) {
      myAvatar.src = currentUser.avatar || generateAvatar(currentUser.displayName);
      myAvatar.alt = currentUser.displayName;
    }

    // Show admin nav if admin
    if (currentUser.role === "admin") {
      const adminNav = document.getElementById("admin-nav-item");
      if (adminNav) adminNav.style.display = "flex";
    }

    // Init socket
    initSocket();

    // Load contacts
    loadContacts();
  } catch (err) {
    console.error("Init error:", err);
    window.location.href = "/";
  }
})();

// ── Socket.io ─────────────────────────────────────────────
function initSocket() {
  socket = io({ transports: ["polling", "websocket"], withCredentials: true });

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.error("Socket error:", err.message);
    showToast("Connection error. Retrying…", "error");
  });

  // Receive new message
  socket.on("message:new", (msg) => {
    if (
      currentChat &&
      (msg.senderId === currentChat.userId || msg.receiverId === currentChat.userId)
    ) {
      appendMessage(msg);
      scrollToBottom();
      // Mark as read
      socket.emit("message:read", { senderId: currentChat.userId });
    } else {
      // Update contact unread badge
      updateContactUnreadBadge(msg.senderId);
      showToast(`New message from ${msg.senderId}`, "info");
    }
    // Refresh contacts
    loadContacts();
  });

  // Read receipt
  socket.on("message:readReceipt", ({ readBy }) => {
    if (currentChat && readBy === currentChat.userId) {
      updateReadReceipts();
    }
  });

  // Message deleted
  socket.on("message:deleted", ({ messageId }) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      const textEl = el.querySelector(".message-text");
      if (textEl) {
        textEl.textContent = "This message was deleted";
        textEl.style.fontStyle = "italic";
        textEl.style.color = "var(--text-muted)";
      }
      el.classList.add("deleted");
    }
  });

  // Typing
  socket.on("typing:start", ({ userId }) => {
    if (currentChat && userId === currentChat.userId) {
      document.getElementById("typing-indicator").classList.remove("hidden");
      scrollToBottom();
    }
  });

  socket.on("typing:stop", ({ userId }) => {
    if (currentChat && userId === currentChat.userId) {
      document.getElementById("typing-indicator").classList.add("hidden");
    }
  });

  // Online status changes
  socket.on("user:statusChange", ({ userId, isOnline, lastSeen }) => {
    // Update contact list
    updateContactStatus(userId, isOnline, lastSeen);
    // Update chat header if chatting with this user
    if (currentChat && userId === currentChat.userId) {
      updateChatHeaderStatus(isOnline, lastSeen);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
  });
}

// ── Contacts ──────────────────────────────────────────────
async function loadContacts() {
  try {
    const res = await fetch("/api/users/contacts", { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      contacts = data.data;
      if (!document.getElementById("search-input").value) {
        renderContacts(contacts);
      }
    }
  } catch (err) {
    console.error("Load contacts error:", err);
  }
}

function renderContacts(users) {
  const list = document.getElementById("contact-list");
  if (!users || users.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Search for a user to start chatting</p>
      </div>`;
    return;
  }

  list.innerHTML = users.map((u) => contactItemHTML(u)).join("");
}

function contactItemHTML(u) {
  const isActive = currentChat && currentChat.userId === u.userId;
  const lastSeen = formatLastSeen(u.isOnline, u.lastSeen);
  return `
    <div class="contact-item ${isActive ? "active" : ""}" data-user-id="${u.userId}" onclick="openChat('${u.userId}','${escHtml(u.displayName)}','${escHtml(u.username)}','${escHtml(u.avatar || "")}')">
      <div class="avatar-wrapper">
        <img src="${u.avatar || generateAvatar(u.displayName)}" alt="${escHtml(u.displayName)}" class="avatar" onerror="this.src='${generateAvatar(u.displayName)}'" />
        ${u.isOnline ? '<span class="online-dot"></span>' : ""}
      </div>
      <div class="contact-info">
        <div class="contact-name truncate">${escHtml(u.displayName)}</div>
        <div class="contact-last-msg">${lastSeen}</div>
      </div>
    </div>`;
}

// ── Search ────────────────────────────────────────────────
let searchTimer = null;
function handleSearch(value) {
  const clearBtn = document.getElementById("search-clear-btn");
  clearBtn.classList.toggle("hidden", !value);

  clearTimeout(searchTimer);
  if (!value.trim()) {
    renderContacts(contacts);
    return;
  }
  searchTimer = setTimeout(() => searchUsers(value), 300);
}

async function searchUsers(q) {
  try {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      const list = document.getElementById("contact-list");
      if (data.data.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>No users found for "${escHtml(q)}"</p></div>`;
      } else {
        list.innerHTML = `<div class="search-results-header">Search Results</div>` + data.data.map(contactItemHTML).join("");
      }
    }
  } catch (err) {
    console.error("Search error:", err);
  }
}

function clearSearch() {
  document.getElementById("search-input").value = "";
  document.getElementById("search-clear-btn").classList.add("hidden");
  renderContacts(contacts);
}

// ── Open Chat ─────────────────────────────────────────────
async function openChat(userId, displayName, username, avatar) {
  currentChat = { userId, displayName, username, avatar };
  currentPage = 1;
  messages = [];

  // Update UI
  document.getElementById("welcome-screen").classList.add("hidden");
  document.getElementById("active-chat").classList.remove("hidden");
  document.getElementById("active-chat").style.display = "flex";

  // Mobile: hide sidebar, show chat
  document.getElementById("sidebar").classList.add("hidden-mobile");
  document.getElementById("chat-panel").classList.remove("hidden-mobile");

  // Update header
  document.getElementById("chat-avatar").src = avatar || generateAvatar(displayName);
  document.getElementById("chat-avatar").onerror = () => { document.getElementById("chat-avatar").src = generateAvatar(displayName); };
  document.getElementById("chat-name").textContent = displayName;

  // Highlight active contact
  document.querySelectorAll(".contact-item").forEach((el) => el.classList.remove("active"));
  const activeEl = document.querySelector(`[data-user-id="${userId}"]`);
  if (activeEl) activeEl.classList.add("active");

  // Load messages
  await loadMessages();

  // Mark as read
  socket.emit("message:read", { senderId: userId });

  // Load user status
  loadUserStatus(userId);
}

async function loadUserStatus(userId) {
  try {
    const res = await fetch(`/api/users/${userId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      const u = data.data;
      updateChatHeaderStatus(u.isOnline, u.lastSeen);
      document.getElementById("chat-avatar").src = u.avatar || generateAvatar(u.displayName);
      if (u.isOnline) {
        document.getElementById("chat-online-dot").classList.remove("hidden");
      } else {
        document.getElementById("chat-online-dot").classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("Load user status error:", err);
  }
}

function updateChatHeaderStatus(isOnline, lastSeen) {
  const statusEl = document.getElementById("chat-status");
  const dotEl = document.getElementById("chat-online-dot");
  if (isOnline) {
    statusEl.textContent = "online";
    statusEl.style.color = "var(--accent)";
    dotEl.classList.remove("hidden");
  } else {
    statusEl.textContent = `last seen ${formatLastSeen(false, lastSeen)}`;
    statusEl.style.color = "var(--text-secondary)";
    dotEl.classList.add("hidden");
  }
}

function closeChat() {
  document.getElementById("sidebar").classList.remove("hidden-mobile");
  document.getElementById("chat-panel").classList.add("hidden-mobile");
  currentChat = null;
}

// ── Load Messages ─────────────────────────────────────────
async function loadMessages() {
  if (!currentChat) return;
  try {
    const res = await fetch(`/api/messages/${currentChat.userId}?page=${currentPage}&limit=50`, {
      credentials: "include",
    });
    const data = await res.json();
    if (!data.success) return;

    const newMessages = data.data;
    const messagesArea = document.getElementById("messages-area");

    if (currentPage === 1) {
      messagesArea.innerHTML = `<div id="load-more-btn" class="${newMessages.length < 50 ? "hidden" : ""}" style="text-align:center;padding:8px">
        <button class="btn btn-ghost" style="font-size:0.8125rem;padding:6px 16px" onclick="loadMoreMessages()">Load older messages</button>
      </div>`;
      messages = newMessages;
      renderAllMessages();
      scrollToBottom();
    } else {
      const prevHeight = messagesArea.scrollHeight;
      messages = [...newMessages, ...messages];
      // Re-render keeping scroll position
      const loadMoreBtn = document.getElementById("load-more-btn");
      const msgContainer = document.getElementById("messages-render");
      if (msgContainer) messagesArea.removeChild(msgContainer);
      const container = document.createElement("div");
      container.id = "messages-render";
      messagesArea.insertBefore(container, loadMoreBtn.nextSibling);
      messages.forEach((msg) => container.appendChild(createMessageEl(msg)));
      messagesArea.scrollTop = messagesArea.scrollHeight - prevHeight;
      if (newMessages.length < 50) {
        loadMoreBtn.classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("Load messages error:", err);
    showToast("Failed to load messages", "error");
  }
}

async function loadMoreMessages() {
  currentPage++;
  await loadMessages();
}

function renderAllMessages() {
  const messagesArea = document.getElementById("messages-area");
  let container = document.getElementById("messages-render");
  if (!container) {
    container = document.createElement("div");
    container.id = "messages-render";
    messagesArea.appendChild(container);
  }
  container.innerHTML = "";

  let lastDate = null;
  messages.forEach((msg) => {
    const msgDate = new Date(msg.createdAt).toDateString();
    if (msgDate !== lastDate) {
      container.appendChild(createDateDivider(msg.createdAt));
      lastDate = msgDate;
    }
    container.appendChild(createMessageEl(msg));
  });
}

function appendMessage(msg) {
  const messagesArea = document.getElementById("messages-area");
  let container = document.getElementById("messages-render");
  if (!container) {
    container = document.createElement("div");
    container.id = "messages-render";
    messagesArea.appendChild(container);
  }

  // Check if date divider needed
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    const lastDate = new Date(lastMsg.createdAt).toDateString();
    const newDate = new Date(msg.createdAt).toDateString();
    if (lastDate !== newDate) {
      container.appendChild(createDateDivider(msg.createdAt));
    }
  } else {
    container.appendChild(createDateDivider(msg.createdAt));
  }

  messages.push(msg);
  container.appendChild(createMessageEl(msg));
}

function createDateDivider(dateStr) {
  const div = document.createElement("div");
  div.className = "date-divider";
  div.textContent = formatDate(dateStr);
  return div;
}

function createMessageEl(msg) {
  const isOutgoing = msg.senderId === currentUser.userId;
  const isDeleted = msg.isDeleted;

  const group = document.createElement("div");
  group.className = `message-group ${isOutgoing ? "outgoing" : "incoming"}`;
  group.setAttribute("data-message-id", msg._id);

  const bubble = document.createElement("div");
  bubble.className = `message-bubble${isDeleted ? " deleted" : ""}`;

  // Content based on type
  if (isDeleted) {
    bubble.innerHTML = `<span class="message-text" style="font-style:italic;color:var(--text-muted)">🚫 This message was deleted</span>`;
  } else if (msg.type === "image" && msg.mediaData) {
    bubble.innerHTML = `<img src="${msg.mediaData}" class="message-image" alt="Image" onclick="openLightbox('${msg.mediaData}')" loading="lazy" />`;
  } else if (msg.type === "audio" && msg.mediaData) {
    bubble.innerHTML = `<audio controls class="message-audio" src="${msg.mediaData}"></audio>`;
  } else if (msg.type === "gif" && msg.gifUrl) {
    bubble.innerHTML = `<img src="${escHtml(msg.gifUrl)}" class="message-gif" alt="GIF" loading="lazy" />`;
  } else {
    bubble.innerHTML = `<span class="message-text">${escHtml(msg.content)}</span>`;
  }

  // Time + read receipt
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.style.justifyContent = "flex-end";
  meta.innerHTML = `
    <span class="message-time">${formatTime(msg.createdAt)}</span>
    ${isOutgoing ? `<span class="read-receipt ${msg.isRead ? "read" : "sent"}">${msg.isRead ? "✓✓" : "✓"}</span>` : ""}`;

  bubble.appendChild(meta);
  group.appendChild(bubble);

  // Right-click context menu
  if (!isDeleted) {
    group.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openContextMenu(e, msg._id, isOutgoing, msg.content, msg.type);
    });
  }

  return group;
}

function updateReadReceipts() {
  document.querySelectorAll(".read-receipt.sent").forEach((el) => {
    el.className = "read-receipt read";
    el.textContent = "✓✓";
  });
}

// ── Send Message ──────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById("message-input");
  const text = input.value.trim();

  if (!text && !pendingMediaData) return;
  if (!currentChat) return;

  const type = pendingMediaType || "text";
  const content = text || (type === "image" ? "[Image]" : type === "audio" ? "[Audio]" : "[File]");

  const payload = {
    receiverId: currentChat.userId,
    type,
    content,
    mediaData: pendingMediaData || null,
    mediaMimeType: pendingMediaMime || null,
  };

  // Clear input immediately
  input.value = "";
  input.style.height = "auto";
  clearMediaPreview();
  stopTyping();

  // Emit via socket
  socket.emit("message:send", payload, (ack) => {
    if (ack && ack.success) {
      appendMessage(ack.data);
      scrollToBottom();
      loadContacts();
    } else {
      showToast(ack?.error || "Failed to send message", "error");
    }
  });
}

// ── File Handling ─────────────────────────────────────────
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    showToast("File too large. Maximum size is 1MB.", "error");
    e.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingMediaData = ev.target.result; // base64 data URI
    pendingMediaMime = file.type;

    const previewEl = document.getElementById("media-preview");
    const imgEl = document.getElementById("preview-image");
    const audioEl = document.getElementById("preview-audio");
    const labelEl = document.getElementById("preview-label");

    previewEl.classList.remove("hidden");
    imgEl.classList.add("hidden");
    audioEl.classList.add("hidden");

    if (file.type.startsWith("image/")) {
      pendingMediaType = "image";
      imgEl.src = pendingMediaData;
      imgEl.classList.remove("hidden");
      labelEl.textContent = file.name;
    } else if (file.type.startsWith("audio/")) {
      pendingMediaType = "audio";
      audioEl.src = pendingMediaData;
      audioEl.classList.remove("hidden");
      labelEl.textContent = file.name;
    } else {
      showToast("Only images and audio files are supported", "error");
      clearMediaPreview();
    }
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

function clearMediaPreview() {
  pendingMediaData = null;
  pendingMediaType = null;
  pendingMediaMime = null;
  document.getElementById("media-preview").classList.add("hidden");
  document.getElementById("preview-image").src = "";
  document.getElementById("preview-audio").src = "";
}

// ── Typing ────────────────────────────────────────────────
function handleInputChange() {
  const input = document.getElementById("message-input");
  // Auto-resize textarea
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";

  if (!currentChat) return;
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing:start", { receiverId: currentChat.userId });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2000);
}

function stopTyping() {
  if (isTyping && currentChat) {
    isTyping = false;
    socket.emit("typing:stop", { receiverId: currentChat.userId });
  }
  clearTimeout(typingTimer);
}

function handleInputKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── GIF Picker ────────────────────────────────────────────
function toggleGifPicker() {
  const picker = document.getElementById("gif-picker");
  picker.classList.toggle("hidden");
  if (!picker.classList.contains("hidden")) {
    loadTrendingGifs();
    document.getElementById("gif-search-input").focus();
  }
}

function closeGifPicker() {
  document.getElementById("gif-picker").classList.add("hidden");
}

async function loadTrendingGifs() {
  const grid = document.getElementById("gif-grid");
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px"><div class="spinner" style="margin:auto"></div></div>`;
  try {
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=18&rating=g`
    );
    const data = await res.json();
    renderGifs(data.data);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Failed to load GIFs</p></div>`;
  }
}

function searchGifs(query) {
  clearTimeout(gifSearchTimer);
  if (!query.trim()) {
    loadTrendingGifs();
    return;
  }
  gifSearchTimer = setTimeout(async () => {
    const grid = document.getElementById("gif-grid");
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px"><div class="spinner" style="margin:auto"></div></div>`;
    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=18&rating=g`
      );
      const data = await res.json();
      renderGifs(data.data);
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Failed to load GIFs</p></div>`;
    }
  }, 500);
}

function renderGifs(gifs) {
  const grid = document.getElementById("gif-grid");
  if (!gifs || gifs.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>No GIFs found</p></div>`;
    return;
  }
  grid.innerHTML = gifs
    .map((g) => {
      const url = g.images.fixed_height_small.url;
      const original = g.images.original.url;
      return `<div class="gif-item" onclick="sendGif('${escHtml(original)}')">
        <img src="${escHtml(url)}" alt="${escHtml(g.title)}" loading="lazy" />
      </div>`;
    })
    .join("");
}

function sendGif(gifUrl) {
  if (!currentChat) return;
  closeGifPicker();

  socket.emit(
    "message:send",
    { receiverId: currentChat.userId, type: "gif", content: "[GIF]", gifUrl },
    (ack) => {
      if (ack && ack.success) {
        appendMessage(ack.data);
        scrollToBottom();
        loadContacts();
      } else {
        showToast(ack?.error || "Failed to send GIF", "error");
      }
    }
  );
}

// ── Context Menu ──────────────────────────────────────────
function openContextMenu(e, messageId, isOwn, content, type) {
  const menu = document.getElementById("context-menu");
  contextMenuTarget = { messageId, content, type, isOwn };

  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 100)}px`;
  menu.classList.remove("hidden");

  document.getElementById("delete-msg-btn").style.display = isOwn ? "flex" : "none";
}

document.addEventListener("click", () => {
  document.getElementById("context-menu").classList.add("hidden");
});

function copyMessage() {
  if (contextMenuTarget && contextMenuTarget.type === "text") {
    navigator.clipboard.writeText(contextMenuTarget.content).then(() => {
      showToast("Copied to clipboard", "success");
    });
  }
}

function deleteContextMessage() {
  if (!contextMenuTarget || !currentChat) return;
  socket.emit("message:delete", { messageId: contextMenuTarget.messageId, receiverId: currentChat.userId }, (ack) => {
    if (!ack || !ack.success) showToast("Failed to delete message", "error");
  });
}

// ── Clear Chat History (local UI only) ───────────────────
function clearChatHistory() {
  const container = document.getElementById("messages-render");
  if (container) container.innerHTML = "";
  messages = [];
  toggleChatMenu();
  showToast("Chat history cleared from view", "success");
}

// ── Status Updates ────────────────────────────────────────
function updateContactStatus(userId, isOnline, lastSeen) {
  const contact = document.querySelector(`[data-user-id="${userId}"]`);
  if (contact) {
    const dot = contact.querySelector(".online-dot");
    if (isOnline) {
      if (!dot) {
        const wrapper = contact.querySelector(".avatar-wrapper");
        const newDot = document.createElement("span");
        newDot.className = "online-dot";
        wrapper.appendChild(newDot);
      }
    } else {
      if (dot) dot.remove();
    }
    const lastMsgEl = contact.querySelector(".contact-last-msg");
    if (lastMsgEl) lastMsgEl.textContent = formatLastSeen(isOnline, lastSeen);
  }
}

function updateContactUnreadBadge(senderId) {
  const contact = document.querySelector(`[data-user-id="${senderId}"]`);
  if (contact) {
    let badge = contact.querySelector(".unread-badge");
    if (!badge) {
      const meta = document.createElement("div");
      meta.className = "contact-meta";
      badge = document.createElement("div");
      badge.className = "unread-badge";
      badge.textContent = "1";
      meta.appendChild(badge);
      contact.appendChild(meta);
    } else {
      badge.textContent = parseInt(badge.textContent) + 1;
    }
  }
}

// ── Profile Modal ─────────────────────────────────────────
let modalUserId = null;

async function openUserProfile() {
  if (!currentChat) return;
  modalUserId = currentChat.userId;
  await showUserProfileModal(currentChat.userId);
}

async function showUserProfileModal(userId) {
  try {
    const res = await fetch(`/api/users/${userId}`, { credentials: "include" });
    const data = await res.json();
    if (!data.success) return;
    const u = data.data;

    document.getElementById("modal-avatar").src = u.avatar || generateAvatar(u.displayName);
    document.getElementById("modal-displayname").textContent = u.displayName;
    document.getElementById("modal-username").textContent = `@${u.username}`;
    document.getElementById("modal-userid").textContent = `ID: ${u.userId}`;
    document.getElementById("modal-bio").textContent = u.bio || "No bio yet";
    document.getElementById("modal-status").textContent = formatLastSeen(u.isOnline, u.lastSeen);

    document.getElementById("profile-modal").classList.remove("hidden");
    toggleChatMenu();
  } catch (err) {
    showToast("Failed to load profile", "error");
  }
}

function closeProfileModal() {
  document.getElementById("profile-modal").classList.add("hidden");
}

function startChatWithModal() {
  closeProfileModal();
  if (modalUserId && modalUserId !== currentChat?.userId) {
    const u = contacts.find((c) => c.userId === modalUserId);
    if (u) openChat(u.userId, u.displayName, u.username, u.avatar);
  }
}

function openMyProfile() {
  window.location.href = "/profile";
}

// ── Lightbox ──────────────────────────────────────────────
function openLightbox(src) {
  document.getElementById("lightbox-img").src = src;
  document.getElementById("lightbox").classList.remove("hidden");
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
}

// ── Theme Toggle ──────────────────────────────────────────
async function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const newTheme = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  updateThemeIcon();
  try {
    await fetch("/api/users/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ theme: newTheme }),
    });
  } catch (err) {
    console.error("Theme save error:", err);
  }
}

function updateThemeIcon() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const icon = document.getElementById("theme-icon");
  if (!icon) return;
  if (isDark) {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  } else {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}

// ── Dropdown Menus ────────────────────────────────────────
function toggleSettingsMenu() {
  const menu = document.getElementById("settings-menu");
  menu.classList.toggle("hidden");
}

function toggleChatMenu() {
  const menu = document.getElementById("chat-menu");
  if (menu) menu.classList.toggle("hidden");
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#settings-btn")) {
    const m = document.getElementById("settings-menu");
    if (m) m.classList.add("hidden");
  }
  if (!e.target.closest("#chat-menu-btn")) {
    const m = document.getElementById("chat-menu");
    if (m) m.classList.add("hidden");
  }
  if (!e.target.closest("#gif-picker") && !e.target.closest(".icon-btn[title='Send GIF']")) {
    const gp = document.getElementById("gif-picker");
    if (gp) gp.classList.add("hidden");
  }
});

// ── Navigation ────────────────────────────────────────────
function goToProfile() { window.location.href = "/profile"; }
function goToAdmin() { window.location.href = "/admin"; }

async function handleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  } catch (err) {
    window.location.href = "/";
  }
}

// ── Toast Notifications ───────────────────────────────────
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Helpers ───────────────────────────────────────────────
function scrollToBottom() {
  const area = document.getElementById("messages-area");
  if (area) setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function formatLastSeen(isOnline, lastSeen) {
  if (isOnline) return "online";
  if (!lastSeen) return "offline";
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function generateAvatar(name) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=6366f1`;
}

function escHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
