const USERNAME_RE = /^[a-zA-Z0-9_]{3,18}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeUsername(raw: string): string {
  return raw.trim()
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_RE.test(normalizeUsername(raw))
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim())
}

export function isEmailIdentifier(raw: string): boolean {
  return raw.includes('@')
}

export function isValidPassword(raw: string): boolean {
  return raw.length >= 8 && raw.length <= 72
}

/** Firebase needs an email; username-only accounts use a synthetic address. */
export function syntheticEmailForUsername(username: string): string {
  return `${normalizeUsername(username).toLowerCase()}@users.family-games.local`
}
