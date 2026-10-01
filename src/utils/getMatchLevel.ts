import type { MatchLevel } from '../types'

export function getMatchLevel(score: number): MatchLevel {
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

export function getMatchLevelLabel(level: MatchLevel): string {
  const labels: Record<MatchLevel, string> = {
    S: '高匹配',
    A: '符合度高',
    B: '部分符合',
    C: '有能力缺口',
    D: '差距較多',
  }
  return labels[level]
}
