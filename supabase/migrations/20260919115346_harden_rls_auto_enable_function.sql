-- JobQuest security advisor hardening (remote version 20260919115346).
-- The automatic-RLS helper must not be callable through the public Data API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
