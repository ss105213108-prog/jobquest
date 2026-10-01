const readButton = document.querySelector('#read-jobs')
const statusElement = document.querySelector('#status')
const outputElement = document.querySelector('#output')

const EXPECTED_HOST = 'www.104.com.tw'
const EXPECTED_PATH = '/jobs/search/'
const EXPECTED_KEYWORD = '前端工程師'
const EXPECTED_AREA = '6001008000'

function validateAuditPage(tab) {
  if (!tab?.id || !tab.url) {
    throw new Error('無法取得目前分頁。')
  }

  const url = new URL(tab.url)
  const isExpectedSearch =
    url.protocol === 'https:' &&
    url.hostname === EXPECTED_HOST &&
    url.pathname === EXPECTED_PATH &&
    url.searchParams.get('keyword') === EXPECTED_KEYWORD &&
    url.searchParams.get('area') === EXPECTED_AREA

  if (!isExpectedSearch) {
    throw new Error('請先開啟 Phase 6B 指定的 104「前端工程師／台中市」搜尋頁。')
  }

  return tab.id
}

async function readCurrentJobs() {
  readButton.disabled = true
  statusElement.textContent = '讀取中…'

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const tabId = validateAuditPage(tab)
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['extract-jobs.js'],
    })
    const jobs = injectionResults[0]?.result

    if (!Array.isArray(jobs)) {
      throw new Error('內容腳本沒有回傳可用的職缺陣列。')
    }

    const json = JSON.stringify(jobs, null, 2)
    outputElement.textContent = json
    statusElement.textContent = `成功取得 ${jobs.length} 筆（最多 10 筆）`
    console.log('[Job Quest 104 Audit]', jobs)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    outputElement.textContent = JSON.stringify({ error: message }, null, 2)
    statusElement.textContent = '讀取失敗'
    console.error('[Job Quest 104 Audit]', error)
  } finally {
    readButton.disabled = false
  }
}

readButton.addEventListener('click', readCurrentJobs)
