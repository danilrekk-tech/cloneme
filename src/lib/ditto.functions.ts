import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DITTO_BASE = "https://api.ditto.site/v1";
const BUCKET = "clone-artifacts";

const createSchema = z.object({
  url: z.string().url().max(2048),
  mode: z.enum(["single", "multi"]).default("single"),
  framework: z.enum(["next", "vite"]).default("next"),
  styling: z.enum(["tailwind", "css"]).default("tailwind"),
});

type FileEntry = {
  type?: "text" | "binary";
  content?: string;
  url?: string;
  bytes?: number;
  sha256?: string;
};
type FileMap = Record<string, FileEntry>;

function requireDittoKey(): string {
  const key = process.env.DITTO_API_KEY;
  if (!key) throw new Error("DITTO_API_KEY не настроен на сервере");
  return key;
}

function isTerminal(status: string): boolean {
  return ["succeeded", "done", "failed", "error", "cancelled"].includes(status);
}

function summarizeFiles(files: FileMap | undefined) {
  if (!files || typeof files !== "object") return null;
  const entries = Object.entries(files);
  return {
    count: entries.length,
    totalBytes: entries.reduce((s, [, v]) => s + (Number(v?.bytes) || 0), 0),
    paths: entries.map(([p]) => p),
  };
}

async function uploadFilesJson(
  supabase: any,
  userId: string,
  jobId: string,
  files: FileMap,
): Promise<string> {
  const path = `${userId}/${jobId}/files.json`;
  const body = new Blob([JSON.stringify(files)], { type: "application/json" });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Не удалось сохранить результат: ${error.message}`);
  return path;
}

async function downloadFilesJson(supabase: any, path: string): Promise<FileMap> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Не удалось прочитать файлы: ${error?.message ?? "нет данных"}`);
  const text = await (data as Blob).text();
  return JSON.parse(text) as FileMap;
}

async function fetchAndStoreResult(
  key: string,
  supabase: any,
  userId: string,
  row: { id: string; ditto_job_id: string | null },
): Promise<{ filesPath: string | null; summary: any }> {
  if (!row.ditto_job_id) return { filesPath: null, summary: null };
  const r = await fetch(`${DITTO_BASE}/clones/${encodeURIComponent(row.ditto_job_id)}/result`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!r.ok) return { filesPath: null, summary: null };
  const body: any = await r.json();
  const files: FileMap = body.files ?? {};
  const summary = summarizeFiles(files);
  const path = Object.keys(files).length > 0 ? await uploadFilesJson(supabase, userId, row.id, files) : null;
  return { filesPath: path, summary };
}

export const createCloneJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createSchema.parse(raw))
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
    if (insertErr || !row) throw new Error(insertErr?.message ?? "Не удалось создать задачу");

    const res = await fetch(`${DITTO_BASE}/clones`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: data.url,
        options: { mode: data.mode, framework: data.framework, styling: data.styling },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      await supabase
        .from("clone_jobs")
        .update({ status: "failed", error: `Ditto API ${res.status}: ${text.slice(0, 800)}` })
        .eq("id", row.id);
      throw new Error(`Ditto API ${res.status}: ${text.slice(0, 500)}`);
    }

    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {}
    const jobId: string | null = body.jobId ?? body.id ?? body.job_id ?? null;
    const status: string = body.status ?? (jobId ? "queued" : "unknown");

    let filesPath: string | null = null;
    let summary: any = null;
    if (body.files && Object.keys(body.files).length > 0) {
      summary = summarizeFiles(body.files as FileMap);
      filesPath = await uploadFilesJson(supabase, userId, row.id, body.files as FileMap);
    }

    const { data: updated } = await supabase
      .from("clone_jobs")
      .update({
        ditto_job_id: jobId,
        status,
        files_path: filesPath,
        result: summary ? { files: summary } : null,
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
    if (error || !row) throw new Error("Задача не найдена");
    if (!row.ditto_job_id) return row;

    const statusRes = await fetch(`${DITTO_BASE}/clones/${encodeURIComponent(row.ditto_job_id)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
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
    try {
      meta = statusText ? JSON.parse(statusText) : {};
    } catch {}
    const status: string = meta.status ?? row.status;
    const errFromMeta: string | null =
      typeof meta.error === "string" ? meta.error : meta.error ? JSON.stringify(meta.error) : null;

    let filesPath: string | null = row.files_path ?? null;
    let summary: any = row.result ?? null;
    if (isTerminal(status) && ["succeeded", "done"].includes(status) && !filesPath) {
      const stored = await fetchAndStoreResult(key, supabase, userId, row);
      filesPath = stored.filesPath;
      if (stored.summary) summary = { files: stored.summary };
    }

    const { data: updated } = await supabase
      .from("clone_jobs")
      .update({
        status,
        last_event: meta,
        result: summary,
        files_path: filesPath,
        error: errFromMeta,
      })
      .eq("id", row.id)
      .select()
      .single();
    return updated ?? row;
  });

// Returns a downloadable ZIP built from the stored file map, materializing binaries by fetching Ditto URLs.
export const downloadCloneBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const key = requireDittoKey();
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("clone_jobs")
      .select("id, ditto_job_id, source_url, status, files_path")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Задача не найдена");

    // Ensure files.json exists in storage
    let filesPath = row.files_path;
    if (!filesPath && row.ditto_job_id) {
      const stored = await fetchAndStoreResult(key, supabase, userId, row);
      filesPath = stored.filesPath;
      if (filesPath) {
        await supabase.from("clone_jobs").update({ files_path: filesPath }).eq("id", row.id);
      }
    }
    if (!filesPath) throw new Error("Файлы клона ещё не готовы");

    const files = await downloadFilesJson(supabase, filesPath);

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    for (const [path, entry] of Object.entries(files)) {
      if (entry?.type === "binary" || entry?.url) {
        try {
          const br = await fetch(entry.url!, { headers: { Authorization: `Bearer ${key}` } });
          if (br.ok) {
            const buf = new Uint8Array(await br.arrayBuffer());
            zip.file(path, buf);
          }
        } catch {
          /* skip broken binaries */
        }
      } else if (typeof entry?.content === "string") {
        zip.file(path, entry.content);
      }
    }

    const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const host = (() => {
      try {
        return new URL(row.source_url).hostname.replace(/[^a-z0-9.-]/gi, "_");
      } catch {
        return "clone";
      }
    })();
    return {
      filename: `${host}-${row.ditto_job_id ?? row.id}.zip`,
      contentType: "application/zip",
      base64,
    };
  });

// Returns the raw file map for the browser (used by preview + source viewer).
export const getCloneFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("clone_jobs")
      .select("id, files_path, refined_path, source_url")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Задача не найдена");
    if (!row.files_path) throw new Error("Файлы клона ещё не готовы");

    const files = await downloadFilesJson(supabase, row.files_path);
    let refined: { previewHtml?: string; notes?: string; brief?: string } | null = null;
    if (row.refined_path) {
      try {
        const { data: blob } = await supabase.storage.from(BUCKET).download(row.refined_path);
        if (blob) refined = JSON.parse(await (blob as Blob).text());
      } catch {
        /* ignore */
      }
    }
    return { sourceUrl: row.source_url, files, refined };
  });

// AI refinement: reads the file map, sends condensed text to Lovable AI Gateway,
// asks for a beautiful, self-contained single-file HTML preview + notes.
const refineSchema = z.object({
  id: z.string().uuid(),
  brief: z.string().max(4000).optional(),
});

export const refineClone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => refineSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY не настроен");

    const { data: row, error } = await supabase
      .from("clone_jobs")
      .select("id, files_path, source_url")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Задача не найдена");
    if (!row.files_path) throw new Error("Клон ещё не готов");

    await supabase
      .from("clone_jobs")
      .update({ refined_status: "processing", refined_error: null, refined_brief: data.brief ?? null })
      .eq("id", row.id);

    const files = await downloadFilesJson(supabase, row.files_path);

    // Pick the most informative text files, cap total ~180 KB.
    const textEntries = Object.entries(files).filter(
      ([, v]) => typeof v?.content === "string" && (v.type ?? "text") === "text",
    );
    const priority = (p: string) => {
      if (/page\.tsx?$|index\.html?$|layout\.tsx?$/.test(p)) return 0;
      if (/\.tsx?$/.test(p)) return 1;
      if (/\.(css|scss)$/.test(p)) return 2;
      if (/content\.ts$|data\.ts$/.test(p)) return 3;
      if (/\.(json|md|txt)$/.test(p)) return 5;
      return 4;
    };
    textEntries.sort((a, b) => priority(a[0]) - priority(b[0]));

    const excerpts: string[] = [];
    let budget = 180_000;
    for (const [path, v] of textEntries) {
      const content = (v.content ?? "").slice(0, 14_000);
      const block = `\n===== ${path} =====\n${content}\n`;
      if (block.length > budget) break;
      excerpts.push(block);
      budget -= block.length;
    }

    const fileList = Object.keys(files).slice(0, 200).join("\n");
    const brief = (data.brief ?? "").trim();

    const systemPrompt = `Ты — старший продуктовый дизайнер и фронтенд-инженер. Работаешь в духе принципов "design-taste-frontend": анти-шаблонный вкус, реальные дизайн-системы, аудит перед правкой, никакого дефолтного generic-slop.

Тебе дают структуру и исходники сайта, сделанные детерминированным клонером (Next.js/Vite). Твоя задача — предложить детально проработанную улучшенную версию посадочной страницы, СОВМЕСТИМУЮ с брендом клона (сохраняй суть, копирайт, цвета, если явно не сказано иначе). Не выдумывай новый бренд — работай ПОВЕРХ клона.

Проведи короткий аудит (что сломано, generic, что нужно усилить), затем выдай ОДИН самодостаточный HTML-файл preview.html с инлайновыми стилями (Tailwind CDN разрешён), готовый открыть в браузере. Никаких внешних JS-фреймворков, только чистый HTML/CSS и, при необходимости, немного ванильного JS. Файл должен визуально показать финальный результат — hero, ключевые секции, футер, микро-детали.

Отвечай СТРОГО валидным JSON без markdown-ограждений в формате:
{
  "audit": "краткий аудит (3-6 буллетов)",
  "changes": "что изменено и почему (3-6 буллетов)",
  "previewHtml": "<!doctype html>...<html>...</html>"
}`;

    const userPrompt = `Исходный URL: ${row.source_url}

Задача от пользователя (опционально):
${brief || "(не указано — предложи разумные улучшения)"}

Всего файлов в клоне: ${Object.keys(files).length}
Список путей (обрезано):
${fileList}

Ключевые исходники:
${excerpts.join("\n")}

Сделай detailed refinement. previewHtml должен быть ПОЛНЫМ рабочим документом.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      const msg = `AI ${aiRes.status}: ${t.slice(0, 400)}`;
      await supabase
        .from("clone_jobs")
        .update({ refined_status: "failed", refined_error: msg })
        .eq("id", row.id);
      throw new Error(msg);
    }

    const aiJson: any = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: { audit?: string; changes?: string; previewHtml?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to extract JSON block
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {}
      }
    }
    if (!parsed?.previewHtml || parsed.previewHtml.length < 200) {
      const msg = "AI не вернул валидный HTML-препросмотр";
      await supabase
        .from("clone_jobs")
        .update({ refined_status: "failed", refined_error: msg })
        .eq("id", row.id);
      throw new Error(msg);
    }

    const payload = {
      brief: brief || null,
      audit: parsed.audit ?? "",
      changes: parsed.changes ?? "",
      previewHtml: parsed.previewHtml,
      generatedAt: new Date().toISOString(),
    };
    const refinedPath = `${userId}/${row.id}/refined.json`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(refinedPath, new Blob([JSON.stringify(payload)], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
      });
    if (upErr) throw new Error(`Не удалось сохранить улучшенный результат: ${upErr.message}`);

    const { data: updated } = await supabase
      .from("clone_jobs")
      .update({
        refined_path: refinedPath,
        refined_status: "ready",
        refined_error: null,
        refined_at: new Date().toISOString(),
        refined_brief: brief || null,
      })
      .eq("id", row.id)
      .select()
      .single();

    return { job: updated, audit: payload.audit, changes: payload.changes };
  });
