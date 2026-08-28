import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveMcpContext, callMcpTool, loadServersWithTools } from "./mcp.functions";
import { loadEffectiveSettings, secondaryProviders } from "./settings.functions";
import { callChat, parseJsonLoose } from "./ai-chat.server";


const DITTO_BASE = "https://api.ditto.site/v1";
const BUCKET = "clone-artifacts";
const DEFAULT_REFINE_MODEL = "google/gemini-2.5-pro";


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
    const base64 = bytesToBase64(buf);
    const host = safeHost(row.source_url);
    return {
      filename: `${host}-${row.ditto_job_id ?? row.id}.zip`,
      contentType: "application/zip",
      base64,
    };
  });

function bytesToBase64(buf: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname.replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    return "clone";
  }
}

// Returns files + active refinement (with previewHtml + tool_calls) + refinements history.
export const getCloneFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("clone_jobs")
      .select("id, files_path, source_url, active_refinement_id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Задача не найдена");
    if (!row.files_path) throw new Error("Файлы клона ещё не готовы");

    const files = await downloadFilesJson(supabase, row.files_path);

    const { data: refinements } = await (supabase as any)
      .from("clone_refinements")
      .select(
        "id, version, brief, audit, changes, preview_path, status, error, model, created_at, tool_calls, selected_tools, settings",
      )
      .eq("job_id", row.id)
      .eq("user_id", userId)
      .order("version", { ascending: false });

    const list = (refinements ?? []) as any[];
    const activeMeta =
      list.find((r) => r.id === row.active_refinement_id) ||
      list.find((r) => r.status === "ready");

    let active: any = null;
    if (activeMeta?.preview_path) {
      try {
        const { data: blob } = await supabase.storage.from(BUCKET).download(activeMeta.preview_path);
        if (blob) {
          const previewHtml = await (blob as Blob).text();
          active = {
            id: activeMeta.id,
            version: activeMeta.version,
            brief: activeMeta.brief,
            audit: activeMeta.audit,
            changes: activeMeta.changes,
            previewHtml,
            toolCalls: activeMeta.tool_calls ?? [],
            selectedTools: activeMeta.selected_tools ?? [],
            model: activeMeta.model,
          };
        }
      } catch {
        /* ignore */
      }
    }

    return {
      sourceUrl: row.source_url,
      files,
      active,
      refinements: list.map((r) => ({
        id: r.id,
        version: r.version,
        status: r.status,
        error: r.error,
        brief: r.brief,
        model: r.model,
        created_at: r.created_at,
        toolCallsCount: Array.isArray(r.tool_calls) ? r.tool_calls.length : 0,
        isActive: r.id === (activeMeta?.id ?? null),
      })),
    };
  });

const refineSchema = z.object({
  id: z.string().uuid(),
  brief: z.string().max(4000).optional(),
  model: z.string().min(1).max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  research: z.boolean().optional(),
  conceptId: z.string().uuid().optional(),

  selectedTools: z
    .array(
      z.object({
        serverId: z.string().uuid(),
        toolName: z.string().min(1).max(200),
        args: z.record(z.any()).optional(),
      }),
    )
    .max(20)
    .optional(),
});

// Kick off a refinement. Optionally runs pre-selected MCP tools first and injects
// their results into the model context.
export const refineClone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => refineSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lovableKey = process.env.LOVABLE_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    const settings = await loadEffectiveSettings(supabase, userId);
    const model = data.model?.trim() || settings.refine_model || DEFAULT_REFINE_MODEL;
    const temperature =
      typeof data.temperature === "number" ? data.temperature : settings.refine_temperature;
    const doResearch =
      typeof data.research === "boolean" ? data.research : settings.refine_research;
    const budget = Math.max(20_000, Math.min(150_000, settings.refine_budget));


    const { data: row, error } = await supabase
      .from("clone_jobs")
      .select("id, files_path, source_url")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Задача не найдена");
    if (!row.files_path) throw new Error("Клон ещё не готов");

    const { data: last } = await (supabase as any)
      .from("clone_refinements")
      .select("version")
      .eq("job_id", row.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = ((last?.version as number | undefined) ?? 0) + 1;
    const brief = (data.brief ?? "").trim();
    const selectedTools = data.selectedTools ?? [];

    let concept: any = null;
    if (data.conceptId) {
      const { data: c } = await (supabase as any)
        .from("clone_concepts")
        .select("id, title, summary, spec")
        .eq("id", data.conceptId)
        .eq("user_id", userId)
        .eq("job_id", row.id)
        .maybeSingle();
      concept = c ?? null;
    }

    const { data: refRow, error: refErr } = await (supabase as any)
      .from("clone_refinements")
      .insert({
        job_id: row.id,
        user_id: userId,
        version: nextVersion,
        brief: brief || null,
        status: "processing",
        model,
        concept_id: concept?.id ?? null,
        selected_tools: selectedTools,
        settings: { model, temperature, budget },
      })
      .select()
      .single();
    if (refErr || !refRow) throw new Error(refErr?.message ?? "Не удалось создать версию");

    await supabase
      .from("clone_jobs")
      .update({ refined_status: "processing", refined_error: null, refined_brief: brief || null })
      .eq("id", row.id);

    try {
      const files = await downloadFilesJson(supabase, row.files_path);
      const mcp = await getActiveMcpContext(supabase, userId);

      // --------- Execute selected MCP tools (best-effort, parallel) ---------
      const toolCalls: Array<{
        serverId: string;
        serverName: string;
        toolName: string;
        args: any;
        startedAt: string;
        durationMs: number;
        ok: boolean;
        result?: any;
        error?: string;
      }> = [];

      if (selectedTools.length > 0) {
        const servers = await loadServersWithTools(supabase, userId);
        const byId = new Map(servers.map((s) => [s.id, s]));
        await Promise.all(
          selectedTools.slice(0, 10).map(async (t) => {
            const srv = byId.get(t.serverId);
            const started = Date.now();
            if (!srv) {
              toolCalls.push({
                serverId: t.serverId,
                serverName: "(неизвестный сервер)",
                toolName: t.toolName,
                args: t.args ?? {},
                startedAt: new Date(started).toISOString(),
                durationMs: 0,
                ok: false,
                error: "Сервер не найден",
              });
              return;
            }
            const args = t.args && Object.keys(t.args).length > 0
              ? t.args
              : { url: row.source_url, brief: brief || undefined };
            try {
              const res = await callMcpTool(srv.url, srv.auth_token, t.toolName, args, 25_000);
              toolCalls.push({
                serverId: srv.id,
                serverName: srv.name,
                toolName: t.toolName,
                args,
                startedAt: new Date(started).toISOString(),
                durationMs: Date.now() - started,
                ok: true,
                result: truncateForStore(res),
              });
            } catch (e: any) {
              toolCalls.push({
                serverId: srv.id,
                serverName: srv.name,
                toolName: t.toolName,
                args,
                startedAt: new Date(started).toISOString(),
                durationMs: Date.now() - started,
                ok: false,
                error: String(e?.message ?? e).slice(0, 400),
              });
            }
          }),
        );

        // Persist intermediate progress so UI can show tool calls before AI finishes.
        await (supabase as any)
          .from("clone_refinements")
          .update({ tool_calls: toolCalls })
          .eq("id", refRow.id);
      }

      // --------- Build prompt ---------
      const textEntries = Object.entries(files).filter(
        ([, v]) => typeof v?.content === "string" && (v.type ?? "text") === "text",
      );
      const priority = (p: string) => {
        if (/page\.tsx?$|index\.html?$|layout\.tsx?$/.test(p)) return 0;
        if (/hero|header|footer|nav/i.test(p)) return 1;
        if (/\.tsx?$/.test(p)) return 2;
        if (/\.(css|scss)$/.test(p)) return 3;
        if (/content\.ts$|data\.ts$/.test(p)) return 4;
        return 5;
      };
      textEntries.sort((a, b) => priority(a[0]) - priority(b[0]));

      const excerpts: string[] = [];
      let remaining = budget;
      for (const [path, v] of textEntries) {
        const content = (v.content ?? "").slice(0, 9_000);
        const block = `\n===== ${path} =====\n${content}\n`;
        if (block.length > remaining) continue;
        excerpts.push(block);
        remaining -= block.length;
      }

      const fileList = Object.keys(files).slice(0, 160).join("\n");
      const imageUrls = collectImageUrls(files, row.source_url).slice(0, 24);
      const imageBlock =
        imageUrls.length > 0
          ? `\nРеальные изображения из клона (используй их в вёрстке, абсолютные URL):\n${imageUrls.join("\n")}\n`
          : "";

      const toolResultsBlock =
        toolCalls.length > 0
          ? `\n\nРезультаты предзапущенных MCP-инструментов (используй их при аудите/переработке):\n${toolCalls
              .map(
                (c, i) =>
                  `#${i + 1} ${c.serverName} · ${c.toolName} · ${
                    c.ok ? `OK (${c.durationMs} ms)` : `FAIL: ${c.error ?? "?"}`
                  }\nargs=${JSON.stringify(c.args).slice(0, 500)}\n${
                    c.ok ? `result=${safeStringify(c.result).slice(0, 2000)}` : ""
                  }`,
              )
              .join("\n\n")}\n`
          : "";

      const providerCfg = {
        provider: settings.refine_provider,
        lovableKey,
        omniBaseUrl: settings.omniroute_base_url,
        omniKey: settings.omniroute_api_key,
        openrouterKey: settings.openrouter_api_key || openrouterKey,
        openrouterModel: settings.openrouter_model,
        fallbacks: secondaryProviders(settings),
      } as const;

      const conceptBlock = concept
        ? `\nВЫБРАННЫЙ ВИЗУАЛЬНЫЙ КОНЦЕПТ (воссоздай его один-в-один как интерактивную страницу):
Название: ${concept.title}
Суть: ${concept.summary}
Спецификация: ${safeStringify(concept.spec).slice(0, 3000)}\n`
        : "";

      // --------- Pass 1: исследование конкурентов + макет ---------
      let blueprint = "";
      if (doResearch) {
        try {
          const researchModel =
            settings.refine_provider === "lovable" ? "google/gemini-3.6-flash" : model;
          const res = await callChat(providerCfg, {
            model: researchModel,
            fallbackModel: settings.refine_fallback_model,
            temperature: 0.4,
            json: true,
            timeoutMs: 70_000,
            messages: [
              {
                role: "system",
                content: `Ты — продуктовый стратег и арт-директор. Проанализируй сайт и его нишу.
Верни СТРОГО JSON без markdown:
{
  "niche": "ниша и целевая аудитория, 1-2 предложения",
  "competitors": ["3-5 реальных ближайших конкурентов с коротким описанием их сильного приёма"],
  "gaps": ["3-5 слабых мест исходной страницы относительно конкурентов"],
  "positioning": "как позиционировать страницу, чтобы обойти конкурентов",
  "blueprint": ["последовательность секций будущей страницы: название секции — что в ней и зачем, 6-9 пунктов"],
  "artDirection": "палитра (конкретные hex), шрифтовая пара, тип композиции, характер анимаций"
}`,
              },
              {
                role: "user",
                content: `URL: ${row.source_url}
Задача пользователя: ${brief || "(не указана)"}
Файлы клона (пути):
${fileList.slice(0, 4000)}

Фрагменты исходников:
${excerpts.join("\n").slice(0, 30_000)}`,
              },
            ],
          });
          const parsedResearch = parseJsonLoose<any>(res.text);
          if (parsedResearch) {
            blueprint = `\nИССЛЕДОВАНИЕ РЫНКА И МАКЕТ (обязателен к исполнению):
Ниша: ${parsedResearch.niche ?? "-"}
Конкуренты: ${(parsedResearch.competitors ?? []).join(" | ")}
Слабые места оригинала: ${(parsedResearch.gaps ?? []).join(" | ")}
Позиционирование: ${parsedResearch.positioning ?? "-"}
Структура секций: ${(parsedResearch.blueprint ?? []).join(" → ")}
Арт-дирекшн: ${parsedResearch.artDirection ?? "-"}\n`;
          }
        } catch {
          // исследование необязательно — продолжаем без него
        }
      }

      const systemPrompt = `Ты — старший продуктовый дизайнер и фронтенд-инженер, работающий по ритуалу /skill:redesign и /skill:design-taste-frontend-v1.
Твоя задача — не схематичный вайрфрейм, а ПОЛНОЦЕННЫЙ ПРОДАКШН-САЙТ: реальные тексты, реальные изображения, анимации, состояния, адаптив.

Вкус:
• Анти-slop. Никаких дефолтных фиолетовых/индиго градиентов на белом, никакого Inter в display, никаких centered hero + 3 симметричных карточек, никаких «Elevate/Seamless/Unleash», никаких Jane Doe и 99.99%.
• Типографика: display — Space Grotesk / Sora / Syne / Instrument Serif, tracking-tight, leading-none у крупных заголовков. Body — DM Sans / Manrope, max-w-[65ch].
• Палитра: максимум один акцент, насыщенность <80%, off-black вместо #000, тонированные тени.
• Композиция: асимметрия — split-screen, offset grid, bento. Разная композиция в каждой секции.
• Материал: rounded-[1.5rem]+, тонкий border, мягкая диффузная тень.

Обязательные технические требования к previewHtml:
1. <!doctype html>, <html lang>, <head> с <meta viewport>, осмысленным <title>, meta description, Google Fonts <link> и Tailwind CDN (https://cdn.tailwindcss.com) + инлайн tailwind.config с кастомными шрифтами/цветами.
2. Реальные ИЗОБРАЖЕНИЯ: используй абсолютные URL ассетов клона (список дан ниже). Если их не хватает — тематические фото с images.unsplash.com (формат https://images.unsplash.com/photo-…?auto=format&fit=crop&w=1400&q=80) и inline SVG-паттерны. Никаких серых прямоугольников-заглушек и placeholder.com.
3. АНИМАЦИИ: @keyframes + scroll-reveal через IntersectionObserver (класс .reveal → .is-visible), staggered задержки, hover translate-y[-2px], active scale-[0.98], плавный parallax или градиентный сдвиг в hero, marquee логотипов. Обязателен блок @media (prefers-reduced-motion: reduce) — отключение анимаций.
4. СТРУКТУРА: sticky/floating nav с рабочим mobile-меню (vanilla JS), hero на min-h-[92dvh], минимум 6 содержательных секций разной композиции (например: доказательства/логотипы, ценность, продукт/фичи в bento, процесс, цифры, кейсы/отзывы, FAQ-аккордеон, финальный CTA), развёрнутый футер с колонками.
5. Реальный контент из клона: сохраняй бренд, названия, цифры и смысл, но переписывай формулировки сильнее. Никаких «Lorem ipsum» и абстрактных заглушек.
6. Интерактив на vanilla JS: mobile-меню, аккордеон FAQ, табы или счётчики — работающие, без ошибок в консоли.
7. Полностью самодостаточный один файл, mobile-first, доступность: alt-тексты, aria-label, видимый focus-ring, контраст ≥ 4.5:1.

Объём: это большая страница. Не сокращай разметку ради краткости — выдавай HTML целиком.

Формат ответа: СТРОГО валидный JSON, БЕЗ markdown-ограждений и комментариев:
{
  "audit": "5-8 буллетов: что было слабо и почему",
  "changes": "5-8 буллетов: что изменено и как это улучшает продукт",
  "previewHtml": "<!doctype html>…полный самодостаточный документ…"
}`;

      const userPrompt = `Исходный URL клона: ${row.source_url}
Задача пользователя: ${brief || "(не указана — проведи собственный аудит и предложи глубокую переработку)"}
Всего файлов в клоне: ${Object.keys(files).length}
${conceptBlock}${blueprint}${mcp.summary ? `\n${mcp.summary}\n` : ""}${toolResultsBlock}${imageBlock}
Пути (обрезано):
${fileList}

Ключевые исходники клона:
${excerpts.join("\n")}

Сделай detailed refinement по /skill:redesign + /skill:design-taste-frontend-v1: полноценный сайт с изображениями, анимациями и рабочим интерактивом, объективно сильнее оригинала.`;

      const chat = await callChat(providerCfg, {
        model,
        fallbackModel: settings.refine_fallback_model,
        temperature,
        json: true,
        timeoutMs: 175_000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const parsed = parseJsonLoose<{
        audit?: string;
        changes?: string;
        previewHtml?: string;
      }>(chat.text) ?? {};

      if (!parsed?.previewHtml || parsed.previewHtml.length < 200) {
        throw new Error("AI не вернул валидный HTML-препросмотр");
      }
      const usedModel = chat.model;
      const modelNotes = chat.notes;


      const previewPath = `${userId}/${row.id}/refined/v${nextVersion}.html`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(previewPath, new Blob([parsed.previewHtml], { type: "text/html" }), {
          upsert: true,
          contentType: "text/html",
        });
      if (upErr) throw new Error(`Не удалось сохранить HTML: ${upErr.message}`);

      await (supabase as any)
        .from("clone_refinements")
        .update({
          audit: parsed.audit ?? "",
          changes: [parsed.changes ?? "", ...(modelNotes.length ? [`\n\nПримечания движка: ${modelNotes.join(" ")}`] : [])].join(""),
          preview_path: previewPath,
          status: "ready",
          error: null,
          model: usedModel,
          tool_calls: toolCalls,
          settings: { model: usedModel, requestedModel: model, temperature, budget, research: doResearch },
        })
        .eq("id", refRow.id);

      await supabase
        .from("clone_jobs")
        .update({
          active_refinement_id: refRow.id,
          refined_status: "ready",
          refined_error: null,
          refined_at: new Date().toISOString(),
          refined_path: previewPath,
        })
        .eq("id", row.id);

      return { versionId: refRow.id, version: nextVersion, toolCalls, model: usedModel, notes: modelNotes };

    } catch (e: any) {
      const msg =
        e?.name === "AbortError"
          ? "Таймаут генерации (>165с). Попробуйте сузить бриф или переключить модель в настройках."
          : String(e?.message ?? e).slice(0, 500);
      await (supabase as any)
        .from("clone_refinements")
        .update({ status: "failed", error: msg })
        .eq("id", refRow.id);
      await supabase
        .from("clone_jobs")
        .update({ refined_status: "failed", refined_error: msg })
        .eq("id", row.id);
      throw new Error(msg);
    }
  });

function truncateForStore(res: any): any {
  try {
    const s = JSON.stringify(res);
    if (s.length <= 20_000) return res;
    return { truncated: true, preview: s.slice(0, 20_000) };
  } catch {
    return { unserializable: true };
  }
}

function safeStringify(v: any): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Собирает абсолютные URL изображений из клона, чтобы AI-версия была с настоящими картинками. */
function collectImageUrls(files: Record<string, any>, sourceUrl: string): string[] {
  const out = new Set<string>();
  let origin = "";
  try {
    origin = new URL(sourceUrl).origin;
  } catch {
    /* ignore */
  }
  const abs = (u: string) => {
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return `https:${u}`;
    if (u.startsWith("/") && origin) return `${origin}${u}`;
    return null;
  };
  const IMG = /\.(png|jpe?g|webp|avif|svg|gif)(\?[^"')\s]*)?$/i;

  for (const [path, v] of Object.entries(files)) {
    if (IMG.test(path)) {
      const a = abs(path.startsWith("/") ? path : `/${path}`);
      if (a) out.add(a);
    }
    const content = typeof v?.content === "string" ? v.content : "";
    if (!content) continue;
    const matches = content.match(/["'(]([^"'()\s]+\.(?:png|jpe?g|webp|avif|svg|gif)(?:\?[^"'()\s]*)?)["')]/gi);
    if (!matches) continue;
    for (const m of matches) {
      const raw = m.slice(1, -1);
      const a = abs(raw);
      if (a && !/data:|sprite|favicon|1x1|pixel/i.test(a)) out.add(a);
      if (out.size > 60) break;
    }
    if (out.size > 60) break;
  }
  return [...out];
}



// Set which refinement version is "active" (rollback).
export const activateRefinement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ jobId: z.string().uuid(), refinementId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: r } = await (supabase as any)
      .from("clone_refinements")
      .select("id, preview_path, status")
      .eq("id", data.refinementId)
      .eq("user_id", userId)
      .eq("job_id", data.jobId)
      .maybeSingle();
    if (!r) throw new Error("Версия не найдена");
    if (r.status !== "ready" || !r.preview_path) throw new Error("Версия ещё не готова");
    await supabase
      .from("clone_jobs")
      .update({
        active_refinement_id: r.id,
        refined_status: "ready",
        refined_path: r.preview_path,
        refined_error: null,
      })
      .eq("id", data.jobId)
      .eq("user_id", userId);
    return { ok: true };
  });

// Delete a single refinement version (and its file).
export const deleteRefinement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ refinementId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: r } = await (supabase as any)
      .from("clone_refinements")
      .select("id, job_id, preview_path")
      .eq("id", data.refinementId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!r) throw new Error("Версия не найдена");
    if (r.preview_path) {
      await supabase.storage.from(BUCKET).remove([r.preview_path]);
    }
    await (supabase as any).from("clone_refinements").delete().eq("id", r.id);

    // If this was active, pick the latest ready one as new active (or clear).
    const { data: job } = await supabase
      .from("clone_jobs")
      .select("active_refinement_id")
      .eq("id", r.job_id)
      .single();
    if (job?.active_refinement_id === r.id) {
      const { data: fallback } = await (supabase as any)
        .from("clone_refinements")
        .select("id, preview_path")
        .eq("job_id", r.job_id)
        .eq("status", "ready")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      await supabase
        .from("clone_jobs")
        .update({
          active_refinement_id: fallback?.id ?? null,
          refined_path: fallback?.preview_path ?? null,
          refined_status: fallback ? "ready" : null,
        })
        .eq("id", r.job_id);
    }
    return { ok: true };
  });

// Delete a clone job and all its storage/refinements.
export const deleteCloneJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("clone_jobs")
      .select("id, files_path")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (!row) throw new Error("Задача не найдена");

    // List and remove all storage files under user/job/ prefix
    const prefix = `${userId}/${row.id}`;
    try {
      const collected: string[] = [];
      async function walk(dir: string) {
        const { data: list } = await supabase.storage.from(BUCKET).list(dir, { limit: 1000 });
        for (const it of list ?? []) {
          const full = `${dir}/${it.name}`;
          if ((it as any).id) collected.push(full);
          else await walk(full);
        }
      }
      await walk(prefix);
      if (collected.length) await supabase.storage.from(BUCKET).remove(collected);
    } catch {
      /* best-effort cleanup */
    }

    await supabase.from("clone_jobs").delete().eq("id", row.id).eq("user_id", userId);
    return { ok: true };
  });

// Build a ZIP that contains the full clone + the active refined preview.html.
export const downloadRefinedBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), refinementId: z.string().uuid().optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const key = requireDittoKey();
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("clone_jobs")
      .select("id, source_url, files_path, active_refinement_id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Задача не найдена");
    if (!row.files_path) throw new Error("Файлы клона не готовы");

    const targetId = data.refinementId ?? row.active_refinement_id;
    if (!targetId) throw new Error("Нет доступной AI-версии");
    const { data: ref } = await (supabase as any)
      .from("clone_refinements")
      .select("id, version, preview_path, audit, changes, brief")
      .eq("id", targetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ref?.preview_path) throw new Error("AI-версия не готова");

    const { data: htmlBlob } = await supabase.storage.from(BUCKET).download(ref.preview_path);
    if (!htmlBlob) throw new Error("HTML не найден в хранилище");
    const previewHtml = await (htmlBlob as Blob).text();

    const files = await downloadFilesJson(supabase, row.files_path);

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    zip.file("refined/preview.html", previewHtml);
    zip.file(
      "refined/README.md",
      `# Refined preview v${ref.version}\n\nSource: ${row.source_url}\n\n## Brief\n${ref.brief ?? "(none)"}\n\n## Audit\n${ref.audit ?? ""}\n\n## Changes\n${ref.changes ?? ""}\n`,
    );

    const src = zip.folder("source")!;
    for (const [path, entry] of Object.entries(files)) {
      if (entry?.type === "binary" || entry?.url) {
        try {
          const br = await fetch(entry.url!, { headers: { Authorization: `Bearer ${key}` } });
          if (br.ok) {
            const buf = new Uint8Array(await br.arrayBuffer());
            src.file(path, buf);
          }
        } catch {
          /* skip */
        }
      } else if (typeof entry?.content === "string") {
        src.file(path, entry.content);
      }
    }

    const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const base64 = bytesToBase64(buf);
    const host = safeHost(row.source_url);
    return {
      filename: `${host}-refined-v${ref.version}.zip`,
      contentType: "application/zip",
      base64,
    };
  });
