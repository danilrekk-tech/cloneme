CREATE TABLE public.clone_concepts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.clone_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  idx INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  spec JSONB,
  image_path TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  error TEXT,
  model TEXT,
  brief TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clone_concepts_job_idx ON public.clone_concepts(job_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clone_concepts TO authenticated;
GRANT ALL ON public.clone_concepts TO service_role;
ALTER TABLE public.clone_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own concepts" ON public.clone_concepts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.clone_refinements ADD COLUMN IF NOT EXISTS concept_id UUID;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS fallback_provider TEXT DEFAULT 'none';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS openrouter_model TEXT;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS concept_model TEXT;