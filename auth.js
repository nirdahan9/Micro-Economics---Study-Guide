/**
 * auth.js — Authentication module for Micro-Economics Study Guide
 *
 * Users are stored in localStorage keyed by username.
 * Passwords are hashed with SHA-256 (Web Crypto API).
 * The active session is persisted in localStorage so it
 * survives page reloads and tab closures until explicit logout.
 */

const AUTH = (() => {
  const USERS_KEY   = 'micro-auth-users-v1';
  const SESSION_KEY = 'micro-auth-session-v1';

  // ── helpers ───────────────────────────────────────────────────────────────

  async function sha256(text) {
    const enc  = new TextEncoder();
    const buf  = await crypto.subtle.digest('SHA-256', enc.encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function loadUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // ── public API ────────────────────────────────────────────────────────────

  /**
   * Register a new user.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function register(username, password) {
    const u = username.trim().toLowerCase();
    if (!u || u.length < 2)
      return { ok: false, error: 'שם משתמש חייב להכיל לפחות 2 תווים.' };
    if (password.length < 4)
      return { ok: false, error: 'סיסמה חייבת להכיל לפחות 4 תווים.' };

    const users = loadUsers();
    if (users[u])
      return { ok: false, error: 'שם משתמש זה כבר קיים. בחר שם אחר.' };

    const hash = await sha256(password);
    users[u] = { username: u, passwordHash: hash, createdAt: Date.now() };
    saveUsers(users);
    return { ok: true };
  }

  /**
   * Login an existing user.
   * @returns {Promise<{ok:boolean, username?:string, error?:string}>}
   */
  async function login(username, password) {
    const u = username.trim().toLowerCase();
    if (!u) return { ok: false, error: 'יש להזין שם משתמש.' };

    const users = loadUsers();
    if (!users[u])
      return { ok: false, error: 'שם משתמש לא קיים.' };

    const hash = await sha256(password);
    if (users[u].passwordHash !== hash)
      return { ok: false, error: 'סיסמה שגויה.' };

    // Persist session in localStorage (survives restart until logout)
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username: u, loginAt: Date.now() }));
    return { ok: true, username: u };
  }

  /** Destroy the active session. */
  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  /**
   * Return the currently-logged-in username, or null.
   * @returns {string|null}
   */
  function currentUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      return session?.username || null;
    } catch {
      return null;
    }
  }

  /**
   * Guard: if no user is logged in, redirect to login page.
   * The login page will redirect back to `returnUrl` (default: current page).
   */
  function requireAuth(returnUrl) {
    if (currentUser()) return;          // already logged in — nothing to do
    const back = encodeURIComponent(returnUrl || window.location.pathname + window.location.search);
    window.location.replace(`login.html?next=${back}`);
  }

  return { register, login, logout, currentUser, requireAuth };
})();
