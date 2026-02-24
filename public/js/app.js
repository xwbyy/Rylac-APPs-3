// public/js/app.js - Rylac App Frontend

const App = (() => {
  // ============ State ============
  let currentUser = null;
  let socket = null;
  let activeChat = null; // { userId, username, displayName, avatar }
  let pendingFile = null;
  let typingTimer = null;
  let gifSearchTimer = null;
  let contacts = [];

  // ============ DOM Refs ============
  const $ = (id) => document.getElementById(id);
  const $q = (sel) => document.querySelector(sel);

  // ============ Toast ============
  const toast = (msg, type = "default") => {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    $("toast-container").appendChild(el);
    setTimeout(() => el.remove(), 3100);
  };

  // ============ API Helper ============
  const api = async (method, url, body, isFormData = false) => {
    const opts = {
      method,
      credentials: "include",
      headers: isFormData ? {} : { "Content-Type": "application/json" },
    };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({ success: false, message: "Network error" }));
    return { ok: res.ok, status: res.status, data };
  };

  // ============ Auth ============
  const checkAuth = async () => {
    const { ok, data } = await api("GET", "/api/auth/me");
    if (ok && data.user) {
      currentUser = data.user;
      return true;
    }
    return false;
  };

  const doLogin = async (username, password) => {
    const { ok, data } = await api("POST", "/api/auth/login", { username, password });
    if (ok) { currentUser = data.user; return { ok: true }; }
    return { ok: false, message: data.message };
  };

  const doRegister = async (username, password, displayName) => {
    const { ok, data } = await api("POST", "/api/auth/register", { username, password, displayName });
    if (ok) { currentUser = data.user; return { ok: true }; }
    return { ok: false, message: data.message };
  };

  const doLogout = async () => {
    await api("POST", "/api/auth/logout");
    if (socket) socket.disconnect();
    currentUser = null;
    activeChat = null;
    showAuthScreen();
  };

  // ============ Socket Setup ============
  const connectSocket = () => {
    if (socket) socket.disconnect();

    socket = io({ withCredentials: true, transports: ["websocket", "polling"] });

    socket.on("connect", () => console.log("[Socket] Connected:", socket.id));
    socket.on("disconnect", () => console.log("[Socket] Disconnected"));
    socket.on("connect_error", (err) => console.error("[Socket] Error:", err.message));

    socket.on("new_message", (message) => {
      // Refresh contacts
      loadContacts();
      // If this is the active chat, render message
      if (activeChat && (message.senderId === activeChat.userId || message.receiverId === activeChat.userId)) {
        renderMessage(message, true);
        scrollToBottom();
        if (message.senderId === activeChat.userId) {
          socket.emit("mark_read", { senderId: activeChat.userId });
        }
      }
    });

    socket.on("presence_update", ({ userId, isOnline, lastSeen }) => {
      // Update contact list
      const items = document.querySelectorAll(`.contact-item[data-userid="${userId}"]`);
      items.forEach((item) => {
        const dot = item.querySelector(".online-dot");
        if (dot) dot.classList.toggle("hidden", !isOnline);
      });
      // Update active chat header
      if (activeChat && activeChat.userId === userId) {
        $("chat-online-dot").classList.toggle("hidden", !isOnline);
        $("chat-user-status").textContent = isOnline ? "online" : formatLastSeen(lastSeen);
        activeChat.isOnline = isOnline;
      }
    });

    socket.on("user_typing", ({ userId, isTyping }) => {
      if (activeChat && activeChat.userId === userId) {
        $("typing-name").textContent = activeChat.displayName;
        $("typing-indicator").classList.toggle("hidden", !isTyping);
        if (isTyping) scrollToBottom();
      }
    });

    socket.on("messages_read", ({ by }) => {
      if (activeChat && activeChat.userId === by) {
        document.querySelectorAll(".read-tick").forEach((el) => (el.textContent = "✓✓"));
      }
    });
  };

  // ============ UI Helpers ============
  const showAuthScreen = () => {
    $("chat-app").classList.add("hidden");
    $("auth-screen").classList.remove("hidden");
    showLoginForm();
  };

  const showApp = () => {
    $("auth-screen").classList.add("hidden");
    $("chat-app").classList.remove("hidden");
    updateSidebarUser();
    loadContacts();
    connectSocket();
  };

  const updateSidebarUser = () => {
    if (!currentUser) return;
    $("sidebar-username").textContent = currentUser.displayName;
    $("sidebar-userid").textContent = `#${currentUser.userId}`;
    const av = $("sidebar-avatar");
    av.src = currentUser.avatar || "/assets/default-avatar.svg";
    av.onerror = () => (av.src = "/assets/default-avatar.svg");
    $("sidebar-online-dot").classList.remove("hidden");
    // Show admin items
    const adminBtn = $("open-admin-panel");
    const adminDiv = $("admin-divider");
    if (currentUser.role === "admin") {
      adminBtn.style.display = "";
      adminDiv.style.display = "";
    }
    // Apply theme
    document.body.className = `theme-${currentUser.theme || "light"}`;
  };

  const showLoginForm = () => {
    $("login-form").classList.remove("hidden");
    $("register-form").classList.add("hidden");
  };

  const showRegisterForm = () => {
    $("register-form").classList.remove("hidden");
    $("login-form").classList.add("hidden");
  };

  // ============ Contacts ============
  const loadContacts = async () => {
    const { ok, data } = await api("GET", "/api/users/contacts");
    if (!ok) return;
    contacts = data.contacts || [];
    renderContacts();
  };

  const renderContacts = () => {
    const list = $("contacts-list");
    if (!contacts.length) {
      list.innerHTML = `<div class="contacts-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <p>No conversations yet</p><span>Search for users to start chatting</span></div>`;
      return;
    }
    list.innerHTML = contacts.map((c) => `
      <div class="contact-item${activeChat && activeChat.userId === c.user.userId ? " active" : ""}" data-userid="${c.user.userId}">
        <div class="avatar-wrap">
          <img src="${c.user.avatar || "/assets/default-avatar.svg"}" alt="" class="avatar" onerror="this.src='/assets/default-avatar.svg'" />
          <span class="online-dot${c.user.isOnline ? "" : " hidden"}"></span>
        </div>
        <div class="contact-info">
          <div class="contact-name">${escHtml(c.user.displayName)}</div>
          <div class="contact-last-msg">${getLastMsgPreview(c.lastMessage)}</div>
        </div>
        <div class="contact-meta">
          <span class="contact-time">${formatTime(c.lastMessage?.createdAt)}</span>
          ${c.unreadCount > 0 ? `<span class="unread-badge">${c.unreadCount}</span>` : ""}
        </div>
      </div>`).join("");

    list.querySelectorAll(".contact-item").forEach((item) => {
      item.addEventListener("click", () => {
        const userId = item.dataset.userid;
        const contact = contacts.find((c) => c.user.userId === userId);
        if (contact) openChat(contact.user);
      });
    });
  };

  const getLastMsgPreview = (msg) => {
    if (!msg) return "";
    if (msg.type === "image") return "📷 Image";
    if (msg.type === "audio") return "🎵 Audio";
    if (msg.type === "gif") return "GIF";
    return escHtml(String(msg.content || "").substring(0, 60));
  };

  // ============ Open Chat ============
  const openChat = async (user) => {
    activeChat = user;
    // Update header
    $("empty-chat").classList.add("hidden");
    $("chat-window").classList.remove("hidden");
    const nameEl = $("chat-user-name");
    nameEl.textContent = user.displayName;
    const av = $("chat-avatar");
    av.src = user.avatar || "/assets/default-avatar.svg";
    av.onerror = () => (av.src = "/assets/default-avatar.svg");
    $("chat-online-dot").classList.toggle("hidden", !user.isOnline);
    $("chat-user-status").textContent = user.isOnline ? "online" : formatLastSeen(user.lastSeen);

    // Mobile: show chat
    $("chat-main").classList.add("visible-mobile");
    $("sidebar").classList.add("hidden-mobile");

    // Mark active contact
    document.querySelectorAll(".contact-item").forEach((el) =>
      el.classList.toggle("active", el.dataset.userid === user.userId)
    );

    // Load messages
    await loadMessages(user.userId);
    socket?.emit("mark_read", { senderId: user.userId });
    // Refresh contacts (to clear unread badge)
    loadContacts();
  };

  // ============ Messages ============
  const loadMessages = async (userId) => {
    const msgList = $("messages-list");
    msgList.innerHTML = "";
    $("messages-loading").classList.remove("hidden");

    const { ok, data } = await api("GET", `/api/messages/conversation/${userId}`);
    $("messages-loading").classList.add("hidden");

    if (!ok) { toast("Failed to load messages", "error"); return; }

    const messages = data.messages || [];
    let lastDate = null;

    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDate) {
        msgList.insertAdjacentHTML("beforeend", `<div class="date-divider">${formatDate(msg.createdAt)}</div>`);
        lastDate = msgDate;
      }
      renderMessage(msg, false);
    });

    scrollToBottom(false);
  };

  const renderMessage = (msg, animate = false) => {
    if (msg.isDeleted && msg.content !== "This message was deleted") return;
    const isOut = msg.senderId === currentUser.userId;
    const msgList = $("messages-list");

    const bubble = document.createElement("div");
    bubble.className = `message-wrap ${isOut ? "outgoing" : "incoming"}`;
    bubble.dataset.msgid = msg._id;

    const time = formatTime(msg.createdAt);
    let content = "";

    if (msg.isDeleted) {
      content = `<span class="message-bubble${isOut ? " outgoing" : ""} deleted">🚫 Message deleted</span>`;
    } else if (msg.type === "image") {
      content = `<div class="message-bubble${isOut ? " outgoing" : ""}">
        <img src="${msg.mediaUrl}" alt="Image" class="msg-image" loading="lazy" onclick="App.openImage(this.src)" />
        <div class="message-meta">${time}${isOut ? ` <span class="read-tick">${msg.isRead ? "✓✓" : "✓"}</span>` : ""}</div>
      </div>`;
    } else if (msg.type === "audio") {
      content = `<div class="message-bubble${isOut ? " outgoing" : ""}">
        <audio controls src="${msg.mediaUrl}"></audio>
        <div class="message-meta">${time}${isOut ? ` <span class="read-tick">${msg.isRead ? "✓✓" : "✓"}</span>` : ""}</div>
      </div>`;
    } else if (msg.type === "gif") {
      content = `<div class="message-bubble${isOut ? " outgoing" : ""}">
        <img src="${msg.gifUrl}" alt="${escHtml(msg.gifTitle || "GIF")}" class="msg-gif" loading="lazy" />
        <div class="message-meta">${time}${isOut ? ` <span class="read-tick">${msg.isRead ? "✓✓" : "✓"}</span>` : ""}</div>
      </div>`;
    } else {
      content = `<div class="message-bubble${isOut ? " outgoing" : ""}">
        ${escHtml(msg.content)}
        <div class="message-meta">${time}${isOut ? ` <span class="read-tick">${msg.isRead ? "✓✓" : "✓"}</span>` : ""}</div>
      </div>`;
    }

    // Delete button for own messages
    const deleteBtn = isOut && !msg.isDeleted
      ? `<button class="msg-delete-btn" onclick="App.deleteMessage('${msg._id}', this)" title="Delete">✕</button>`
      : "";

    bubble.innerHTML = `<div class="msg-right-click" style="position:relative">${content}${deleteBtn}</div>`;

    if (animate) {
      bubble.style.opacity = "0";
      bubble.style.transform = "translateY(10px)";
      bubble.style.transition = "opacity 0.2s, transform 0.2s";
      setTimeout(() => { bubble.style.opacity = "1"; bubble.style.transform = ""; }, 10);
    }

    msgList.appendChild(bubble);
  };

  const scrollToBottom = (smooth = true) => {
    const area = $("messages-area");
    setTimeout(() => {
      area.scrollTo({ top: area.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    }, 50);
  };

  // ============ Send Message ============
  const sendTextMessage = () => {
    const input = $("message-input");
    const text = input.value.trim();
    if (!text || !activeChat || !socket) return;

    socket.emit("send_message", { receiverId: activeChat.userId, type: "text", content: text }, (res) => {
      if (!res.success) toast(res.message || "Failed to send", "error");
    });

    input.value = "";
    input.style.height = "auto";
    stopTyping();
  };

  const sendMediaMessage = async () => {
    if (!pendingFile || !activeChat) return;
    const fd = new FormData();
    fd.append("file", pendingFile);
    fd.append("receiverId", activeChat.userId);

    const { ok, data } = await api("POST", "/api/messages/send/media", fd, true);
    if (ok) {
      renderMessage(data.message, true);
      scrollToBottom();
      loadContacts();
      // Notify via socket
      socket?.emit("new_message_notify", { receiverId: activeChat.userId });
      // Also emit to receiver directly via socket
      if (socket) {
        socket.emit("send_message", {
          receiverId: activeChat.userId,
          type: data.message.type,
          content: data.message.content,
        });
      }
    } else {
      toast(data.message || "Failed to send file", "error");
    }
    clearFilePreview();
  };

  const clearFilePreview = () => {
    pendingFile = null;
    $("file-preview").classList.add("hidden");
    $("file-input").value = "";
    $("file-preview-img").classList.add("hidden");
    $("file-preview-audio").classList.add("hidden");
  };

  const stopTyping = () => {
    clearTimeout(typingTimer);
    if (activeChat && socket) socket.emit("typing", { receiverId: activeChat.userId, isTyping: false });
  };

  // ============ GIF Picker ============
  const loadGifs = async (query = "") => {
    $("gif-loading").classList.remove("hidden");
    $("gif-grid").innerHTML = "";
    const url = query
      ? `/api/messages/gifs/search?q=${encodeURIComponent(query)}`
      : "/api/messages/gifs/trending";
    const { ok, data } = await api("GET", url);
    $("gif-loading").classList.add("hidden");
    if (!ok) { toast("Failed to load GIFs", "error"); return; }
    const grid = $("gif-grid");
    (data.gifs || []).forEach((gif) => {
      const item = document.createElement("div");
      item.className = "gif-item";
      item.innerHTML = `<img src="${gif.previewUrl || gif.url}" alt="${escHtml(gif.title)}" loading="lazy" />`;
      item.addEventListener("click", () => sendGif(gif));
      grid.appendChild(item);
    });
  };

  const sendGif = (gif) => {
    if (!activeChat || !socket) return;
    socket.emit("send_message", {
      receiverId: activeChat.userId,
      type: "gif",
      gifUrl: gif.url,
      gifTitle: gif.title,
    }, (res) => {
      if (!res.success) toast(res.message || "Failed to send GIF", "error");
    });
    $("gif-picker").classList.add("hidden");
  };

  // ============ User Search ============
  const searchUsers = async (query) => {
    if (!query.trim()) { $("search-results").innerHTML = ""; return; }
    const { ok, data } = await api("GET", `/api/users/search?q=${encodeURIComponent(query)}`);
    if (!ok) return;
    const results = $("search-results");
    results.innerHTML = (data.users || []).map((u) => `
      <div class="search-result-item" data-userid="${u.userId}">
        <div class="avatar-wrap">
          <img src="${u.avatar || "/assets/default-avatar.svg"}" alt="" class="avatar small" onerror="this.src='/assets/default-avatar.svg'" />
          <span class="online-dot${u.isOnline ? "" : " hidden"}" style="width:9px;height:9px"></span>
        </div>
        <div>
          <div style="font-weight:600;font-size:0.875rem">${escHtml(u.displayName)}</div>
          <div style="font-size:0.75rem;color:var(--text-3)">@${escHtml(u.username)} · #${u.userId}</div>
        </div>
      </div>`).join("") || "<div style='padding:12px;color:var(--text-3);font-size:0.875rem'>No users found</div>";

    results.querySelectorAll(".search-result-item").forEach((item) => {
      item.addEventListener("click", () => {
        const userId = item.dataset.userid;
        const user = data.users.find((u) => u.userId === userId);
        if (user) {
          openChat(user);
          $("search-panel").classList.add("hidden");
          $("user-search-input").value = "";
        }
      });
    });
  };

  // ============ Profile Modal ============
  const openProfileModal = async (userId) => {
    const { ok, data } = await api("GET", `/api/users/${userId}`);
    if (!ok) { toast("User not found", "error"); return; }
    const u = data.user;
    $("profile-modal-avatar").src = u.avatar || "/assets/default-avatar.svg";
    $("profile-modal-avatar").onerror = () => ($("profile-modal-avatar").src = "/assets/default-avatar.svg");
    $("profile-modal-displayname").textContent = u.displayName;
    $("profile-modal-username").textContent = `@${u.username}`;
    $("profile-modal-id").textContent = u.userId;
    $("profile-modal-bio").textContent = u.bio || "";
    $("profile-modal-status").textContent = u.isOnline ? "🟢 Online" : `Last seen ${formatLastSeen(u.lastSeen)}`;
    $("profile-modal-status").style.color = u.isOnline ? "var(--success)" : "var(--text-3)";
    $("profile-start-chat-btn").onclick = () => { openChat(u); $("profile-modal").classList.add("hidden"); };
    $("profile-modal").classList.remove("hidden");
  };

  // ============ Edit Profile Modal ============
  const openEditProfileModal = () => {
    if (!currentUser) return;
    $("edit-avatar").value = currentUser.avatar || "";
    $("edit-displayname").value = currentUser.displayName;
    $("edit-bio").value = currentUser.bio || "";
    updateThemeBtns(currentUser.theme || "light");
    $("edit-profile-modal").classList.remove("hidden");
  };

  const updateThemeBtns = (theme) => {
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === theme);
    });
  };

  let selectedTheme = "";
  const saveProfile = async (e) => {
    e.preventDefault();
    const updates = {
      displayName: $("edit-displayname").value.trim(),
      bio: $("edit-bio").value.trim(),
      avatar: $("edit-avatar").value.trim(),
    };
    if (selectedTheme) updates.theme = selectedTheme;

    const { ok, data } = await api("PUT", "/api/users/profile/update", updates);
    if (ok) {
      currentUser = data.user;
      updateSidebarUser();
      document.body.className = `theme-${data.user.theme}`;
      $("edit-profile-modal").classList.add("hidden");
      toast("Profile updated!", "success");
    } else {
      toast(data.message || "Update failed", "error");
    }
  };

  // ============ Admin Panel ============
  const openAdminPanel = async () => {
    $("admin-modal").classList.remove("hidden");
    const { ok, data } = await api("GET", "/api/admin/stats");
    if (ok) {
      $("stat-users").textContent = data.stats.totalUsers;
      $("stat-online").textContent = data.stats.onlineUsers;
      $("stat-messages").textContent = data.stats.totalMessages;
      $("stat-today").textContent = data.stats.messagesToday;
    }
    loadAdminUsers();
  };

  const loadAdminUsers = async (search = "") => {
    const url = `/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`;
    const { ok, data } = await api("GET", url);
    if (!ok) return;
    const list = $("admin-users-list");
    list.innerHTML = (data.users || []).map((u) => `
      <div class="admin-user-row">
        <img src="${u.avatar || "/assets/default-avatar.svg"}" alt="" class="avatar small" onerror="this.src='/assets/default-avatar.svg'" />
        <div class="admin-user-info">
          <div class="admin-user-name">${escHtml(u.displayName)}</div>
          <div class="admin-user-meta">@${escHtml(u.username)} · #${u.userId}</div>
        </div>
        <span class="admin-role-badge${u.role === "admin" ? " admin" : ""}">${u.role}</span>
        ${u.userId !== currentUser.userId
          ? `<button class="icon-btn admin-delete-btn" onclick="App.adminDeleteUser('${u.userId}')" title="Delete user">🗑</button>`
          : ""}
      </div>`).join("") || "<p style='color:var(--text-3);padding:12px'>No users found</p>";
  };

  // ============ Public Methods (called from HTML) ============
  const deleteMessage = async (msgId, btn) => {
    if (!confirm("Delete this message?")) return;
    const { ok, data } = await api("DELETE", `/api/messages/${msgId}`);
    if (ok) {
      const wrap = btn.closest(".message-wrap");
      if (wrap) {
        const bubble = wrap.querySelector(".message-bubble");
        if (bubble) {
          bubble.className = "message-bubble outgoing deleted";
          bubble.innerHTML = `🚫 Message deleted<div class="message-meta">${formatTime(new Date())} <span class="read-tick"></span></div>`;
        }
        btn.remove();
      }
    } else {
      toast(data.message || "Failed to delete", "error");
    }
  };

  const adminDeleteUser = async (userId) => {
    if (!confirm("Delete this user and all their messages? This cannot be undone.")) return;
    const { ok, data } = await api("DELETE", `/api/admin/users/${userId}`);
    if (ok) { toast("User deleted", "success"); loadAdminUsers(); }
    else toast(data.message || "Failed to delete user", "error");
  };

  const openImage = (src) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out";
    overlay.innerHTML = `<img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain" />`;
    overlay.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  };

  // ============ Formatters ============
  const escHtml = (str) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const formatTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const formatLastSeen = (date) => {
    if (!date) return "a while ago";
    const d = new Date(date);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // ============ Event Bindings ============
  const bindEvents = () => {
    // Auth toggles
    $("go-register").addEventListener("click", (e) => { e.preventDefault(); showRegisterForm(); });
    $("go-login").addEventListener("click", (e) => { e.preventDefault(); showLoginForm(); });

    // Password toggles
    document.querySelectorAll(".toggle-password").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = $(btn.dataset.target);
        input.type = input.type === "password" ? "text" : "password";
      });
    });

    // Login form
    $("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("login-btn");
      btn.disabled = true; btn.textContent = "Signing in…";
      const res = await doLogin($("login-username").value.trim(), $("login-password").value);
      btn.disabled = false; btn.textContent = "Sign In";
      if (res.ok) showApp();
      else toast(res.message || "Login failed", "error");
    });

    // Register form
    $("register-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("register-btn");
      btn.disabled = true; btn.textContent = "Creating…";
      const res = await doRegister($("reg-username").value.trim(), $("reg-password").value, $("reg-displayname").value.trim());
      btn.disabled = false; btn.textContent = "Create Account";
      if (res.ok) showApp();
      else toast(res.message || "Registration failed", "error");
    });

    // Logout
    $("logout-btn").addEventListener("click", doLogout);
    $("settings-logout").addEventListener("click", doLogout);

    // Search
    $("search-btn").addEventListener("click", () => {
      $("search-panel").classList.toggle("hidden");
      if (!$("search-panel").classList.contains("hidden")) $("user-search-input").focus();
    });
    $("close-search").addEventListener("click", () => $("search-panel").classList.add("hidden"));
    $("user-search-input").addEventListener("input", (e) => searchUsers(e.target.value));

    // Back button (mobile)
    $("back-btn").addEventListener("click", () => {
      $("chat-main").classList.remove("visible-mobile");
      $("sidebar").classList.remove("hidden-mobile");
      activeChat = null;
    });

    // Settings dropdown
    $("settings-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      $("settings-dropdown").classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#settings-dropdown") && !e.target.closest("#settings-btn")) {
        $("settings-dropdown").classList.add("hidden");
      }
      if (!e.target.closest("#chat-menu-dropdown") && !e.target.closest("#chat-menu-btn")) {
        $("chat-menu-dropdown").classList.add("hidden");
      }
    });

    // Chat menu
    $("chat-menu-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      $("chat-menu-dropdown").classList.toggle("hidden");
    });
    $("view-profile-btn").addEventListener("click", () => {
      if (activeChat) openProfileModal(activeChat.userId);
      $("chat-menu-dropdown").classList.add("hidden");
    });
    $("chat-user-info-btn").addEventListener("click", () => {
      if (activeChat) openProfileModal(activeChat.userId);
    });

    // Message input
    const msgInput = $("message-input");
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (pendingFile) sendMediaMessage();
        else sendTextMessage();
      }
    });
    msgInput.addEventListener("input", () => {
      // Auto-resize
      msgInput.style.height = "auto";
      msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + "px";
      // Typing indicator
      if (!activeChat || !socket) return;
      socket.emit("typing", { receiverId: activeChat.userId, isTyping: true });
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => stopTyping(), 2000);
    });

    $("send-btn").addEventListener("click", () => {
      if (pendingFile) sendMediaMessage();
      else sendTextMessage();
    });

    // File attach
    $("attach-btn").addEventListener("click", () => $("file-input").click());
    $("file-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) { toast("File too large. Max 1MB", "error"); return; }
      pendingFile = file;
      $("file-preview").classList.remove("hidden");
      if (file.type.startsWith("image/")) {
        const img = $("file-preview-img");
        img.src = URL.createObjectURL(file);
        img.classList.remove("hidden");
        $("file-preview-audio").classList.add("hidden");
      } else if (file.type.startsWith("audio/")) {
        $("file-preview-img").classList.add("hidden");
        $("file-preview-audio").classList.remove("hidden");
        $("file-preview-name").textContent = file.name;
      }
    });
    $("remove-file-btn").addEventListener("click", clearFilePreview);

    // GIF picker
    $("gif-btn").addEventListener("click", () => {
      const picker = $("gif-picker");
      picker.classList.toggle("hidden");
      if (!picker.classList.contains("hidden")) {
        loadGifs();
        $("gif-search-input").focus();
      }
    });
    $("close-gif-btn").addEventListener("click", () => $("gif-picker").classList.add("hidden"));
    $("gif-search-input").addEventListener("input", (e) => {
      clearTimeout(gifSearchTimer);
      gifSearchTimer = setTimeout(() => loadGifs(e.target.value), 400);
    });

    // Current user button (open own profile edit)
    $("current-user-btn").addEventListener("click", openEditProfileModal);
    $("open-edit-profile").addEventListener("click", () => {
      openEditProfileModal();
      $("settings-dropdown").classList.add("hidden");
    });

    // Toggle theme
    $("toggle-theme-btn").addEventListener("click", async () => {
      const newTheme = (currentUser.theme || "light") === "light" ? "dark" : "light";
      document.body.className = `theme-${newTheme}`;
      await api("PUT", "/api/users/profile/update", { theme: newTheme });
      currentUser.theme = newTheme;
      $("settings-dropdown").classList.add("hidden");
    });

    // Edit profile form
    $("edit-profile-form").addEventListener("submit", saveProfile);
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedTheme = btn.dataset.theme;
        updateThemeBtns(selectedTheme);
        document.body.className = `theme-${selectedTheme}`;
      });
    });

    // Profile modal
    $("close-profile-modal").addEventListener("click", () => $("profile-modal").classList.add("hidden"));
    $("profile-modal-overlay").addEventListener("click", () => $("profile-modal").classList.add("hidden"));

    // Edit profile modal
    $("close-edit-profile-modal").addEventListener("click", () => $("edit-profile-modal").classList.add("hidden"));
    $("edit-profile-modal-overlay").addEventListener("click", () => $("edit-profile-modal").classList.add("hidden"));

    // Admin panel
    $("open-admin-panel").addEventListener("click", () => {
      openAdminPanel();
      $("settings-dropdown").classList.add("hidden");
    });
    $("close-admin-modal").addEventListener("click", () => $("admin-modal").classList.add("hidden"));
    $("admin-modal-overlay").addEventListener("click", () => $("admin-modal").classList.add("hidden"));
    let adminSearchTimer;
    $("admin-search").addEventListener("input", (e) => {
      clearTimeout(adminSearchTimer);
      adminSearchTimer = setTimeout(() => loadAdminUsers(e.target.value), 400);
    });
  };

  // ============ Init ============
  const init = async () => {
    bindEvents();
    const overlay = $("loading-overlay");

    const authed = await checkAuth();
    overlay.classList.add("fade-out");
    setTimeout(() => overlay.classList.add("hidden"), 400);

    if (authed) showApp();
    else showAuthScreen();
  };

  // Public API
  return { init, deleteMessage, adminDeleteUser, openImage };
})();

// Expose to global for HTML onclick handlers
window.App = App;
document.addEventListener("DOMContentLoaded", App.init);
