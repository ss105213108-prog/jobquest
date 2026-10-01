(() => {
  const MAX_JOBS = 10
  const JOB_PATH_PATTERN = /^\/job\/([a-z0-9]+)\/?$/i
  const cleanText = (value) => value?.textContent?.replace(/\s+/g, ' ').trim() || ''

  function findLinkByQueryParameter(card, parameter) {
    return [...card.querySelectorAll('a[href]')].find((anchor) => {
      try {
        return new URL(anchor.href).searchParams.has(parameter)
      } catch {
        return false
      }
    })
  }

  function findSalaryLink(card) {
    return [...card.querySelectorAll('a[href]')].find((anchor) => {
      const label = cleanText(anchor)

      try {
        const params = new URL(anchor.href).searchParams
        return (
          params.has('scmin') ||
          params.has('scmax') ||
          params.has('sctp') ||
          params.has('sr') ||
          /(?:月薪|年薪|時薪|日薪|論件計酬|待遇面議|依經驗核薪)/.test(label)
        )
      } catch {
        return false
      }
    })
  }

  function normalizeCard(card) {
    const jobLink = card.querySelector('a.info-job__text[href*="/job/"]')
    const companyLink = card.querySelector('a.info-company__text[href*="/company/"]')

    if (!jobLink) return null

    const jobUrl = new URL(jobLink.href)
    const match = jobUrl.pathname.match(JOB_PATH_PATTERN)
    if (!match) return null

    const externalId = match[1].toLowerCase()
    const locationLink = findLinkByQueryParameter(card, 'area')
    const experienceLink = findLinkByQueryParameter(card, 'jobexp')
    const salaryLink = findSalaryLink(card)

    return {
      source: '104',
      externalId,
      sourceKey: `104:${externalId}`,
      title: cleanText(jobLink),
      company: cleanText(companyLink),
      location: cleanText(locationLink),
      salaryText: cleanText(salaryLink),
      experienceText: cleanText(experienceLink) || undefined,
      canonicalUrl: `https://www.104.com.tw/job/${externalId}`,
    }
  }

  const currentUrl = new URL(window.location.href)
  if (currentUrl.hostname !== 'www.104.com.tw' || currentUrl.pathname !== '/jobs/search/') {
    throw new Error('This prototype only reads the active 104 search results page.')
  }

  const seen = new Set()
  const jobs = []

  for (const card of document.querySelectorAll('.job-list-container')) {
    const job = normalizeCard(card)
    if (!job || seen.has(job.sourceKey)) continue

    seen.add(job.sourceKey)
    jobs.push(job)
    if (jobs.length === MAX_JOBS) break
  }

  return jobs
})()
