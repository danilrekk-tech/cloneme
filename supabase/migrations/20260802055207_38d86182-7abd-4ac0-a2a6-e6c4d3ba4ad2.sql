ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS refine_fallback_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS refine_research boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS refine_provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS omniroute_base_url text,
  ADD COLUMN IF NOT EXISTS omniroute_model text;