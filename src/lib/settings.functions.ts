import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserSettings = {
  omniroute_api_key: string | null;
  default_mode: "single" | "multi";
  default_framework: "next" | "vite";
  default_styling: "tailwind" | "css";
  refine_model: string;
  refine_temperature: number;
  refine_budget: number;
};

const DEFAULTS: UserSettings = {
  omniroute_api_key: null,
  default_mode: "single",
  default_framework: "next",
  default_styling: "tailwind",
  refine_model: "google/gemini-2.5-pro",
  refine_temperature: 0.6,
  refine_budget: 60000,
};

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await (supabase as any)
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return DEFAULTS;
    return {
      omniroute_api_key: data.omniroute_api_key ?? null,
      default_mode: data.default_mode,
      default_framework: data.default_framework,
      default_styling: data.default_styling,
      refine_model: data.refine_model,
      refine_temperature: Number(data.refine_temperature),
      refine_budget: data.refine_budget,
    } as UserSettings;
  });

const saveSchema = z.object({
  omniroute_api_key: z.string().max(4000).nullable().optional(),
  default_mode: z.enum(["single", "multi"]).optional(),
  default_framework: z.enum(["next", "vite"]).optional(),
  default_styling: z.enum(["tailwind", "css"]).optional(),
  refine_model: z.string().min(1).max(120).optional(),
  refine_temperature: z.number().min(0).max(2).optional(),
  refine_budget: z.number().int().min(10000).max(200000).optional(),
});

export const saveUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => saveSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload: any = { user_id: userId, ...data };
    if (payload.omniroute_api_key !== undefined) {
      payload.omniroute_api_key =
        typeof payload.omniroute_api_key === "string"
          ? payload.omniroute_api_key.trim() || null
          : null;
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
  if (!data) return DEFAULTS;
  return {
    omniroute_api_key: data.omniroute_api_key ?? null,
    default_mode: data.default_mode,
    default_framework: data.default_framework,
    default_styling: data.default_styling,
    refine_model: data.refine_model,
    refine_temperature: Number(data.refine_temperature),
    refine_budget: data.refine_budget,
  };
}
