/**
 * Генерация трёх визуальных концептов (варианты дизайна) для клона.
 * Сначала чат-модель придумывает 3 разные стратегии, затем image-модель
 * рисует превью каждого варианта. Результаты кладём в Storage + БД.
 */

import { callChat, parseJsonLoose, generateImage } from "./ai-chat.server";
import { loadEffectiveSettings, secondaryProviders } from "./settings.functions";

const BUCKET = "clone-artifacts";

export type ConceptSpec = {
  title: string;
  summary: string;
  spec: Record<string, unknown>;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readFilesJson(supabase: any, path: string): Promise<Record<string, any>> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Файлы клона недоступны");
  return JSON.parse(await (data as Blob).text());
}

function excerptFiles(files: Record<string, any>, budget = 25_000): string {
  const entries = Object.entries(files).filter(([, v]) => typeof v?.content === "string");
  const priority = (p: string) =>
    /page\.tsx?$|index\.html?$|layout\.tsx?$/.test(p) ? 0 : /\.tsx?$/.test(p) ? 1 : 2;
  entries.sort((a, b) => priority(a[0]) - priority(b[0]));
  let left = budget;
  const out: string[] = [];
  for (const [p, v] of entries) {
    const block = `\n===== ${p} =====\n${String(v.content).slice(0, 6000)}\n`;
    if (block.length > left) continue;
    out.push(block);
    left -= block.length;
  }
  return out.join("");
}

export async function runConceptGeneration(
  supabase: any,
  userId: string,
  jobId: string,
  brief: string,
) {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY не настроен");

  const { data: job } = await supabase
    .from("clone_jobs")
    .select("id, source_url, files_path")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!job) throw new Error("Задача не найдена");
  if (!job.files_path) throw new Error("Клон ещё не готов");

  const settings = await loadEffectiveSettings(supabase, userId);
  const cfg = {
    provider: settings.refine_provider,
    lovableKey,
    omniBaseUrl: settings.omniroute_base_url,
    omniKey: settings.omniroute_api_key,
    fallbacks: secondaryProviders(settings),
  } as const;

  const files = await readFilesJson(supabase, job.files_path);
  const excerpts = excerptFiles(files);

  const chat = await callChat(cfg, {
    model: settings.refine_model,
    fallbackModel: settings.refine_fallback_model,
    temperature: 0.8,
    json: true,
    timeoutMs: 120_000,
    messages: [
      {
        role: "system",
        content: `Ты — арт-директор. Предложи ТРИ принципиально разных направления редизайна сайта.
Каждое — со своим характером (например: строгое издательское, тёплое органическое, техно-минимализм).
Верни СТРОГО JSON без markdown:
{"concepts":[{"title":"название направления","summary":"1-2 предложения о сути","palette":["#hex","#hex","#hex"],"typography":"display + body шрифты","layout":"тип композиции и структура секций","motion":"характер анимаций","imagePrompt":"детальный английский промпт для генерации скриншота лендинга в этом стиле, включая структуру hero, палитру, шрифты, тип изображений"}]}
Ровно 3 элемента.`,
      },
      {
        role: "user",
        content: `URL: ${job.source_url}
Пожелания пользователя: ${brief || "(нет)"}
Фрагменты исходного сайта:
${excerpts}`,
      },
    ],
  });

  const parsed = parseJsonLoose<{ concepts?: any[] }>(chat.text);
  const concepts = (parsed?.concepts ?? []).slice(0, 3);
  if (concepts.length === 0) throw new Error("Модель не вернула варианты");

  const batchId = crypto.randomUUID();
  const rows: any[] = [];

  await Promise.all(
    concepts.map(async (c, idx) => {
      const title = String(c.title ?? `Вариант ${idx + 1}`).slice(0, 120);
      const summary = String(c.summary ?? "").slice(0, 800);
      const spec = {
        palette: c.palette ?? [],
        typography: c.typography ?? "",
        layout: c.layout ?? "",
        motion: c.motion ?? "",
        imagePrompt: c.imagePrompt ?? "",
      };
      let imagePath: string | null = null;
      let error: string | null = null;
      let model: string | null = null;
      try {
        const img = await generateImage(cfg, {
          prompt: `Ultra-realistic full-page desktop website screenshot mockup, 16:10, of a premium landing page redesign.
Style direction: ${title}. ${summary}
Palette: ${(spec.palette as string[]).join(", ")}. Typography: ${spec.typography}. Layout: ${spec.layout}. Motion feel: ${spec.motion}.
${spec.imagePrompt}
Crisp UI, real photography inside the layout, no lorem ipsum blur, no device frame, no watermark.`,
          model: settings.concept_model,
          timeoutMs: 150_000,
        });
        const path = `${userId}/${jobId}/concepts/${batchId}/${idx}.png`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, base64ToBytes(img.base64), { upsert: true, contentType: img.mime });
        if (upErr) throw new Error(upErr.message);
        imagePath = path;
        model = img.model;
      } catch (e: any) {
        error = String(e?.message ?? e).slice(0, 400);
      }
      rows.push({
        job_id: jobId,
        user_id: userId,
        batch_id: batchId,
        idx,
        title,
        summary,
        spec,
        image_path: imagePath,
        model,
        status: imagePath ? "ready" : "failed",
        error,
        brief: brief || null,
      });
    }),
  );

  rows.sort((a, b) => a.idx - b.idx);
  const { error: insErr } = await supabase.from("clone_concepts").insert(rows);
  if (insErr) throw new Error(insErr.message);

  return { batchId, count: rows.length };
}

export async function listConceptsFor(supabase: any, userId: string, jobId: string) {
  const { data } = await supabase
    .from("clone_concepts")
    .select("id, batch_id, idx, title, summary, spec, image_path, status, error, created_at")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("idx", { ascending: true })
    .limit(30);

  const list = (data ?? []) as any[];
  const out = [] as any[];
  for (const c of list) {
    let imageUrl: string | null = null;
    if (c.image_path) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(c.image_path, 3600);
      imageUrl = signed?.signedUrl ?? null;
    }
    out.push({ ...c, imageUrl });
  }
  return out;
}
