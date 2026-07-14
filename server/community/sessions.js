const crypto = require('crypto');

const COOKIE_NAME = 'sparge_community_session';

function parseCookies(header) {
  const result = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class CommunitySessions {
  constructor(config, now = () => Date.now()) {
    this.config = config;
    this.now = now;
    this.sessions = new Map();
  }

  cleanup() {
    const current = this.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= current) this.sessions.delete(id);
    }
  }

  create(data = {}) {
    this.cleanup();
    const id = crypto.randomBytes(32).toString('base64url');
    const session = {
      id,
      csrfToken: crypto.randomBytes(24).toString('base64url'),
      createdAt: this.now(),
      expiresAt: this.now() + this.config.sessions.expiresSeconds * 1000,
      ...data
    };
    this.sessions.set(id, session);
    return session;
  }

  get(req) {
    const id = parseCookies(req.headers.cookie)[COOKIE_NAME];
    const session = id ? this.sessions.get(id) : null;
    if (!session || session.expiresAt <= this.now()) {
      if (id) this.sessions.delete(id);
      return null;
    }
    return session;
  }

  ensure(req) {
    return this.get(req) || this.create();
  }

  rotate(session, data = {}) {
    if (session?.id) this.sessions.delete(session.id);
    return this.create({
      discordUserId: session?.discordUserId || '',
      discordDisplayName: session?.discordDisplayName || '',
      ...data
    });
  }

  destroy(session) {
    if (session?.id) this.sessions.delete(session.id);
  }

  setCookie(res, session) {
    const secure = this.config.publicBaseUrl.startsWith('https://');
    const parts = [
      `${COOKIE_NAME}=${encodeURIComponent(session.id)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${this.config.sessions.expiresSeconds}`
    ];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  clearCookie(res) {
    const secure = this.config.publicBaseUrl.startsWith('https://');
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
  }

  requireCsrf(req, session) {
    return safeEqual(req.get('X-CSRF-Token'), session?.csrfToken);
  }
}

module.exports = { CommunitySessions, COOKIE_NAME, safeEqual };
