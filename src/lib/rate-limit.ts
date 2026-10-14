// In-memory rate limiter for login attempts
// Stores: key -> { count, resetTime }

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts.entries()) {
    if (now > entry.resetTime) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now > entry.resetTime) {
    loginAttempts.set(key, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterMs = entry.resetTime - now;
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string) {
  loginAttempts.delete(key);
}
