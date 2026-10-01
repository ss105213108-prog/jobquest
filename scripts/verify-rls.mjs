import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const expectedRef = 'neqwkiruqfevlchiajor'
const expectedUrl = `https://${expectedRef}.supabase.co`
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)

if (env.VITE_SUPABASE_URL !== expectedUrl) throw new Error('BLOCKED: SUPABASE_TARGET_MISMATCH')
if (!env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('Missing publishable key')

const makeClient = () => createClient(expectedUrl, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const clientA = makeClient()
const clientB = makeClient()
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const ownRows = async (client, userId) => {
  const [resume, preference, actions] = await Promise.all([
    client.from('resume_profiles').select('user_id,name'),
    client.from('job_preferences').select('user_id,source'),
    client.from('user_job_actions').select('user_id,job_key,favorite'),
  ])
  for (const result of [resume, preference, actions]) assert(!result.error, `Own SELECT failed: ${result.error?.message}`)
  assert(resume.data.length === 1 && resume.data[0].user_id === userId, 'Resume owner isolation failed')
  assert(preference.data.length === 1 && preference.data[0].user_id === userId, 'Preference owner isolation failed')
  assert(actions.data.length === 1 && actions.data[0].user_id === userId, 'Job action owner isolation failed')
}

const attack = async (attacker, victimId, label) => {
  const crossSelects = await Promise.all([
    attacker.from('resume_profiles').select('user_id').eq('user_id', victimId),
    attacker.from('job_preferences').select('user_id').eq('user_id', victimId),
    attacker.from('user_job_actions').select('user_id').eq('user_id', victimId),
  ])
  for (const result of crossSelects) {
    assert(!result.error, `${label} cross SELECT returned an unexpected error`)
    assert(result.data.length === 0, `${label} cross SELECT exposed a row`)
  }

  const insert = await attacker.from('user_job_actions').insert({ user_id: victimId, job_key: `${label}-attack`, source: '104', favorite: true })
  assert(insert.error?.code === '42501', `${label} cross INSERT was not denied by RLS`)

  const update = await attacker.from('resume_profiles').update({ name: `${label}-attack` }).eq('user_id', victimId).select('user_id')
  assert(!update.error && update.data.length === 0, `${label} cross UPDATE touched victim data`)

  const deletion = await attacker.from('job_preferences').delete().eq('user_id', victimId).select('user_id')
  assert(!deletion.error && deletion.data.length === 0, `${label} cross DELETE touched victim data`)
}

const cleanup = async (client) => {
  await client.from('user_job_actions').delete().neq('job_key', '')
  await client.from('job_preferences').delete().neq('source', '')
  await client.from('resume_profiles').delete().neq('name', '__never__')
}

let userA
let userB
try {
  const [authA, authB] = await Promise.all([clientA.auth.signInAnonymously(), clientB.auth.signInAnonymously()])
  assert(!authA.error && authA.data.user, `Anonymous Auth A failed: ${authA.error?.message}`)
  assert(!authB.error && authB.data.user, `Anonymous Auth B failed: ${authB.error?.message}`)
  userA = authA.data.user
  userB = authB.data.user
  assert(userA.id !== userB.id, 'A/B auth.uid values are not distinct')

  const writes = await Promise.all([
    clientA.from('resume_profiles').insert({ user_id: userA.id, name: 'Resume A', skills: ['React'] }),
    clientA.from('job_preferences').insert({ user_id: userA.id, source: '104' }),
    clientA.from('user_job_actions').insert({ user_id: userA.id, job_key: '104-01', source: '104', favorite: true }),
    clientB.from('resume_profiles').insert({ user_id: userB.id, name: 'Resume B', skills: ['TypeScript'] }),
    clientB.from('job_preferences').insert({ user_id: userB.id, source: '1111' }),
    clientB.from('user_job_actions').insert({ user_id: userB.id, job_key: '1111-02', source: '1111', favorite: true }),
  ])
  for (const result of writes) assert(!result.error, `Owner write failed: ${result.error?.message}`)

  await Promise.all([ownRows(clientA, userA.id), ownRows(clientB, userB.id)])
  await attack(clientA, userB.id, 'A-to-B')
  await attack(clientB, userA.id, 'B-to-A')

  console.log(`Target lock PASS: ${expectedRef}`)
  console.log('Anonymous Auth PASS: two distinct auth.uid values')
  console.log('A/B owner reads PASS: resume, preference, job action')
  console.log('Cross-user SELECT PASS: zero rows in both directions')
  console.log('Cross-user INSERT PASS: 42501 denied in both directions')
  console.log('Cross-user UPDATE PASS: zero rows in both directions')
  console.log('Cross-user DELETE PASS: zero rows in both directions')
} finally {
  if (userA) await cleanup(clientA)
  if (userB) await cleanup(clientB)
}
