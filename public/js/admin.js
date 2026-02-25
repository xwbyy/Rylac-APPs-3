// ============================================================
// Rylac App - Admin Panel Logic
// ============================================================

let currentAdmin = null;
let usersPage = 1;
let usersSearch = "";
let deleteTargetId = null;
let userSearchTimer = null;

(async function init() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) { window.location.href = "/"; return; }
    const data = await res.json();
    currentAdmin = data.data;

    if (currentAdmin.role !== "admin") {
      alert("Access denied. Admin only.");
      window.location.href = "/chat";
      return;
    }

    document.documentElement.setAttribute("data-theme", currentAdmin.theme || "light");
    document.getElementById("admin-info").textContent = `Logged in as ${currentAdmin.displayName}`;

    // Load initial data
    loadStats();
    loadUsers();
  } catch (err) {
    window.location.href = "/";
  }
})();

// ── Section Navigation ────────────────────────────────────
function showSection(section) {
  document.querySelectorAll(".admin-main > div").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".admin-nav-item").forEach((el) => el.classList.remove("active"));

  document.getElementById(`section-${section}`).classList.remove("hidden");
  document.getElementById(`nav-${section}`).classList.add("active");
}

// ── Stats ─────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch("/api/admin/stats", { credentials: "include" });
    const data = await res.json();
    if (!data.success) return;

    const s = data.data;
    const grid = document.getElementById("stats-grid");
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">Total Users</div>
        <div class="stat-card-value">${s.users.total.toLocaleString()}</div>
        <div class="stat-card-sub">+${s.users.newThisWeek} this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Online Now</div>
        <div class="stat-card-value" style="color:var(--accent)">${s.users.onlineNow}</div>
        <div class="stat-card-sub">${s.users.activeToday} active today</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Total Messages</div>
        <div class="stat-card-value">${s.messages.total.toLocaleString()}</div>
        <div class="stat-card-sub">${s.messages.today} today</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Admins</div>
        <div class="stat-card-value">${s.users.admins}</div>
        <div class="stat-card-sub">of ${s.users.total} users</div>
      </div>`;

    // Message breakdown
    const msgStats = document.getElementById("message-stats");
    const types = s.messages.byType;
    msgStats.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
        ${["text", "image", "audio", "gif"].map((t) => `
          <div style="background:var(--bg);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:1.5rem;margin-bottom:4px">${{ text: "💬", image: "🖼️", audio: "🎵", gif: "🎭" }[t]}</div>
            <div style="font-size:1.25rem;font-weight:700;color:var(--primary)">${(types[t] || 0).toLocaleString()}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:capitalize">${t}</div>
          </div>`).join("")}
      </div>
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:12px">
        Generated: ${new Date(s.generatedAt).toLocaleString()}
      </p>`;
  } catch (err) {
    console.error("Load stats error:", err);
    showToast("Failed to load statistics", "error");
  }
}

// ── Users Table ───────────────────────────────────────────
async function loadUsers() {
  try {
    const url = `/api/admin/users?page=${usersPage}&limit=20&search=${encodeURIComponent(usersSearch)}`;
    const res = await fetch(url, { credentials: "include" });
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById("users-table-body");
    if (data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No users found</td></tr>`;
    } else {
      tbody.innerHTML = data.data.map(renderUserRow).join("");
    }

    renderPagination(data.meta);
  } catch (err) {
    console.error("Load users error:", err);
    showToast("Failed to load users", "error");
  }
}

function renderUserRow(u) {
  const avatar = u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.displayName)}&backgroundColor=6366f1`;
  const joinDate = new Date(u.createdAt).toLocaleDateString();
  const isMe = u.userId === currentAdmin.userId;

  return `<tr>
    <td>
      <div style="display:flex;align-items:center;gap:8px">
        <img src="${escHtml(avatar)}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover" onerror="this.src='${avatar}'" />
        <span style="font-weight:600">${escHtml(u.displayName)}</span>
        ${isMe ? '<span class="badge badge-admin" style="font-size:0.625rem">You</span>' : ""}
      </div>
    </td>
    <td style="font-family:monospace;font-size:0.8125rem">${u.userId}</td>
    <td>@${escHtml(u.username)}</td>
    <td><span class="badge badge-${u.role}">${u.role}</span></td>
    <td><span class="badge badge-${u.isOnline ? "online" : "offline"}">${u.isOnline ? "Online" : "Offline"}</span></td>
    <td style="color:var(--text-muted);font-size:0.8125rem">${joinDate}</td>
    <td>
      <div style="display:flex;gap:6px">
        ${u.role !== "admin" && !isMe ? `
          <button class="btn btn-ghost" style="font-size:0.75rem;padding:4px 10px" onclick="changeRole('${u.userId}', 'admin')">Make Admin</button>
        ` : u.role === "admin" && !isMe ? `
          <button class="btn btn-ghost" style="font-size:0.75rem;padding:4px 10px" onclick="changeRole('${u.userId}', 'user')">Remove Admin</button>
        ` : ""}
        ${!isMe && u.role !== "admin" ? `
          <button class="btn btn-danger" style="font-size:0.75rem;padding:4px 10px" onclick="confirmDelete('${u.userId}', '${escHtml(u.displayName)}')">Delete</button>
        ` : ""}
      </div>
    </td>
  </tr>`;
}

function renderPagination(meta) {
  const pag = document.getElementById("users-pagination");
  if (meta.pages <= 1) { pag.innerHTML = ""; return; }

  let html = "";
  if (usersPage > 1) {
    html += `<button class="page-btn" onclick="changePage(${usersPage - 1})">← Prev</button>`;
  }
  for (let i = Math.max(1, usersPage - 2); i <= Math.min(meta.pages, usersPage + 2); i++) {
    html += `<button class="page-btn ${i === usersPage ? "active" : ""}" onclick="changePage(${i})">${i}</button>`;
  }
  if (usersPage < meta.pages) {
    html += `<button class="page-btn" onclick="changePage(${usersPage + 1})">Next →</button>`;
  }
  html += `<span style="color:var(--text-muted);font-size:0.8125rem;margin-left:8px">${meta.total} total</span>`;
  pag.innerHTML = html;
}

function changePage(page) {
  usersPage = page;
  loadUsers();
}

function handleUserSearch(val) {
  usersSearch = val;
  usersPage = 1;
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(loadUsers, 300);
}

// ── Role Change ───────────────────────────────────────────
async function changeRole(userId, newRole) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`User role updated to ${newRole}`, "success");
      loadUsers();
    } else {
      showToast(data.message, "error");
    }
  } catch (err) {
    showToast("Failed to update role", "error");
  }
}

// ── Delete User ───────────────────────────────────────────
function confirmDelete(userId, displayName) {
  deleteTargetId = userId;
  document.getElementById("confirm-message").textContent =
    `Are you sure you want to delete "${displayName}"? This will permanently delete the user and all their messages. This action cannot be undone.`;
  document.getElementById("confirm-modal").classList.remove("hidden");
}

function closeConfirmModal() {
  document.getElementById("confirm-modal").classList.add("hidden");
  deleteTargetId = null;
}

async function executeDelete() {
  if (!deleteTargetId) return;
  const btn = document.getElementById("confirm-btn");
  btn.disabled = true;
  btn.textContent = "Deleting…";

  try {
    const res = await fetch(`/api/admin/users/${deleteTargetId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json();
    if (data.success) {
      showToast("User deleted successfully", "success");
      closeConfirmModal();
      loadUsers();
      loadStats();
    } else {
      showToast(data.message || "Failed to delete user", "error");
    }
  } catch (err) {
    showToast("Network error", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Delete";
  }
}

// ── Toast ─────────────────────────────────────────────────
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
  }, 3500);
}

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
