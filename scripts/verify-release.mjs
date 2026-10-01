// Read-only release checks. Findings never print credential values.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'

const staged = process.argv.includes('--staged')
const files = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached',
  ...(staged ? [] : ['--others', '--exclude-standard'])], { encoding: 'utf8' }).split('\0').filter(Boolean))]
const findings = []
const rules = [
  ['Supabase secret', /sb_secret_[A-Za-z0-9_-]{16,}/g],
  ['GitHub credential', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['AI API credential', /(?:sk-or-v1-[A-Za-z0-9_-]{24,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})/g],
  ['Google API credential', /AIza[A-Za-z0-9_-]{30,}/g],
  ['AWS access key', /(?:AKIA|ASIA)[A-Z0-9]{16}/g],
  ['Slack credential', /xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
]

for (const file of files) {
  if (/(?:^|\/)(?:\.env[^/]*|credentials\.json)$/.test(file) && file !== '.env.example') findings.push({ file, issue: 'Forbidden credential file' })
  if (/^(?:node_modules|dist|work|\.vercel|\.vitest|supabase\/\.temp)\//.test(file)) findings.push({ file, issue: 'Generated/private directory' })
  const bytes = staged ? execFileSync('git', ['show', `:${file}`], { maxBuffer: 20 * 1024 * 1024 }) : readFileSync(file)
  if (bytes.includes(0)) continue
  const text = bytes.toString('utf8')
  for (const [issue, pattern] of rules) {
    for (const match of text.matchAll(pattern)) findings.push({ file, issue, line: text.slice(0, match.index).split('\n').length })
  }
  // Any real JWT is a credential candidate, including service-role/session JWTs.
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'))
      findings.push({ file, issue: payload.role === 'service_role' ? 'Service-role JWT' : 'Literal JWT', line: text.slice(0, match.index).split('\n').length })
    } catch { /* Non-JWT fixture/regex text. */ }
  }
}

// Check the release's public entry documents, including its two screenshots.
const entryDocs = ['README.md', 'docs/architecture.md', 'docs/screenshots/README.md', 'docs/jobquest-github-technical-release.md']
let localLinks = 0
for (const file of entryDocs) {
  if (!existsSync(file)) { findings.push({ file, issue: 'Missing release document' }); continue }
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split(/\s+["']/)[0]
    if (/^(?:https?:|mailto:|#)/.test(target)) continue
    localLinks++
    const path = resolve(dirname(file), decodeURIComponent(target.split('#')[0]))
    if (/^[A-Za-z]:/.test(target) || relative(process.cwd(), path).startsWith('..') || !existsSync(path)) findings.push({ file, issue: 'Broken/nonportable link', target })
    else {
      const releasePath = relative(process.cwd(), path).replaceAll('\\', '/')
      const included = statSync(path).isDirectory()
        ? files.some(candidate => candidate.startsWith(`${releasePath}/`))
        : files.includes(releasePath)
      if (!included) findings.push({ file, issue: 'Linked file not in release', target })
    }
  }
}

console.log(JSON.stringify({ mode: staged ? 'staged blobs' : 'release candidates', files: files.length, localLinks, findings }, null, 2))
if (findings.length) process.exitCode = 1
