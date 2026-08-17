import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateConcepts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ jobId: z.string().uuid(), brief: z.string().max(4000).optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { runConceptGeneration } = await import("./concepts.server");
    return runConceptGeneration(context.supabase, context.userId, data.jobId, (data.brief ?? "").trim());
  });

export const listConcepts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ jobId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { listConceptsFor } = await import("./concepts.server");
    return listConceptsFor(context.supabase, context.userId, data.jobId);
  });
