const captureButton = document.querySelector('#capture')
const statusElement = document.querySelector('#status')
const outputElement = document.querySelector('#output')

function is104SearchPage(tab) {
  if (!tab?.id || !tab.url) return false
  try {
    const url = new URL(tab.url)
    return url.protocol === 'https:' && url.hostname === 'www.104.com.tw' && url.pathname === '/jobs/search/'
  } catch {
    return false
  }
}

async function captureJobs() {
  captureButton.disabled = true
  statusElement.textContent = '擷取中……'
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!is104SearchPage(tab)) throw new Error('請先開啟 104 公開職缺搜尋結果頁。')

    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture-jobs.js'] })
    const payload = results[0]?.result
    if (!payload?.jobs?.length) throw new Error('目前頁面沒有可匯入的公開職缺。')

    const response = await chrome.runtime.sendMessage({ type: 'JOBQUEST_104_STORE_CAPTURE', payload })
    if (response?.status !== 'ready') throw new Error(response?.message || '無法保存本次擷取結果。')

    statusElement.textContent = `已擷取 ${payload.jobs.length} 筆；30 分鐘內可回 Job Quest 匯入。`
    outputElement.textContent = JSON.stringify(payload, null, 2)
    console.log('[Job Quest 104 Connector]', payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    statusElement.textContent = message
    outputElement.textContent = JSON.stringify({ error: message }, null, 2)
    console.error('[Job Quest 104 Connector]', error)
  } finally {
    captureButton.disabled = false
  }
}

captureButton.addEventListener('click', captureJobs)
