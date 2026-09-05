CREATE TABLE public.clone_edits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.clone_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patch JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clone_edits TO authenticated;
GRANT ALL ON public.clone_edits TO service_role;

ALTER TABLE public.clone_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own clone edits"
ON public.clone_edits FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);