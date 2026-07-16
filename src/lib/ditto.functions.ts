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

function isTerminal(status: string): boolean {
  return ["succeeded", "done", "failed", "error", "cancelled"].includes(status);
}

function summarizeFiles(files: Record<string, any> | undefined) {
  if (!files || typeof files !== "object") return null;
  const entries = Object.entries(files);
  return {
    count: entries.length,
    totalBytes: entries.reduce((s, [, v]: [string, any]) => s + (Number(v?.bytes) || 0), 0),
    paths: entries.slice(0, 20).map(([p]) => p),
  };
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
        error: `Ditto API ${res.status}: ${text.slice(0, 800)}`,
      }).eq("id", row.id);
      throw new Error(`Ditto API ${res.status}: ${text.slice(0, 500)}`);
    }

    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}
    const jobId: string | null = body.jobId ?? body.id ?? body.job_id ?? null;
    const status: string = body.status ?? (jobId ? "queued" : "unknown");
    const filesSummary = summarizeFiles(body.files);

    const { data: updated } = await supabase
      .from("clone_jobs")
      .update({
        ditto_job_id: jobId,
        status,
        result: filesSummary ? { files: filesSummary } : null,
      })
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

    // Poll status
    const statusRes = await fetch(`${DITTO_BASE}/clones/${encodeURIComponent(row.ditto_job_id)}`, {
      headers: { "Authorization": `Bearer ${key}`, "Accept": "application/json" },
    });
    const statusText = await statusRes.text();
    if (!statusRes.ok) {
      const errMsg = `Ditto ${statusRes.status}: ${statusText.slice(0, 300)}`;
      const { data: updated } = await supabase
        .from("clone_jobs")
        .update({ error: errMsg })
        .eq("id", row.id)
        .select()
        .single();
      return updated ?? row;
    }

    let meta: any = {};
    try { meta = statusText ? JSON.parse(statusText) : {}; } catch {}
    const status: string = meta.status ?? row.status;
    const errFromMeta: string | null = typeof meta.error === "string" ? meta.error : meta.error ? JSON.stringify(meta.error) : null;

    let filesSummary: any = row.result ?? null;
    if (isTerminal(status) && ["succeeded", "done"].includes(status)) {
      // Fetch file map summary
      const rRes = await fetch(`${DITTO_BASE}/clones/${encodeURIComponent(row.ditto_job_id)}/result`, {
        headers: { "Authorization": `Bearer ${key}`, "Accept": "application/json" },
      });
      if (rRes.ok) {
        try {
          const rBody: any = await rRes.json();
          filesSummary = { files: summarizeFiles(rBody.files) };
        } catch { /* ignore */ }
      }
    }

    const { data: updated } = await supabase
      .from("clone_jobs")
      .update({
        status,
        last_event: meta,
        result: filesSummary,
        error: errFromMeta,
      })
      .eq("id", row.id)
      .select()
      .single();
    return updated ?? row;
  });

// Fetches the bundle .tgz from Ditto and returns as base64 for client download.
export const downloadCloneBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const key = requireDittoKey();
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("clone_jobs")
      .select("id, ditto_job_id, source_url, status")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Job not found");
    if (!row.ditto_job_id) throw new Error("Job has no upstream id");
    if (!["succeeded", "done"].includes(row.status)) throw new Error("Job not finished yet");

    const res = await fetch(
      `${DITTO_BASE}/clones/${encodeURIComponent(row.ditto_job_id)}/bundle?format=tgz`,
      { headers: { "Authorization": `Bearer ${key}` } },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Bundle download failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    // base64 encode
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const host = (() => {
      try { return new URL(row.source_url).hostname.replace(/[^a-z0-9.-]/gi, "_"); }
      catch { return "clone"; }
    })();
    return {
      filename: `${host}-${row.ditto_job_id}.tgz`,
      contentType: "application/gzip",
      base64,
    };
  });
