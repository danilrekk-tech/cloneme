/**
 * Каталог моделей для AI-доработки.
 * Клиентски-безопасный модуль — используется и в UI, и на сервере.
 *
 * Важно: часть моделей (семейство OpenAI GPT-5) не принимает параметр temperature
 * (поддерживается только значение по умолчанию). Поэтому в каталоге есть флаг
 * supportsTemperature — сервер не отправляет temperature для таких моделей.
 */

export type AiModelInfo = {
  id: string;
  label: string;
  vendor: "google" | "openai";
  hint: string;
  /** Принимает ли модель параметр temperature. */
  supportsTemperature: boolean;
  /** Ориентировочная скорость. */
  speed: "fast" | "balanced" | "slow";
  /** В чём модель сильнее всего. */
  strengths: string[];
};

export const AI_MODELS: AiModelInfo[] = [
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    vendor: "google",
    hint: "макс. качество вёрстки · ~90–150 с",
    supportsTemperature: true,
    speed: "slow",
    strengths: ["дизайн", "длинный HTML", "большой контекст"],
  },
  {
    id: "google/gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    vendor: "google",
    hint: "новое поколение · быстро и качественно",
    supportsTemperature: true,
    speed: "balanced",
    strengths: ["дизайн", "скорость", "код"],
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    vendor: "google",
    hint: "быстрый и аккуратный",
    supportsTemperature: true,
    speed: "fast",
    strengths: ["скорость", "код"],
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    vendor: "google",
    hint: "быстрый · ~30–60 с",
    supportsTemperature: true,
    speed: "fast",
    strengths: ["скорость", "экономия"],
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    vendor: "google",
    hint: "самый экономичный",
    supportsTemperature: true,
    speed: "fast",
    strengths: ["экономия", "анализ текста"],
  },
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    vendor: "google",
    hint: "экономичный",
    supportsTemperature: true,
    speed: "fast",
    strengths: ["экономия"],
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    vendor: "openai",
    hint: "сильные рассуждения · temperature не поддерживается",
    supportsTemperature: false,
    speed: "slow",
    strengths: ["стратегия", "аудит", "тексты"],
  },
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    vendor: "openai",
    hint: "быстрый OpenAI · temperature не поддерживается",
    supportsTemperature: false,
    speed: "balanced",
    strengths: ["скорость", "тексты"],
  },
  {
    id: "openai/gpt-5",
    label: "GPT-5",
    vendor: "openai",
    hint: "рассуждающий · temperature не поддерживается",
    supportsTemperature: false,
    speed: "slow",
    strengths: ["стратегия", "аудит"],
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    vendor: "openai",
    hint: "быстрый · temperature не поддерживается",
    supportsTemperature: false,
    speed: "fast",
    strengths: ["скорость"],
  },
];

export function getModelInfo(id: string | null | undefined): AiModelInfo | null {
  if (!id) return null;
  return AI_MODELS.find((m) => m.id === id) ?? null;
}

/**
 * Поддерживает ли модель параметр temperature.
 * Для незнакомых (например, кастомных Omniroute) моделей считаем, что да.
 */
export function modelSupportsTemperature(id: string): boolean {
  const info = getModelInfo(id);
  if (info) return info.supportsTemperature;
  return !/(^|\/)(gpt-5|o[134])/i.test(id);
}

/** Порядок резервных моделей, если основная недоступна (лимиты/ошибки). */
export const FALLBACK_CHAIN = [
  "google/gemini-3.6-flash",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
];
