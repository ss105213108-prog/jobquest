import { createParseResumeAiHandler } from './handler.ts'
import { createUserAuthenticator } from './auth.ts'
import { createPrivacySafeLogger } from './privacyLogging.ts'

const log = createPrivacySafeLogger(console)

Deno.serve(createParseResumeAiHandler({
  authenticate: createUserAuthenticator(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), fetch),
  getOpenRouterKey: () => Deno.env.get('OPENROUTER_API_KEY'),
  fetch,
  log,
  allowedOrigins: (Deno.env.get('RESUME_AI_ALLOWED_ORIGINS') ?? 'http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean),
}))
