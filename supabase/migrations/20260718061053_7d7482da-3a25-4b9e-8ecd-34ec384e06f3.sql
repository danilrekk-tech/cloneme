
CREATE TABLE public.clone_refinements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.clone_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  version INTEGER NOT NULL,
  brief TEXT,
  audit TEXT,
  changes TEXT,
  preview_path TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  error TEXT,
  model TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (job_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clone_refinements TO authenticated;
GRANT ALL ON public.clone_refinements TO service_role;

ALTER TABLE public.clone_refinements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own refinements" ON public.clone_refinements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_clone_refinements_job ON public.clone_refinements(job_id, version DESC);

CREATE TRIGGER update_clone_refinements_updated_at
  BEFORE UPDATE ON public.clone_refinements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clone_jobs ADD COLUMN IF NOT EXISTS active_refinement_id UUID REFERENCES public.clone_refinements(id) ON DELETE SET NULL;
