-- Work Item 7: nullable snapshot foundation only; no backfill or behavior change.
ALTER TABLE public.user_job_actions
  ADD COLUMN job_snapshot jsonb NULL;
