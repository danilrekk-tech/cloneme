import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadEffectiveSettings, secondaryProviders } from "./settings.functions";
import { callChat, parseJsonLoose } from "./ai-chat.server";

const BUCKET = "clone-artifacts";

export type EditEntry = { sel: string; kind: "text" | "img"; value: string };

const patchSchema = z.array(
  z.object({
    sel: z.string().max(400),
    kind: z.enum(["text", "img"]),
    value: z.string().max(2_000_000),
  }),
).max(800);

async function loadJob(supabase: any, userId: string, id: string) {
  const { data: row, error } = await supabase
    .from("clone_jobs")
    .select("id, files_path, source_url")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !row) throw new Error("Задача не найдена");
  return row;
}

/** HTML клона + сохранённые ручные правки. */
export const getCloneEditor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = await loadJob(supabase, userId, data.id);
    if (!row.files_path) throw new Error("Файлы клона ещё не готовы");

    const { data: blob, error } = await supabase.storage.from(BUCKET).download(row.files_path);
    if (error || !blob) throw new Error("Не удалось прочитать файлы клона");
    const files = JSON.parse(await (blob as Blob).text()) as Record<string, any>;
    const key =
      Object.keys(files).find((k) => k === "index.html") ??
      Object.keys(files).find((k) => k.endsWith(".html"));
    if (!key) throw new Error("В клоне нет HTML-страницы");

    const { data: edit } = await (supabase as any)
      .from("clone_edits")
      .select("patch, updated_at")
      .eq("job_id", row.id)
      .eq("user_id", userId)
      .maybeSingle();

    return {
      sourceUrl: row.source_url as string,
      html: String(files[key]?.content ?? ""),
      patch: (edit?.patch ?? []) as EditEntry[],
      updatedAt: edit?.updated_at ?? null,
    };
  });

export const saveCloneEdits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), patch: patchSchema }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await loadJob(supabase, userId, data.id);
    const { error } = await (supabase as any)
      .from("clone_edits")
      .upsert(
        { job_id: data.id, user_id: userId, patch: data.patch, updated_at: new Date().toISOString() },
        { onConflict: "job_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, count: data.patch.length };
  });

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const autofillSchema = z.object({
  id: z.string().uuid(),
  referenceUrl: z.string().url().max(2048).optional().or(z.literal("")),
  sourceText: z.string().max(20_000).optional(),
  instructions: z.string().max(2000).optional(),
  slots: z
    .array(z.object({ sel: z.string().max(400), tag: z.string().max(20), text: z.string().max(600) }))
    .min(1)
    .max(150),
});

/** ИИ-автозаполнение текстов клона по ссылке клиента и/или предоставленному тексту. */
export const autofillCloneContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => autofillSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await loadJob(supabase, userId, data.id);
    const settings = await loadEffectiveSettings(supabase, userId);

    let reference = "";
    if (data.referenceUrl) {
      try {
        const res = await fetch(data.referenceUrl, {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,*/*" },
          redirect: "follow",
        });
        if (res.ok) reference = stripHtml(await res.text()).slice(0, 14_000);
      } catch {
        /* источник недоступен — работаем по тексту */
      }
    }

    const providerCfg = {
      provider: settings.refine_provider,
      lovableKey: process.env.LOVABLE_API_KEY,
      omniBaseUrl: settings.omniroute_base_url,
      omniKey: settings.omniroute_api_key,
      openrouterKey: settings.openrouter_api_key || process.env.OPENROUTER_API_KEY,
      geminiKey: settings.gemini_api_key || process.env.GEMINI_API_KEY,
      geminiModel: settings.gemini_model,
      openrouterModel: settings.openrouter_model,
      fallbacks: secondaryProviders(settings),
    } as const;

    const slotList = data.slots
      .map((s, i) => `${i}|${s.tag}|${s.text.replace(/\s+/g, " ")}`)
      .join("\n");

    const chat = await callChat(providerCfg, {
      model: settings.refine_model,
      fallbackModel: settings.refine_fallback_model,
      temperature: 0.5,
      timeoutMs: 150_000,
      messages: [
        {
          role: "system",
          content:
            "Ты — редактор контента для лендингов. Пишешь только на русском языке, коротко, конкретно и по смыслу блока. " +
            "Сохраняй длину и роль текста (заголовок остаётся заголовком, кнопка — кнопкой из 1-3 слов). " +
            "Если данных о клиенте не хватает — дописывай правдоподобный, но нейтральный текст по смыслу ниши, без выдуманных цен, телефонов и адресов. " +
            "Ответ строго JSON: {\"items\":[{\"i\":<номер>,\"text\":\"новый текст\"}]}. Не включай блоки, которые не нужно менять.",
        },
        {
          role: "user",
          content:
            `ИНФОРМАЦИЯ О КЛИЕНТЕ (с сайта): ${reference || "нет"}\n\n` +
            `ТЕКСТ ОТ КЛИЕНТА: ${data.sourceText || "нет"}\n\n` +
            `ПОЖЕЛАНИЯ: ${data.instructions || "нет"}\n\n` +
            `БЛОКИ СТРАНИЦЫ (номер|тег|текущий текст):\n${slotList}`,
        },
      ],
    });

    const parsed = parseJsonLoose<{ items?: Array<{ i: number; text: string }> }>(chat.text);
    const items = Array.isArray(parsed?.items) ? parsed!.items! : [];
    const entries: EditEntry[] = [];
    for (const it of items) {
      const slot = data.slots[Number(it.i)];
      if (!slot || typeof it.text !== "string" || !it.text.trim()) continue;
      entries.push({ sel: slot.sel, kind: "text", value: it.text.trim() });
    }
    if (entries.length === 0) throw new Error("ИИ не вернул изменений — уточните текст или ссылку");
    return { entries, model: chat.model, notes: chat.notes ?? [] };
  });
