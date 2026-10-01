import { describe, expect, it, vi } from 'vitest'
import manifest from '../browser-extension/jobquest-104-connector/manifest.json'
import bridgeScript from '../browser-extension/jobquest-104-connector/app-bridge.js?raw'
import workerScript from '../browser-extension/jobquest-104-connector/service-worker.js?raw'
import { capture, NOW } from './helpers/real104BatchContract'

const origins = ['http://localhost:5173', 'https://jobquest-snowy.vercel.app']
const commands = ['JOBQUEST_104_STATUS', 'JOBQUEST_104_GET_LATEST', 'JOBQUEST_104_CLEAR']
const rejectedOrigins = [
  'https://example.com',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'https://localhost:5173',
  'http://jobquest-snowy.vercel.app',
  'https://jobquest-snowy.vercel.app:444',
  'https://preview.jobquest-snowy.vercel.app',
  'https://jobquest-snowy.vercel.app.evil.test',
  'https://jobquest-other.vercel.app',
]
const request = (type = commands[0]) => ({
  channel: 'JOBQUEST_104_BRIDGE_REQUEST', requestId: 'request-123', type,
})

function bridge(origin: string, sendMessage: (message: unknown) => Promise<unknown> = vi.fn(async (_message: unknown) => ({ status: 'no-capture' }))) {
  let listener: ((event: { source: unknown; origin: string; data: unknown }) => void) | undefined
  const window = {
    location: { origin }, postMessage: vi.fn(),
    addEventListener: vi.fn((_type: string, handler: typeof listener) => { listener = handler }),
  }
  new Function('window', 'chrome', bridgeScript)(window, { runtime: { sendMessage } })
  return {
    window, sendMessage,
    emit: (data: unknown, eventOrigin = origin, source: unknown = window) => listener?.({ data, origin: eventOrigin, source }),
  }
}

function worker() {
  type Sender = { url?: string }
  let listener: (message: unknown, sender: Sender, respond: (value: unknown) => void) => boolean = () => false
  const values = new Map<string, unknown>()
  const session = {
    get: vi.fn(async (key: string) => ({ [key]: values.get(key) })),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.entries(items).forEach(([key, value]) => values.set(key, value)) }),
    remove: vi.fn(async (key: string) => { values.delete(key) }),
  }
  const chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: { addListener: (handler: typeof listener) => { listener = handler } },
    }, storage: { session },
  }
  new Function('chrome', 'URL', 'Date', workerScript)(chrome, URL, { now: () => NOW, parse: Date.parse })
  return {
    values, session,
    dispatch: (message: unknown, sender: Sender, respond: (value: unknown) => void) => listener(message, sender, respond),
    send: (message: unknown, url: string) => new Promise<unknown>(resolve => {
      if (!listener(message, { url }, resolve)) resolve(undefined)
    }),
  }
}

describe('Connector production origin', () => {
  it('injects only on the two approved hosts without expanding existing permissions', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage'])
    expect(manifest).not.toHaveProperty('host_permissions')
    expect(manifest).not.toHaveProperty('externally_connectable')
    expect(manifest.content_scripts).toEqual([{
      matches: origins.map(origin => `${origin}/*`), js: ['app-bridge.js'], run_at: 'document_start',
    }])
    expect(manifest.background.service_worker).toBe('service-worker.js')
  })

  describe.each(origins)('%s', origin => {
    it.each(commands)('relays %s through the actual bridge and worker, replying only to the current origin', async type => {
      const background = worker()
      const payload = capture(['j1', 'j2'])
      expect(await background.send({ type: 'JOBQUEST_104_STORE_CAPTURE', payload }, 'chrome-extension://test/popup.html'))
        .toEqual({ status: 'ready', payload })
      const sendMessage = vi.fn((message: unknown) => background.send(message, `${origin}/?view=board`))
      const harness = bridge(origin, sendMessage)
      harness.emit(request(type))
      const expected = type === 'JOBQUEST_104_CLEAR' ? { status: 'no-capture' } : { status: 'ready', payload }
      await vi.waitFor(() => expect(harness.window.postMessage).toHaveBeenCalledExactlyOnceWith({
        channel: 'JOBQUEST_104_BRIDGE_RESPONSE', requestId: 'request-123', response: expected,
      }, origin))
      expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type })
      expect(background.values.has('jobQuest104.latestPayload')).toBe(type !== 'JOBQUEST_104_CLEAR')
    })

    it('returns runtime errors only to the current approved origin', async () => {
      const harness = bridge(origin, vi.fn(async () => { throw new Error('disconnected') }))
      harness.emit(request())
      await vi.waitFor(() => expect(harness.window.postMessage).toHaveBeenCalledExactlyOnceWith({
        channel: 'JOBQUEST_104_BRIDGE_RESPONSE', requestId: 'request-123',
        response: { status: 'error', message: 'Connector bridge 無法回應。' },
      }, origin))
    })

    it('rejects cross-origin events even from the other approved host, and rejects other windows', () => {
      const harness = bridge(origin)
      for (const other of [...origins.filter(value => value !== origin), ...rejectedOrigins]) harness.emit(request(), other)
      harness.emit(request(), origin, {})
      expect(harness.sendMessage).not.toHaveBeenCalled()
      expect(harness.window.postMessage).not.toHaveBeenCalled()
    })

    it('preserves message channel, command and request-id restrictions', () => {
      const harness = bridge(origin)
      for (const data of [null, { ...request(), channel: 'other' }, request('JOBQUEST_104_STORE_CAPTURE'),
        request('unknown'), { ...request(), requestId: 'short' }, { ...request(), requestId: 'x'.repeat(101) },
        { ...request(), requestId: 123 }]) harness.emit(data)
      expect(harness.sendMessage).not.toHaveBeenCalled()
    })

    it('does not allow an approved App to write captures or send unknown commands to the worker', () => {
      const background = worker()
      const respond = vi.fn()
      for (const message of [{ type: 'JOBQUEST_104_STORE_CAPTURE', payload: capture(['j1']) }, { type: 'unknown' }]) {
        expect(background.dispatch(message, { url: `${origin}/` }, respond)).toBe(false)
      }
      expect(respond).not.toHaveBeenCalled()
      expect(background.session.set).not.toHaveBeenCalled()
    })
  })

  it.each(rejectedOrigins)('does not install a bridge on %s even if injected there', origin => {
    const harness = bridge(origin)
    harness.emit(request())
    expect(harness.window.addEventListener).not.toHaveBeenCalled()
    expect(harness.sendMessage).not.toHaveBeenCalled()
  })

  it.each([...rejectedOrigins, 'https://jobquest-snowy.vercel.app@evil.test',
    'https://evil.test/?next=https://jobquest-snowy.vercel.app', 'not a URL', ''])
  ('rejects all bridge commands and capture writes from worker sender %s', url => {
    const background = worker()
    const previous = capture(['previous'])
    background.values.set('jobQuest104.latestPayload', previous)
    const respond = vi.fn()
    for (const type of [...commands, 'JOBQUEST_104_STORE_CAPTURE']) {
      expect(background.dispatch({ type, payload: capture(['new']) }, { url }, respond)).toBe(false)
    }
    expect(respond).not.toHaveBeenCalled()
    expect(background.session.get).not.toHaveBeenCalled()
    expect(background.session.set).not.toHaveBeenCalled()
    expect(background.session.remove).not.toHaveBeenCalled()
    expect(background.values.get('jobQuest104.latestPayload')).toBe(previous)
  })

  it('rejects missing worker sender URL and preserves popup-only capture ownership', () => {
    const background = worker()
    const respond = vi.fn()
    for (const sender of [{}, { url: 'chrome-extension://test/other.html' }, { url: 'chrome-extension://other/popup.html' }]) {
      for (const type of [...commands, 'JOBQUEST_104_STORE_CAPTURE']) {
        expect(background.dispatch({ type, payload: capture(['j1']) }, sender, respond)).toBe(false)
      }
    }
    expect(respond).not.toHaveBeenCalled()
    expect(background.values.size).toBe(0)
  })
})
