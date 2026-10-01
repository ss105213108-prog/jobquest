import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import sampleJobs from '../experiments/104-browser-connector/sample-output.json'
import { SearchPanel } from '../src/components/search/SearchPanel'
import { build104SearchUrl, payloadMatches104Search } from '../src/integrations/job104/build104SearchUrl'
import { create104ConnectorClient } from '../src/integrations/job104/connectorClient'
import { get104AreaCode, isSupported104Location, location104Map } from '../src/integrations/job104/locationMap'
import { normalize104CapturedJob } from '../src/integrations/job104/normalize104CapturedJob'
import type { Job104ConnectorCommand, Job104Payload } from '../src/integrations/job104/types'

// Independent expected values from the approved public UI / URL / reopen contract.
const approved = [
  ['全部地區', null], ['台北市', '6001001000'], ['新北市', '6001002000'],
  ['桃園市', '6001005000'], ['台中市', '6001008000'], ['台南市', '6001014000'],
  ['高雄市', '6001016000'], ['基隆市', '6001004000'], ['新竹市', '6001006001'],
  ['新竹縣市', '6001006000'], ['嘉義市', '6001013001'], ['嘉義縣市', '6001013000'],
  ['苗栗縣', '6001007000'], ['彰化縣', '6001010000'], ['南投縣', '6001011000'],
  ['雲林縣', '6001012000'], ['屏東縣', '6001018000'], ['宜蘭縣', '6001003000'],
  ['花蓮縣', '6001020000'], ['台東縣', '6001019000'], ['澎湖縣', '6001021000'],
  ['金門縣', '6001022000'], ['連江縣', '6001023000'],
] as const
const keyword = 'Vue 前端 & C++'
const sourceUrl = (area: string | null) => {
  const url = new URL('https://www.104.com.tw/jobs/search/')
  if (area !== null) url.searchParams.set('area', area)
  url.searchParams.set('keyword', keyword)
  return url.toString()
}
const payload = (url: string): Job104Payload => ({
  version: 1, source: '104', capturedAt: '2026-09-29T04:00:00.000Z',
  sourceUrl: url, jobs: structuredClone(sampleJobs),
})
const panel = (location = '全部地區') => renderToStaticMarkup(
  <SearchPanel keyword={keyword} location={location} onSearch={() => {}} />,
)

describe('approved Taiwan 104 region configuration and rendered options', () => {
  it('contains exactly the approved labels, order and evidenced mappings', () => {
    expect(Object.entries(location104Map)).toEqual(approved)
  })
  it('renders every approved option in order without exposing pure Hsinchu/Chiayi counties', () => {
    const options = [...panel().matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/g)]
    expect(options.map(([, value, text]) => [value, text])).toEqual(approved.map(([label]) => [label, label]))
    expect(options.some(([, value]) => value === '新竹縣' || value === '嘉義縣')).toBe(false)
  })
  it.each(approved)('builds %s with the exact approved area and unchanged keyword behavior', (label, area) => {
    expect(isSupported104Location(label)).toBe(true)
    expect(get104AreaCode(label)).toBe(area)
    const url = new URL(build104SearchUrl(` ${keyword} `, label))
    expect(url.origin + url.pathname).toBe('https://www.104.com.tw/jobs/search/')
    expect(url.searchParams.get('keyword')).toBe(keyword)
    expect(url.searchParams.has('area')).toBe(area !== null)
    expect(url.searchParams.get('area')).toBe(area)
    expect([...url.searchParams.keys()]).toEqual(area === null ? ['keyword'] : ['area', 'keyword'])
  })
  it.each(['新竹縣', '嘉義縣', '未知地區', '', '台北市中山區', 'toString', '__proto__'])('safely rejects unsupported %s without guessing', label => {
    expect(isSupported104Location(label)).toBe(false)
    expect(get104AreaCode(label)).toBeNull()
    expect(() => build104SearchUrl(keyword, label)).toThrow('此地區尚未完成 104 Connector 驗證。')
    expect(payloadMatches104Search(payload(sourceUrl(null)), keyword, label)).toBe(false)
  })
  it('keeps keyword-required validation before any regional navigation', () => {
    expect(() => build104SearchUrl(' ', '全部地區')).toThrow('請輸入 104 職缺關鍵字。')
  })
  it('does not display a restored unsupported value as the first supported option', () => {
    const html = panel('新竹縣')
    expect(html).toContain('<option value="新竹縣" disabled="" selected="">此地區不支援，請重新選擇</option>')
    expect(html).not.toContain('>新竹縣</option>')
    expect(html).not.toContain('<option value="全部地區" selected="">')
  })
})

describe('captured-search comparison retains exact region semantics', () => {
  it.each(approved)('accepts only the matching query for %s', (label, area) => {
    const captured = payload(sourceUrl(area))
    expect(payloadMatches104Search(captured, keyword, label)).toBe(true)
    expect(payloadMatches104Search(captured, 'different keyword', label)).toBe(false)
    for (const [otherLabel] of approved) {
      if (otherLabel !== label) expect(payloadMatches104Search(captured, keyword, otherLabel)).toBe(false)
    }
  })
  it.each(['', '0', 'ALL', '*', '6001008000'])('rejects area=%s as an unrestricted capture', area => {
    expect(payloadMatches104Search(payload(sourceUrl(area)), keyword, '全部地區')).toBe(false)
  })
  it('ignores normal public sorting/source parameters but preserves the location guard', () => {
    const url = new URL(sourceUrl(null))
    url.searchParams.set('jobsource', 'joblist_search')
    url.searchParams.set('page', '1')
    expect(payloadMatches104Search(payload(url.toString()), keyword, '全部地區')).toBe(true)
    expect(payloadMatches104Search(payload('invalid URL'), keyword, '全部地區')).toBe(false)
  })
})

describe('unchanged Connector interface and location normalization', () => {
  it.each(approved)('accepts the same capture DTO and bridge commands for %s', async (_label, area) => {
    const captured = payload(sourceUrl(area))
    const transport = vi.fn(async (_command: Job104ConnectorCommand) => ({ status: 'ready' as const, payload: captured }))
    const client = create104ConnectorClient(transport)
    expect(Object.keys(client)).toEqual(['status', 'getLatest', 'clear'])
    await expect(client.status()).resolves.toEqual({ status: 'ready', payload: captured })
    await expect(client.getLatest()).resolves.toEqual({ status: 'ready', payload: captured })
    await expect(client.clear()).resolves.toEqual({ status: 'ready', payload: captured })
    expect(transport.mock.calls.map(call => call[0])).toEqual(['JOBQUEST_104_STATUS', 'JOBQUEST_104_GET_LATEST', 'JOBQUEST_104_CLEAR'])
  })
  it.each(['台北市中山區', '新竹縣竹北市', '嘉義市', '嘉義縣民雄鄉', '花蓮縣吉安鄉', '金門縣金城鎮'])('preserves public job location text %s without regional branches', location => {
    const captured = { ...sampleJobs[0], location }
    const job = normalize104CapturedJob(captured, '2026-09-29T04:00:00.000Z')
    expect(job.location).toBe(location)
    expect(job.url).toBe(captured.canonicalUrl)
    expect(job.id).toBe(captured.sourceKey)
  })
})
