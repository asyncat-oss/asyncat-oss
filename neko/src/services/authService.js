// services/authService.js — JWT-based auth for OSS self-hosted build
import { getToken, setToken, clearToken } from '../auth/tokenStore';
import { performCompleteLogout } from '../utils/logoutUtils';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8716';

class AuthService {
  constructor() {
    this.currentSession = null;  // { user, access_token }
    this.sessionListeners = new Set();
    this.isOnline = navigator.onLine;

    window.addEventListener('online',  () => { this.isOnline = true; });
    window.addEventListener('offline', () => { this.isOnline = false; });

    this.initializeSession();
  }

  async getAuthStatus() {
    const res = await fetch(`${API_BASE}/api/auth/status`, { cache: 'no-store' });
    if (!res.ok) return { mode: 'local', localEmail: 'admin@local' };
    return res.json();
  }

  // ── Session bootstrap ──────────────────────────────────────────────────────

  async initializeSession() {
    const token = getToken();
    if (!token) {
      this.notifyListeners('SIGNED_OUT', null);
      return;
    }
    try {
      const res  = await fetch(`${API_BASE}/api/auth/me`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { user } = await res.json();
        this.currentSession = { user, access_token: token };
        this.notifyListeners('SIGNED_IN', this.currentSession);
      } else {
        clearToken();
        this.currentSession = null;
        this.notifyListeners('SIGNED_OUT', null);
      }
    } catch {
      // Network error — keep token, stay offline
    }
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  onAuthStateChange(callback) {
    this.sessionListeners.add(callback);
    // Fire immediately with current state so the caller can sync
    if (this.currentSession !== undefined) {
      try { callback(this.currentSession ? 'SIGNED_IN' : 'SIGNED_OUT', this.currentSession); } catch {}
    }
    return () => this.sessionListeners.delete(callback);
  }

  notifyListeners(event, session) {
    this.sessionListeners.forEach(cb => { try { cb(event, session); } catch {} });
  }

  // ── Auth operations ────────────────────────────────────────────────────────

  async firstRunLogin() {
    const res = await fetch(`${API_BASE}/api/auth/first-run`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'First-run login failed');
    setToken(data.token);
    this.currentSession = { user: data.user, access_token: data.token };
    this.notifyListeners('SIGNED_IN', this.currentSession);
    return this.currentSession;
  }

  async signIn(email, password) {
    const res  = await fetch(`${API_BASE}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    setToken(data.token);
    this.currentSession = { user: data.user, access_token: data.token };
    this.notifyListeners('SIGNED_IN', this.currentSession);
    return this.currentSession;
  }

  async signUp(email, password, options = {}) {
    const res  = await fetch(`${API_BASE}/api/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, name: options?.data?.full_name || options?.data?.name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    setToken(data.token);
    this.currentSession = { user: data.user, access_token: data.token };
    this.notifyListeners('SIGNED_IN', this.currentSession);
    return this.currentSession;
  }

  async signOut() {
    try {
      await performCompleteLogout(this);
    } catch {
      clearToken();
    }
    this.currentSession = null;
    this.notifyListeners('SIGNED_OUT', null);
  }

  // Basic sign-out (used by logoutUtils to avoid circular call)
  async basicSignOut() {
    const token = getToken();
    if (token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    clearToken();
    this.currentSession = null;
  }

  // ── Session accessors ──────────────────────────────────────────────────────

  async getSession() {
    if (this.currentSession) return this.currentSession;
    const token = getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { clearToken(); return null; }
      const { user } = await res.json();
      this.currentSession = { user, access_token: token };
      return this.currentSession;
    } catch {
      return null;
    }
  }

  async getUser() {
    const session = await this.getSession();
    return session?.user || null;
  }

  getAccessToken() {
    return this.currentSession?.access_token || getToken() || null;
  }

  isAuthenticated() {
    return !!(this.currentSession?.user);
  }

  async updatePassword(password) {
    const token = this.getAccessToken();
    const res   = await fetch(`${API_BASE}/api/auth/update-password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Password update failed');
  }

  async updateLocalAccount({ name, email, password }) {
    const token = this.getAccessToken();
    const res = await fetch(`${API_BASE}/api/auth/local-account`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Account update failed');

    if (data.token && data.user) {
      setToken(data.token);
      this.currentSession = { user: data.user, access_token: data.token };
      this.notifyListeners('SIGNED_IN', this.currentSession);
    }
    return this.currentSession;
  }

  // ── Authenticated fetch ────────────────────────────────────────────────────

  async authenticatedFetch(url, options = {}) {
    const token = this.getAccessToken();
    if (!token) throw new Error('No authentication token available');

    const isFormData = options.body instanceof FormData;
    return fetch(url, {
      ...options,
      cache: options.cache ?? 'no-store',
      headers: {
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  }

  // ── Network helpers ────────────────────────────────────────────────────────

  isNetworkError(error) {
    const msg = error.message?.toLowerCase() || '';
    const patterns = ['fetch failed','enotfound','getaddrinfo','econnreset','network request failed','failed to fetch','timeout'];
    return !this.isOnline || patterns.some(p => msg.includes(p));
  }

  destroy() {
    this.sessionListeners.clear();
  }
}

const authService = new AuthService();
export default authService;
