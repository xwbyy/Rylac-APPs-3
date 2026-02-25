// ============================================================
// Rylac App - Profile Page Logic
// ============================================================

let currentUser = null;

(async function init() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) { window.location.href = "/"; return; }
    const data = await res.json();
    currentUser = data.data;

    document.documentElement.setAttribute("data-theme", currentUser.theme || "light");
    updateThemeIcon();
    renderProfile(currentUser);
  } catch (err) {
    window.location.href = "/";
  }
})();

function renderProfile(u) {
  const avatar = u.avatar || generateAvatar(u.displayName);
  document.getElementById("profile-avatar").src = avatar;
  document.getElementById("profile-avatar").onerror = () => {
    document.getElementById("profile-avatar").src = generateAvatar(u.displayName);
  };
  document.getElementById("display-name").textContent = u.displayName;
  document.getElementById("username-el").textContent = `@${u.username}`;
  document.getElementById("user-id-el").textContent = `ID: ${u.userId}`;
  document.getElementById("bio-el").textContent = u.bio || "No bio set yet.";
  document.getElementById("stat-since").textContent = new Date(u.createdAt || Date.now()).getFullYear();
  document.getElementById("stat-status").textContent = u.isOnline ? "🟢 Online" : "⚫ Offline";

  // Pre-fill edit fields
  document.getElementById("edit-displayname").value = u.displayName;
  document.getElementById("edit-avatar").value = u.avatar || "";
  document.getElementById("edit-bio").value = u.bio || "";
  document.getElementById("bio-count").textContent = (u.bio || "").length;

  document.getElementById("edit-bio").addEventListener("input", function () {
    document.getElementById("bio-count").textContent = this.value.length;
  });
}

function showEditMode() {
  document.getElementById("view-mode").classList.add("hidden");
  document.getElementById("edit-mode").classList.remove("hidden");
}

function hideEditMode() {
  document.getElementById("edit-mode").classList.add("hidden");
  document.getElementById("view-mode").classList.remove("hidden");
  document.getElementById("edit-alert").innerHTML = "";
}

async function saveProfile(e) {
  e.preventDefault();
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const displayName = document.getElementById("edit-displayname").value.trim();
  const avatar = document.getElementById("edit-avatar").value.trim();
  const bio = document.getElementById("edit-bio").value.trim();

  try {
    const res = await fetch("/api/users/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ displayName, avatar, bio }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      currentUser = { ...currentUser, ...data.data };
      renderProfile(currentUser);
      hideEditMode();
      showToast("Profile updated successfully!", "success");
    } else {
      document.getElementById("edit-alert").innerHTML =
        `<div class="alert alert-error">${escHtml(data.message)}</div>`;
    }
  } catch (err) {
    document.getElementById("edit-alert").innerHTML =
      `<div class="alert alert-error">Network error. Please try again.</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Changes";
  }
}

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
  } catch (err) {}
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
      <line x1="21" y1="12" x2="23" y2="12"/>`;
  }
}

async function handleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  } catch (err) {
    window.location.href = "/";
  }
}

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

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function generateAvatar(name) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=6366f1`;
}
