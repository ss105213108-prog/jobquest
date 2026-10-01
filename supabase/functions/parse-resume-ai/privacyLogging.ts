import { safeDiagnostics } from '../_shared/aiResumeExtractionV1.ts'

type ContentConsole = Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'dir' | 'dirxml' | 'table' | 'assert'>

// Installed once per isolated function worker, never changed/restored per request.
// Dependencies must not bypass the application diagnostic allowlist.
export function createPrivacySafeLogger(target: ContentConsole) {
  const emit = target.info.bind(target)
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'dirxml', 'table', 'assert'] as const) {
    target[method] = () => {}
  }
  return (input: unknown): void => { emit(JSON.stringify(safeDiagnostics(input))) }
}
