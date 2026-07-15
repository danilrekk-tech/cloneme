CREATE TABLE public.clone_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ditto_job_id TEXT,
  source_url TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'single',
  framework TEXT NOT NULL DEFAULT 'next',
  styling TEXT NOT NULL DEFAULT 'tailwind',
  status TEXT NOT NULL DEFAULT 'queued',
  last_event JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clone_jobs TO authenticated;
GRANT ALL ON public.clone_jobs TO service_role;

ALTER TABLE public.clone_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own clone jobs"
  ON public.clone_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own clone jobs"
  ON public.clone_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own clone jobs"
  ON public.clone_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own clone jobs"
  ON public.clone_jobs FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_clone_jobs_updated_at
  BEFORE UPDATE ON public.clone_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX clone_jobs_user_created_idx ON public.clone_jobs(user_id, created_at DESC);