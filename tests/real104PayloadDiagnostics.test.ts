import { describe, expect, it, vi } from 'vitest'
import workerScript from '../browser-extension/jobquest-104-connector/service-worker.js?raw'
import { capture, names, NOW } from './helpers/real104BatchContract'

function worker(log = vi.fn()) {
  const values = new Map<string, unknown>()
  let listener: (message: unknown, sender: { url: string }, respond: (value: unknown) => void) => boolean = () => false
  const chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: { addListener: (handler: typeof listener) => { listener = handler } },
    },
    storage: { session: {
      get: async (key: string) => ({ [key]: values.get(key) }),
      set: async (items: Record<string, unknown>) => { Object.entries(items).forEach(([key, value]) => values.set(key, value)) },
      remove: async (key: string) => { values.delete(key) },
    } },
  }
  new Function('chrome', 'URL', 'Date', 'console', workerScript)(chrome, URL, { now: () => NOW, parse: Date.parse }, { log })
  return {
    log, values,
    listener,
    store: (payload: unknown) => new Promise<Record<string, unknown>>(resolve => {
      listener({ type: 'JOBQUEST_104_STORE_CAPTURE', payload }, { url: 'chrome-extension://test/popup.html' }, response => resolve(response as Record<string, unknown>))
    }),
  }
}

describe('REAL104 worker after diagnostic cleanup', () => {
  it('registers and accepts a full page without logs or mutating payload, response or stored identity', async () => {
    const harness = worker()
    const payload = capture(names(0, 22))
    payload.jobs[0].experienceText = undefined
    const before = structuredClone(payload)
    expect(await harness.store(payload)).toEqual({ status: 'ready', payload })
    expect(harness.values.get('jobQuest104.latestPayload')).toBe(payload)
    expect(payload).toEqual(before)
    expect(harness.log).not.toHaveBeenCalled()
  })

  it.each(['externalId', 'sourceKey', 'title', 'company', 'location', 'salaryText', 'canonicalUrl', 'experienceText', 'snippetText'])('rejects a null %s without logging, accepting or storing it', async field => {
    const harness = worker()
    const payload = capture(names(0, 22))
    const job = payload.jobs[21] as unknown as Record<string, unknown>
    job[field] = null
    const before = structuredClone(payload)
    expect(await harness.store(payload)).toEqual({ status: 'malformed', message: '擷取資料格式不正確。' })
    expect(payload).toEqual(before)
    expect(harness.values.size).toBe(0)
    expect(harness.log).not.toHaveBeenCalled()
  })

  it.each([
    ['version', 2], ['source', 'other'], ['capturedAt', 'bad date'], ['sourceUrl', 'https://example.com/'], ['jobs', {}], ['jobs', []],
  ])('rejects invalid envelope field %s without logging', async (field, value) => {
    const harness = worker()
    const payload = { ...capture(['j1']), [field]: value }
    expect((await harness.store(payload)).status).toBe('malformed')
    expect(harness.values.size).toBe(0)
    expect(harness.log).not.toHaveBeenCalled()
  })

  it('rejects non-record payload and job shapes without logging', async () => {
    for (const payload of [null, { ...capture(['j1']), jobs: [null] }]) {
      const harness = worker()
      expect((await harness.store(payload)).status).toBe('malformed')
      expect(harness.values.size).toBe(0)
      expect(harness.log).not.toHaveBeenCalled()
    }
  })

  it('preserves previous capture when a malformed job or duplicate fails validation', async () => {
    const harness = worker()
    const previous = capture(['previous'])
    await harness.store(previous)
    const payload = capture(names(0, 22))
    payload.jobs[1] = payload.jobs[0]
    payload.jobs[21].title = ' '
    expect((await harness.store(payload)).status).toBe('malformed')
    payload.jobs[21].title = 'valid'
    expect((await harness.store(payload)).status).toBe('malformed')
    expect(harness.values.get('jobQuest104.latestPayload')).toBe(previous)
    expect(harness.log).not.toHaveBeenCalled()
  })

  it('rejects a long invalid sourceKey without dumping job content', async () => {
    const harness = worker()
    const payload = capture(['j1'])
    payload.jobs[0].sourceKey = 'x'.repeat(500)
    expect((await harness.store(payload)).status).toBe('malformed')
    expect(harness.values.size).toBe(0)
    expect(harness.log).not.toHaveBeenCalled()
  })

  it('keeps PASS and FAIL responses unchanged even when console logging throws', async () => {
    const harness = worker(vi.fn(() => { throw new Error('console unavailable') }))
    const payload = capture(['j1'])
    expect(await harness.store(payload)).toEqual({ status: 'ready', payload })
    expect(await harness.store(null)).toEqual({ status: 'malformed', message: '擷取資料格式不正確。' })
    expect(harness.values.get('jobQuest104.latestPayload')).toBe(payload)
    expect(harness.log).not.toHaveBeenCalled()
  })

  it('does not inspect unauthorized messages or change sender rejection', () => {
    const harness = worker()
    const respond = vi.fn()
    expect(harness.listener({ type: 'JOBQUEST_104_STORE_CAPTURE', payload: capture(['j1']) }, { url: 'https://example.com/' }, respond)).toBe(false)
    expect(harness.log).not.toHaveBeenCalled()
    expect(respond).not.toHaveBeenCalled()
  })
})
