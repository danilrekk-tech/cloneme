import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserSettings = {
  omniroute_api_key: string | null;
  omniroute_base_url: string | null;
  omniroute_model: string | null;
  default_mode: "single" | "multi";
  default_framework: "next" | "vite";
  default_styling: "tailwind" | "css";
  refine_model: string;
  refine_fallback_model: string;
  refine_provider: "lovable" | "omniroute";
  refine_research: boolean;
  refine_temperature: number;
  refine_budget: number;
};

const DEFAULTS: UserSettings = {
  omniroute_api_key: null,
  omniroute_base_url: null,
  omniroute_model: null,
  default_mode: "single",
  default_framework: "next",
  default_styling: "tailwind",
  refine_model: "google/gemini-2.5-pro",
  refine_fallback_model: "google/gemini-2.5-flash",
  refine_provider: "lovable",
  refine_research: true,
  refine_temperature: 0.6,
  refine_budget: 60000,
};

function toSettings(data: any): UserSettings {
  if (!data) return DEFAULTS;
  return {
    omniroute_api_key: data.omniroute_api_key ?? null,
    omniroute_base_url: data.omniroute_base_url ?? null,
    omniroute_model: data.omniroute_model ?? null,
    default_mode: data.default_mode ?? DEFAULTS.default_mode,
    default_framework: data.default_framework ?? DEFAULTS.default_framework,
    default_styling: data.default_styling ?? DEFAULTS.default_styling,
    refine_model: data.refine_model ?? DEFAULTS.refine_model,
    refine_fallback_model: data.refine_fallback_model ?? DEFAULTS.refine_fallback_model,
    refine_provider: (data.refine_provider ?? DEFAULTS.refine_provider) as "lovable" | "omniroute",
    refine_research: data.refine_research ?? DEFAULTS.refine_research,
    refine_temperature: Number(data.refine_temperature ?? DEFAULTS.refine_temperature),
    refine_budget: data.refine_budget ?? DEFAULTS.refine_budget,
  };
}

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await (supabase as any)
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return toSettings(data);
  });

const saveSchema = z.object({
  omniroute_api_key: z.string().max(4000).nullable().optional(),
  omniroute_base_url: z.string().max(500).nullable().optional(),
  omniroute_model: z.string().max(200).nullable().optional(),
  default_mode: z.enum(["single", "multi"]).optional(),
  default_framework: z.enum(["next", "vite"]).optional(),
  default_styling: z.enum(["tailwind", "css"]).optional(),
  refine_model: z.string().min(1).max(120).optional(),
  refine_fallback_model: z.string().min(1).max(120).optional(),
  refine_provider: z.enum(["lovable", "omniroute"]).optional(),
  refine_research: z.boolean().optional(),
  refine_temperature: z.number().min(0).max(2).optional(),
  refine_budget: z.number().int().min(10000).max(200000).optional(),
});

export const saveUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => saveSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload: any = { user_id: userId, ...data };
    for (const k of ["omniroute_api_key", "omniroute_base_url", "omniroute_model"]) {
      if (payload[k] !== undefined) {
        payload[k] = typeof payload[k] === "string" ? payload[k].trim() || null : null;
      }
    }
    const { error } = await (supabase as any)
      .from("user_settings")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Server-side helper — read effective settings inside other server fns. */
export async function loadEffectiveSettings(
  supabase: any,
  userId: string,
): Promise<UserSettings> {
  const { data } = await (supabase as any)
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return toSettings(data);
}
