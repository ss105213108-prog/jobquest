import { useState } from 'react'
import type { JobSource, ResumeProfile } from '../../types'
import { ResumeStep } from './ResumeStep'
import { SourceStep } from './SourceStep'

interface OnboardingProps {
  onComplete: (source: JobSource, resume: ResumeProfile) => Promise<void>
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [source, setSource] = useState<JobSource | null>(null)
  const [step, setStep] = useState<'source' | 'resume'>('source')

  return (
    <main className="onboarding-shell">
      <div className="onboarding-brand"><span className="guild-seal">JQ</span><strong>Job Quest Guild</strong><small>求職冒險者公會</small></div>
      {step === 'source' ? (
        <SourceStep value={source} onChange={setSource} onNext={() => setStep('resume')} />
      ) : (
        <ResumeStep onBack={() => setStep('source')} onComplete={async (resume) => { if (source) await onComplete(source, resume) }} />
      )}
      <div className="step-dots"><span className="active" /><span className={step === 'resume' ? 'active' : ''} /></div>
    </main>
  )
}
