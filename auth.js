/**
 * auth.js — Authentication module (Firebase Auth)
 *
 * Uses Firebase Authentication (email + password).
 * The Firebase default app is shared with multiplayer.js —
 * whichever script loads first initialises it; the other reuses it.
 *
 * Public API:
 *   AUTH.register(email, password, displayName) → Promise<{ok, error?}>
 *   AUTH.login(email, password)                 → Promise<{ok, error?}>
 *   AUTH.logout()                               → Promise<void>
 *   AUTH.currentUser()                          → firebase.User | null
 *   AUTH.waitForAuth()                          → Promise<firebase.User|null>
 *   AUTH.requireAuth([returnUrl])               → Promise<void>  (redirects if not logged in)
 *   AUTH.sendPasswordReset(email)               → Promise<{ok, error?}>
 */

const AUTH = (() => {
  // ── Firebase init ─────────────────────────────────────────────────────────
  // Reuses default app if multiplayer.js already initialised it.
  const _config = {
    apiKey:            'AIzaSyCyazG1L4p2qqbSQOZ5lRiO4QMrtyYb-lY',
    authDomain:        'study-guide-duel-mode.firebaseapp.com',
    databaseURL:       'https://study-guide-duel-mode-default-rtdb.europe-west1.firebasedatabase.app',
    projectId:         'study-guide-duel-mode',
    storageBucket:     'study-guide-duel-mode.firebasestorage.app',
    messagingSenderId: '418263522242',
    appId:             '1:418263522242:web:6f8b90c0ade9f2b7d4145b',
  };

  if (!firebase.apps.length) firebase.initializeApp(_config);
  const _auth = firebase.auth();

  // ── Auth-state tracking ───────────────────────────────────────────────────
  let _currentUser = null;
  let _resolveReady;
  const _ready = new Promise(res => { _resolveReady = res; });
  let _readyFired = false;

  _auth.onAuthStateChanged(user => {
    _currentUser = user;
    if (!_readyFired) { _readyFired = true; _resolveReady(user); }
  });

  // ── helpers ───────────────────────────────────────────────────────────────
  function _translateError(code) {
    const map = {
      'auth/email-already-in-use':   'כתובת המייל כבר רשומה במערכת.',
      'auth/invalid-email':          'כתובת מייל לא תקינה.',
      'auth/weak-password':          'הסיסמה חלשה מדי (לפחות 6 תווים).',
      'auth/user-not-found':         'לא נמצא חשבון עם מייל זה.',
      'auth/wrong-password':         'סיסמה שגויה.',
      'auth/invalid-credential':     'כתובת מייל או סיסמה שגויים.',
      'auth/too-many-requests':      'יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
      'auth/network-request-failed': 'שגיאת רשת. בדוק חיבור לאינטרנט.',
      'auth/user-disabled':          'החשבון הושעה.',
      'auth/missing-email':          'יש להזין כתובת מייל.',
    };
    return map[code] || `שגיאה (${code})`;
  }

  // ── public API ────────────────────────────────────────────────────────────

  /**
   * Register a new user with email + password + display name.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function register(email, password, displayName) {
    try {
      const cred = await _auth.createUserWithEmailAndPassword(email.trim(), password);
      const name = (displayName || '').trim();
      if (name) await cred.user.updateProfile({ displayName: name });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: _translateError(e.code) };
    }
  }

  /**
   * Sign in with email + password.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function login(email, password) {
    try {
      await _auth.signInWithEmailAndPassword(email.trim(), password);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: _translateError(e.code) };
    }
  }

  /** Sign out the current user. */
  async function logout() {
    await _auth.signOut();
  }

  /**
   * Returns the current Firebase User synchronously, or null.
   * May be null briefly on first page load while Firebase restores the session.
   * Use waitForAuth() when you need a definitive answer.
   * @returns {firebase.User|null}
   */
  function currentUser() {
    return _currentUser;
  }

  /**
   * Resolves once Firebase has determined the auth state (logged in or not).
   * @returns {Promise<firebase.User|null>}
   */
  function waitForAuth() {
    return _ready;
  }

  /**
   * Guard: waits for auth state, then redirects to login if not signed in.
   * Returns a never-resolving Promise on redirect so async callers pause.
   * @param {string} [returnUrl]
   */
  async function requireAuth(returnUrl) {
    await _ready;
    if (!_currentUser) {
      const back = encodeURIComponent(returnUrl || window.location.pathname + window.location.search);
      window.location.replace(`login.html?next=${back}`);
      return new Promise(() => {}); // pause — page is navigating away
    }
  }

  /**
   * Send a password-reset email via Firebase.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function sendPasswordReset(email) {
    try {
      await _auth.sendPasswordResetEmail(email.trim());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: _translateError(e.code) };
    }
  }

  return { register, login, logout, currentUser, waitForAuth, requireAuth, sendPasswordReset };
})();
