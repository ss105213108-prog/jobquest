import { describe, expect, it } from 'vitest'
import captureScript from '../browser-extension/jobquest-104-connector/capture-jobs.js?raw'
import workerScript from '../browser-extension/jobquest-104-connector/service-worker.js?raw'
import { parse104Payload } from '../src/integrations/job104/schema'
import { create104ConnectorClient } from '../src/integrations/job104/connectorClient'
import { NOW, capture, ids, names } from './helpers/real104BatchContract'

function card(id: string) {
  const job = { href: `https://www.104.com.tw/job/${id}`, textContent: `職缺 ${id}` }
  const company = { href: 'https://www.104.com.tw/company/example', textContent: '測試公司' }
  const location = { href: 'https://www.104.com.tw/jobs/search/?area=6001008000', textContent: '台中市' }
  const salary = { href: 'https://www.104.com.tw/jobs/search/?scmin=1', textContent: '待遇面議' }
  return {
    querySelector: (selector: string) => selector.startsWith('a.info-job__text') ? job
      : selector.startsWith('a.info-company__text') ? company : null,
    querySelectorAll: () => [job, company, location, salary],
  }
}

function captureCurrentPage(idsOnPage: string[]) {
  const cards = idsOnPage.map(id => id === 'invalid-card' ? { querySelector: () => null, querySelectorAll: () => [] } : card(id))
  const document = { querySelectorAll: (selector: string) => selector === '.job-list-container' ? cards : [] }
  const window = { location: { href: 'https://www.104.com.tw/jobs/search/?keyword=%E5%B7%A5%E7%A8%8B%E5%B8%AB&area=6001008000&page=3' } }
  return new Function('document', 'window', 'URL', 'Date', `return ${captureScript}`)(document, window, URL, Date) as ReturnType<typeof capture>
}

function connectorWorker() {
  const values = new Map<string, unknown>()
  let onMessage: (message: unknown, sender: { url: string }, respond: (value: unknown) => void) => boolean = () => false
  const chrome = {
    storage: { session: {
      get: async (key: string) => ({ [key]: values.get(key) }),
      set: async (items: Record<string, unknown>) => { Object.entries(items).forEach(([key, value]) => values.set(key, value)) },
      remove: async (key: string) => { values.delete(key) },
    } },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: { addListener: (listener: typeof onMessage) => { onMessage = listener } } },
  }
  const clock = { now: () => NOW, parse: Date.parse }
  new Function('chrome', 'URL', 'Date', 'Set', workerScript)(chrome, URL, clock, Set)
  const request = (type: string, payload: unknown, senderUrl: string) => new Promise<Record<string, unknown>>(resolve => {
    onMessage({ type, payload }, { url: senderUrl }, value => resolve(value as Record<string, unknown>))
  })
  return {
    store: (payload: unknown) => request('JOBQUEST_104_STORE_CAPTURE', payload, 'chrome-extension://test/popup.html'),
    latest: () => request('JOBQUEST_104_GET_LATEST', undefined, 'http://localhost:5173/'),
  }
}

describe('REAL104 full-page Connector contract', () => {
  it.each([17, 19, 22])('captures all %i valid loaded cards in DOM order without a fixed ten/twenty cap', count => {
    const page = captureCurrentPage(names(0, count))
    expect(page.jobs.map(job => job.sourceKey)).toEqual(ids(...names(0, count)))
    expect(page.sourceUrl).toContain('page=3')
  })

  it('keeps first occurrence order while omitting invalid and repeated cards beyond position ten', () => {
    const page = captureCurrentPage([...names(0, 12), 'invalid-card', 'j2', ...names(12, 5)])
    expect(page.jobs.map(job => job.sourceKey)).toEqual(ids(...names(0, 17)))
  })

  it.each([17, 19, 22])('App DTO accepts an entire valid %i-job page', count => {
    const page = capture(names(0, count), { page: 3, at: NOW })
    expect(parse104Payload(page)?.jobs.map(job => job.sourceKey)).toEqual(ids(...names(0, count)))
  })

  it('worker stores and returns a complete page through the existing latest-capture channel', async () => {
    const worker = connectorWorker()
    const page = capture(names(0, 19), { page: 2, at: NOW })
    expect((await worker.store(page)).status).toBe('ready')
    const latest = await worker.latest()
    expect(latest.status).toBe('ready')
    expect((latest.payload as typeof page).jobs.map(job => job.sourceKey)).toEqual(ids(...names(0, 19)))
  })

  it('retains latest-capture ownership: a second explicit capture replaces the first unimported payload', async () => {
    const worker = connectorWorker()
    expect((await worker.store(capture(['ja'], { page: 1, at: NOW }))).status).toBe('ready')
    expect((await worker.store(capture(['jb'], { page: 2, at: NOW }))).status).toBe('ready')
    const latest = await worker.latest()
    expect((latest.payload as ReturnType<typeof capture>).jobs.map(job => job.sourceKey)).toEqual(ids('jb'))
  })

  it('client returns every validated candidate from a full-page payload', async () => {
    const page = capture(names(0, 22), { at: NOW })
    const client = create104ConnectorClient(async () => ({ status: 'ready', payload: page }))
    const result = await client.getLatest()
    expect(result.status).toBe('ready')
    expect(result.payload?.jobs.map(job => job.sourceKey)).toEqual(ids(...names(0, 22)))
  })

  it.each(['malformed', 'duplicate'] as const)('App parser rejects the whole full page with a %s candidate after position ten', kind => {
    const page = capture(names(0, 22), { at: NOW })
    if (kind === 'malformed') page.jobs[21].sourceKey = '104:wrongid'
    else page.jobs[21] = page.jobs[0]
    expect(parse104Payload(page)).toBeNull()
  })

  it.each(['malformed', 'duplicate'] as const)('worker rejects a %s full page without replacing the previous valid latest payload', async kind => {
    const worker = connectorWorker()
    const previous = capture(names(0, 19), { page: 1, at: NOW })
    expect((await worker.store(previous)).status).toBe('ready')
    const bad = capture(names(19, 22), { page: 2, at: NOW })
    if (kind === 'malformed') bad.jobs[21].canonicalUrl = 'https://example.com/job/invalid'
    else bad.jobs[21] = bad.jobs[0]
    expect((await worker.store(bad)).status).toBe('malformed')
    expect((await worker.latest()).payload).toEqual(previous)
  })
})
