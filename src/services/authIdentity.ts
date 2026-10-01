// Stable internal Auth namespace. Do not render derived identifiers in product UI.
const prefix = 'u1.'
const suffix = '@jobquest.invalid'

export class UsernameValidationError extends Error {
  readonly code = 'INVALID_USERNAME'
  constructor() {
    super('帳號需為 3–32 個字元，以英文字母開頭，只能使用英文字母、數字與底線。')
    this.name = 'UsernameValidationError'
  }
}

export function normalizeUsername(input: unknown): string {
  if (typeof input !== 'string') throw new UsernameValidationError()
  const trimmed = input.trim()
  if (!/^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(trimmed)) throw new UsernameValidationError()
  return trimmed.toLowerCase()
}

/** Internal adapter only; UI-facing service results contain username and UID. */
export function deriveSyntheticIdentifier(input: unknown): string {
  return `${prefix}${normalizeUsername(input)}${suffix}`
}

export function usernameFromSyntheticIdentifier(identifier: unknown): string | null {
  if (typeof identifier !== 'string' || !identifier.startsWith(prefix) || !identifier.endsWith(suffix)) return null
  const username = identifier.slice(prefix.length, -suffix.length)
  try {
    return deriveSyntheticIdentifier(username) === identifier ? username : null
  } catch {
    return null
  }
}
