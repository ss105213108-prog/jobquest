import { preferenceRepository } from '../repositories/preferenceRepository'
import type { SearchPreference } from '../types'

export const preferenceService = {
  load: () => preferenceRepository.getCurrent(),
  save: (userId: string, preference: SearchPreference) => preferenceRepository.upsert(userId, preference),
}
