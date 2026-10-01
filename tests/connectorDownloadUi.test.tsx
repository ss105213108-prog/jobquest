import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Job104ConnectorControls } from '../src/components/search/Job104ConnectorControls'
import type { Job104ConnectorState } from '../src/integrations/job104/types'

const render = (state: Job104ConnectorState) => renderToStaticMarkup(
  <Job104ConnectorControls state={state} capturedCount={state === 'ready' ? 22 : 0}
    capturedAt={null} disabled={false} onImport={() => {}} onRefresh={() => {}} />,
)

describe('Connector download UI', () => {
  it('offers the same-origin ZIP outside collapsed installation details only when missing', () => {
    const html = render('missing-extension')
    expect(html).toContain('尚未偵測到 Job Quest 104 Connector。')
    expect(html).toContain('href="/downloads/jobquest-104-connector.zip" download="jobquest-104-connector.zip"')
    expect(html.indexOf('下載 104 Connector')).toBeLessThan(html.indexOf('<details>'))
    expect(html).toContain('ZIP 無法直接安裝')
    expect(html).toContain('chrome://extensions')
    expect(html).toContain('edge://extensions')
    expect(html).toContain('Developer Mode')
    expect(html).toContain('Load unpacked')
    expect(html).toContain('manifest.json')
    expect(html).toContain('重新整理 Job Quest')
    expect(html.match(/<li>/g)).toHaveLength(7)
    expect(html).toContain('class="primary-button connector-import" disabled=""')
  })

  it('preserves available capture import controls without installation UI', () => {
    const html = render('ready')
    expect(html).not.toContain('/downloads/')
    expect(html).not.toContain('<details>')
    expect(html).toContain('22')
    expect(html).toContain('class="primary-button connector-import">匯入並配對</button>')
    expect(html).toContain('檢查 Connector')
  })

  it('does not offer installation for an installed Connector with no capture', () => {
    const html = render('no-capture')
    expect(html).not.toContain('/downloads/')
    expect(html).toContain('class="primary-button connector-import" disabled=""')
    expect(html).toContain('檢查 Connector')
  })
})
