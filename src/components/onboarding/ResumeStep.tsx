import { useEffect, useRef, useState } from 'react'
import { mockIncompleteResumeExtraction, mockResumeExtraction, validateMockResumeSelection } from '../../services/mockResumeExtraction'
import type { ResumeProfile } from '../../types'
import { ResumeReview } from './ResumeReview'

interface ResumeStepProps { onComplete: (resume: ResumeProfile) => Promise<void>; onBack?: () => void }

export function ResumeStep({ onComplete, onBack }: ResumeStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const attempt = useRef(0)
  const [file, setFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<ResumeProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scenario, setScenario] = useState<'complete' | 'incomplete'>('complete')
  useEffect(() => () => { attempt.current += 1 }, [])
  const startAnalysis = async () => {
    if (!file || isAnalyzing) return
    const current = ++attempt.current
    setIsAnalyzing(true); setError(null)
    try {
      const extract = scenario === 'incomplete' ? mockIncompleteResumeExtraction : mockResumeExtraction
      const next = await extract(file)
      if (current === attempt.current) setResult(next)
    } catch (caught) {
      if (current === attempt.current) setError(caught instanceof Error ? caught.message : '無法產生示範資料。')
    } finally { if (current === attempt.current) setIsAnalyzing(false) }
  }
  const selectFile = (selected: File) => {
    attempt.current += 1; setResult(null); setIsAnalyzing(false)
    try { validateMockResumeSelection(selected); setFile(selected); setError(null) }
    catch (caught) {
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setError(caught instanceof Error ? caught.message : '請選擇 PDF 檔案。')
    }
  }
  if (result) return <ResumeReview profile={result} onConfirm={onComplete} onChangeFile={() => {
    attempt.current += 1; setResult(null); setFile(null); setError(null)
  }} />
  return <section className="onboarding-card resume-step">
    {onBack && <button className="text-button back-button" onClick={onBack}>← 返回</button>}
    <div className="step-kicker">MOCK / DEMO MODE</div><h1>登錄你的履歷</h1>
    <p>本次只預填匿名示範資料，不分析 PDF 內容。檔案不會上傳。</p>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".pdf,application/pdf" aria-label="選擇履歷 PDF"
      onChange={event => { const selected = event.target.files?.[0]; if (selected) selectFile(selected) }} />
    <button className={`upload-scroll ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()}>
      <span className="scroll-icon" aria-hidden="true">▧</span>
      {file ? <><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB</span><b>✓ 已選擇</b></>
        : <><strong>選擇履歷 PDF</strong><span>10 MB 以下</span><b>MOCK / DEMO MODE</b></>}
    </button>
    <fieldset className="mock-scenario" disabled={isAnalyzing}>
      <legend>Mock 草稿情境</legend>
      <label><input type="radio" name="mock-scenario" checked={scenario === 'complete'} onChange={() => setScenario('complete')} />完整草稿</label>
      <label><input type="radio" name="mock-scenario" checked={scenario === 'incomplete'} onChange={() => setScenario('incomplete')} />缺漏草稿</label>
    </fieldset>
    {error && <div className="resume-error" role="alert"><strong>無法使用檔案</strong><span>{error}</span></div>}
    <button className="primary-button" disabled={!file || isAnalyzing} onClick={() => void startAnalysis()}>
      {isAnalyzing ? '正在產生示範資料…' : '產生 Mock Extraction'} <span>✦</span>
    </button>
  </section>
}
