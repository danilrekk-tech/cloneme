import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DITTO_BASE = "https://api.ditto.site/v1";

const createSchema = z.object({
  url: z.string().url().max(2048),
  mode: z.enum(["single", "multi"]).default("single"),
  framework: z.enum(["next", "vite"]).default("next"),
  styling: z.enum(["tailwind", "css"]).default("tailwind"),
});

type CreateInput = z.infer<typeof createSchema>;

function requireDittoKey(): string {
  const key = process.env.DITTO_API_KEY;
  if (!key) throw new Error("DITTO_API_KEY is not configured on the server");
  return key;
}

function pickStatusFromEvents(events: unknown, fallback: string): {
  status: string;
  last: unknown;
  result: unknown;
  error: string | null;
} {
  let list: any[] = [];
  if (Array.isArray(events)) list = events;
  else if (events && typeof events === "object") {
    const anyEv = events as any;
    if (Array.isArray(anyEv.events)) list = anyEv.events;
    else if (Array.isArray(anyEv.data)) list = anyEv.data;
    else if (Array.isArray(anyEv.items)) list = anyEv.items;
  }
  const last = list.length ? list[list.length - 1] : null;
  let status = fallback;
  let result: unknown = null;
  let error: string | null = null;
  for (const ev of list) {
    const s = ev?.status ?? ev?.state ?? ev?.type;
    if (typeof s === "string") status = s;
    if (ev?.result) result = ev.result;
    if (ev?.artifact) result = ev.artifact;
    if (ev?.download_url || ev?.downloadUrl || ev?.zip_url) {
      result = { downloadUrl: ev.download_url ?? ev.downloadUrl ?? ev.zip_url, ...(typeof result === "object" && result ? result : {}) };
    }
    if (ev?.error) error = typeof ev.error === "string" ? ev.error : JSON.stringify(ev.error);
  }
  return { status, last, result, error };
}

export const createCloneJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createSchema.parse(raw) as CreateInput)
  .handler(async ({ data, context }) => {
    const key = requireDittoKey();
    const { supabase, userId } = context;

    const { data: row, error: insertErr } = await supabase
      .from("clone_jobs")
      .insert({
        user_id: userId,
        source_url: data.url,
        mode: data.mode,
        framework: data.framework,
        styling: data.styling,
        status: "submitting",
      })
      .select()
      .single();
    if (insertErr || !row) throw new Error(insertErr?.message ?? "Failed to create job record");

    const res = await fetch(`${DITTO_BASE}/clones`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: data.url,
        options: { mode: data.mode, framework: data.framework, styling: data.styling },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      await supabase.from("clone_jobs").update({
        status: "failed",
        error: `Ditto API ${res.status}: ${text.slice(0, 500)}`,
      }).eq("id", row.id);
      throw new Error(`Ditto API error [${res.status}]: ${text.slice(0, 300)}`);
    }

    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}
    const jobId = body.jobId ?? body.id ?? body.job_id;
    const status = body.status ?? "queued";

    const { data: updated } = await supabase
      .from("clone_jobs")
      .update({ ditto_job_id: jobId ?? null, status })
      .eq("id", row.id)
      .select()
      .single();

    return updated ?? row;
  });

export const listCloneJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("clone_jobs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const refreshCloneJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const key = requireDittoKey();
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("clone_jobs")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Job not found");
    if (!row.ditto_job_id) return row;

    const res = await fetch(`${DITTO_BASE}/clones/${encodeURIComponent(row.ditto_job_id)}/events?after=0`, {
      headers: { "Authorization": `Bearer ${key}`, "Accept": "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      return row;
    }

    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    const { status, last, result, error: evErr } = pickStatusFromEvents(parsed, row.status);

    const { data: updated } = await supabase
      .from("clone_jobs")
      .update({
        status,
        last_event: last as any,
        result: result as any,
        error: evErr,
      })
      .eq("id", row.id)
      .select()
      .single();
    return updated ?? row;
  });
