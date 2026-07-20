
-- User-level settings (Omniroute API key, defaults for clone + refine)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  omniroute_api_key text,
  default_mode text NOT NULL DEFAULT 'single',
  default_framework text NOT NULL DEFAULT 'next',
  default_styling text NOT NULL DEFAULT 'tailwind',
  refine_model text NOT NULL DEFAULT 'google/gemini-2.5-pro',
  refine_temperature numeric NOT NULL DEFAULT 0.6,
  refine_budget integer NOT NULL DEFAULT 60000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- MCP server provider tag (custom | omniroute)
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'custom';

-- Refinement extras: recorded MCP tool calls + selected tools + model settings snapshot
ALTER TABLE public.clone_refinements ADD COLUMN IF NOT EXISTS tool_calls jsonb;
ALTER TABLE public.clone_refinements ADD COLUMN IF NOT EXISTS selected_tools jsonb;
ALTER TABLE public.clone_refinements ADD COLUMN IF NOT EXISTS settings jsonb;
