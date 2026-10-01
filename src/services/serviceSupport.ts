export class ServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ServiceError'
  }
}

export const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

export function shouldMockFail(scope: 'resume' | 'jobs' | 'matching'): boolean {
  const requested = new URLSearchParams(window.location.search).get('mockError')
  return requested === scope
}

export function clearMockFailure(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('mockError')
  window.history.replaceState({}, '', url)
}
