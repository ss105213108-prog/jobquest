// Isolated computed-style fixture, not App/Auth or final browser acceptance.
// Run after npm run build: node tests/helpers/resumeEditorReadabilityProbe.mjs
import { createServer } from 'vite'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync, readdirSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { inspectResumeEditorReadability } from './resumeEditorReadabilityChecks.mjs'

const root = process.cwd()
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' })
const { ResumeReview } = await vite.ssrLoadModule('/src/components/onboarding/ResumeReview.tsx')
const { createEmptyResumeDraft } = await vite.ssrLoadModule('/src/services/manualResumeDraft.ts')
const profile = createEmptyResumeDraft()
profile.name = '使用者輸入文字觀察'
profile.education = { school: '', department: '既有科系', graduationStatus: '既有狀態' }
profile.skills = ['使用者加入的技能', 'long-editable-technology-name-without-spaces'.repeat(3)]
profile.certifications = ['使用者加入的證照']
profile.careerDirections = ['使用者填寫的求職方向']
profile.workExperiences = [{ title: '', company: '使用者輸入的公司', description: '工作內容長文字觀察，確認行距與可編輯區域。'.repeat(30) }]
profile.projects = [{ name: '使用者输入專案名稱', description: '專案描述長文字觀察。'.repeat(30), skills: ['專案技術'] }]
const renderReview = sourceContext => renderToStaticMarkup(React.createElement(ResumeReview, {
  profile, sourceContext, changeFileLabel: '取消編輯', onChangeFile: () => {}, onConfirm: async () => {},
}))
const manual = renderReview('confirmed-edit')
const ai = renderReview('ai-draft')
const cssFile = readdirSync(path.join(root, 'dist/assets')).find(file => file.endsWith('.css'))
const css = readFileSync(path.join(root, 'dist/assets', cssFile), 'utf8')
await vite.close()
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname
  const review = pathname === '/ai' ? ai : manual
  const context = pathname === '/profile'
    ? '<div class="app-shell"><div class="app-grid"><aside class="guild-sidebar"></aside><main class="parchment-main"><div class="profile-resume-flow">' + review + '</div></main><aside class="resume-panel"></aside></div></div>'
    : '<main class="onboarding-shell"><div class="resume-upload-flow">' + review + '</div></main>'
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  const checks = 'const capture=()=>{document.getElementById("readability-results").textContent=JSON.stringify((' + inspectResumeEditorReadability.toString() + ')());};capture();addEventListener("resize",capture);'
  res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Resume Editor Readability Probe</title><style>' + css + '</style><body>' + context + '<script type="application/json" id="readability-results"></script><script>' + checks + '</script></body></html>')
})
server.listen(5178, '127.0.0.1', () => console.log('Read-only fixture: http://127.0.0.1:5178/create, /profile, /ai'))
