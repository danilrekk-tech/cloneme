/**
 * Единая точка вызова чат-моделей для AI-доработки.
 *
 * Решает три проблемы:
 *  1. Часть моделей (GPT-5 и др.) не принимает temperature → параметр не отправляется,
 *     а при ошибке 400 про temperature запрос автоматически повторяется без него.
 *  2. Если у Lovable AI кончились кредиты (402) или сработал лимит (429/5xx) —
 *     запрос повторяется на резервной модели, а затем на цепочке бесплатных моделей.
 *  3. Можно использовать сторонний OpenAI-совместимый провайдер (Omniroute,
 *     локально развёрнутый или облачный) — по base URL и ключу пользователя.
 */

import { modelSupportsTemperature, FALLBACK_CHAIN } from "./ai-models";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type SecondaryProvider = {
  /** Человеческое название для сообщений в UI. */
  label: string;
  baseUrl: string;
  key?: string | null;
  model?: string | null;
};

export type ChatProviderConfig = {
  provider: "lovable" | "omniroute";
  lovableKey?: string;
  omniBaseUrl?: string | null;
  omniKey?: string | null;
  /** Провайдеры, на которые переключаемся, когда основной недоступен (например, кончились токены Lovable). */
  fallbacks?: SecondaryProvider[];
};


export type ChatOptions = {
  model: string;
  fallbackModel?: string | null;
  temperature?: number;
  messages: ChatMessage[];
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
};

export type ChatResult = {
  text: string;
  model: string;
  /** true, если пришлось переключиться на резервную модель/провайдера. */
  usedFallback: boolean;
  notes: string[];
};

const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function normalizeBase(base: string): string {
  const b = base.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(b)) return b;
  if (/\/v\d+$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

function endpointFor(cfg: ChatProviderConfig): { url: string; headers: Record<string, string> } {
  if (cfg.provider === "omniroute") {
    if (!cfg.omniBaseUrl) {
      throw new Error(
        "Не указан endpoint стороннего провайдера. Добавьте его в Настройках → Провайдер ИИ.",
      );
    }
    return {
      url: normalizeBase(cfg.omniBaseUrl),
      headers: {
        "Content-Type": "application/json",
        ...(cfg.omniKey ? { Authorization: `Bearer ${cfg.omniKey}` } : {}),
      },
    };
  }
  if (!cfg.lovableKey) throw new Error("LOVABLE_API_KEY не настроен");
  return {
    url: LOVABLE_URL,
    headers: { Authorization: `Bearer ${cfg.lovableKey}`, "Content-Type": "application/json" },
  };
}

type Endpoint = { url: string; headers: Record<string, string> };

function endpointForSecondary(p: SecondaryProvider): Endpoint {
  return {
    url: normalizeBase(p.baseUrl),
    headers: {
      "Content-Type": "application/json",
      ...(p.key ? { Authorization: `Bearer ${p.key}` } : {}),
    },
  };
}

async function rawCall(
  endpoint: Endpoint,
  model: string,
  opts: ChatOptions,
  withTemperature: boolean,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const { url, headers } = endpoint;

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
  };
  if (withTemperature && typeof opts.temperature === "number") {
    body.temperature = opts.temperature;
  }
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (/^openai\/gpt-5\.6/.test(model)) body.reasoning_effort = "none";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 165_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, body: text.slice(0, 600) };
    }
    const json: any = await res.json();
    const text: string =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.text ??
      "";
    return { ok: true, text };
  } finally {
    clearTimeout(timer);
  }
}

function isTemperatureError(body: string): boolean {
  return /temperature/i.test(body) && /(unsupported|does not support|not supported|invalid)/i.test(body);
}

function isRetryableStatus(status: number): boolean {
  return status === 402 || status === 429 || status >= 500;
}

/** Вызов модели с авто-фиксом temperature и цепочкой резервных моделей. */
export async function callChat(cfg: ChatProviderConfig, opts: ChatOptions): Promise<ChatResult> {
  const notes: string[] = [];
  const candidates: string[] = [];
  const push = (m?: string | null) => {
    if (m && !candidates.includes(m)) candidates.push(m);
  };
  push(opts.model);
  push(opts.fallbackModel);
  // Резервные бесплатные/дешёвые модели — только для Lovable AI.
  if (cfg.provider === "lovable") FALLBACK_CHAIN.forEach(push);

  let lastError = "";

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    // Для незнакомых Omniroute-моделей temperature отправляем, для GPT-5 — нет.
    let withTemp = modelSupportsTemperature(model) && typeof opts.temperature === "number";

    for (let attempt = 0; attempt < 2; attempt++) {
      let out;
      try {
        out = await rawCall(cfg, model, opts, withTemp);
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        lastError = String(e?.message ?? e).slice(0, 300);
        break;
      }
      if (out.ok) {
        if (!out.text.trim()) {
          lastError = "Модель вернула пустой ответ";
          break;
        }
        return { text: out.text, model, usedFallback: i > 0, notes };
      }
      lastError = `${out.status}: ${out.body}`;

      if (withTemp && out.status === 400 && isTemperatureError(out.body)) {
        notes.push(`Модель ${model} не поддерживает temperature — повторяем без неё.`);
        withTemp = false;
        continue; // повтор без temperature
      }
      if (isRetryableStatus(out.status) && i < candidates.length - 1) {
        notes.push(
          out.status === 402
            ? `У модели ${model} закончились кредиты — переключаемся на резервную.`
            : `Модель ${model} недоступна (${out.status}) — переключаемся на резервную.`,
        );
      }
      break; // пробуем следующую модель
    }
  }

  throw new Error(`AI ${lastError || "не ответил"}`);
}

/** Достаёт JSON-объект из ответа модели (устойчиво к markdown-ограждениям). */
export function parseJsonLoose<T = any>(raw: string): T | null {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* continue */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      /* continue */
    }
  }
  return null;
}
