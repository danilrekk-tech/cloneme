import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings.functions";
import { activateOmniroute } from "@/lib/mcp.functions";
import { AI_MODELS, getModelInfo } from "@/lib/ai-models";

import { Logo } from "@/components/logo";
import { McpServersCard } from "@/components/mcp-servers-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  LogOut,
  Save,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [{ title: "Настройки — Clone Studio" }],
  }),
  component: SettingsPage,
});

const MODEL_OPTIONS: Array<{ value: string; label: string; hint: string }> = AI_MODELS.map((m) => ({
  value: m.id,
  label: m.label,
  hint: m.hint,
}));


function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getUserSettings);
  const saveFn = useServerFn(saveUserSettings);
  const omniFn = useServerFn(activateOmniroute);

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const q = useQuery({
    queryKey: ["user_settings"],
    queryFn: () => getFn() as Promise<UserSettings>,
  });

  const [form, setForm] = useState<UserSettings | null>(null);
  useEffect(() => {
    if (q.data && !form) setForm(q.data);
  }, [q.data, form]);

  const [omniKey, setOmniKey] = useState("");
  useEffect(() => {
    if (q.data?.omniroute_api_key) setOmniKey(q.data.omniroute_api_key);
  }, [q.data?.omniroute_api_key]);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<UserSettings>) => saveFn({ data: patch as any }),
    onSuccess: () => {
      toast.success("Настройки сохранены");
      qc.invalidateQueries({ queryKey: ["user_settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Ошибка сохранения"),
  });

  const omniMut = useMutation({
    mutationFn: (key: string) => omniFn({ data: { apiKey: key } }),
    onSuccess: (res: any) => {
      toast.success(`Omniroute подключён · ${res?.tools?.length ?? 0} инструментов`);
      qc.invalidateQueries({ queryKey: ["mcp_servers"] });
      qc.invalidateQueries({ queryKey: ["user_settings"] });
    },
    onError: (e: any) =>
      toast.error("Не удалось подключить Omniroute", {
        description: String(e?.message ?? e).slice(0, 260),
      }),
  });

  async function onSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка настроек…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/app">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" /> К задачам
              </Button>
            </Link>
            <div className="hidden sm:block">
              <Logo size="md" />
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{email}</span>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="fade-up">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Настройки
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Персонализация Clone Studio
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Дефолты клонирования, модель для AI-доработки, ключ Omniroute и подключённые MCP-агенты.
          </p>
        </div>

        {/* ============= Omniroute ============= */}
        <Card className="fade-up-delay-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" /> Omniroute API
            </CardTitle>
            <CardDescription>
              Введите личный ключ Omniroute — Clone Studio подключит их MCP-сервер и загрузит список агентов
              автоматически. Ключ хранится только у вас, в зашифрованной базе.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="omni">API-ключ Omniroute</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="omni"
                  placeholder="omr_live_…"
                  type="password"
                  value={omniKey}
                  onChange={(e) => setOmniKey(e.target.value)}
                  autoComplete="off"
                />
                <Button
                  onClick={() => omniMut.mutate(omniKey.trim())}
                  disabled={!omniKey.trim() || omniMut.isPending}
                >
                  {omniMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  Подключить
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                После подключения агенты появятся в списке MCP-серверов ниже с меткой{" "}
                <code className="rounded bg-muted px-1 font-mono">omniroute</code>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ============= Default clone settings ============= */}
        <Card className="fade-up-delay-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5" /> Дефолты клонирования
            </CardTitle>
            <CardDescription>
              Эти значения подставляются в форму на главной. Их можно переопределить в «Расширенных
              настройках» при создании задачи.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Режим</Label>
                <Select
                  value={form.default_mode}
                  onValueChange={(v) => setForm({ ...form, default_mode: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Одна страница</SelectItem>
                    <SelectItem value="multi">Много страниц</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Фреймворк</Label>
                <Select
                  value={form.default_framework}
                  onValueChange={(v) => setForm({ ...form, default_framework: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="next">Next.js</SelectItem>
                    <SelectItem value="vite">Vite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Стилизация</Label>
                <Select
                  value={form.default_styling}
                  onValueChange={(v) => setForm({ ...form, default_styling: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tailwind">Tailwind</SelectItem>
                    <SelectItem value="css">Обычный CSS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============= Default refine settings ============= */}
        <Card className="fade-up-delay-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Дефолты AI-доработки
            </CardTitle>
            <CardDescription>
              Провайдер, модель, резервная модель и контекст-бюджет по умолчанию. Каждую задачу можно
              переопределить в диалоге доработки.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-3">
                <Label>Провайдер ИИ</Label>
                <Select
                  value={form.refine_provider}
                  onValueChange={(v) => setForm({ ...form, refine_provider: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openrouter">
                      <span className="flex flex-col">
                        <span className="font-medium">OpenRouter — бесплатные модели (рекомендуется)</span>
                        <span className="text-xs text-muted-foreground">
                          DeepSeek V3, Gemini Flash, Llama 3.3 — без расхода кредитов Lovable
                        </span>
                      </span>
                    </SelectItem>
                    <SelectItem value="lovable">
                      <span className="flex flex-col">
                        <span className="font-medium">Встроенные модели (без ключа)</span>
                        <span className="text-xs text-muted-foreground">
                          Gemini и GPT-5 через шлюз, автоматическое переключение при лимитах
                        </span>
                      </span>
                    </SelectItem>
                    <SelectItem value="omniroute">
                      <span className="flex flex-col">
                        <span className="font-medium">Свой агент / Omniroute (OpenAI-совместимый)</span>
                        <span className="text-xs text-muted-foreground">
                          Локальный или облачный endpoint + ваш API-ключ
                        </span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.refine_provider === "openrouter" ? (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="orkey-main">API-ключ OpenRouter (необязательно)</Label>
                    <Input
                      id="orkey-main"
                      type="password"
                      placeholder="sk-or-v1-… (по умолчанию используется общий ключ сервиса)"
                      value={form.openrouter_api_key ?? ""}
                      onChange={(e) => setForm({ ...form, openrouter_api_key: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ormodel-main">Модель OpenRouter</Label>
                    <Input
                      id="ormodel-main"
                      placeholder="deepseek/deepseek-chat-v3-0324:free"
                      value={form.openrouter_model ?? ""}
                      onChange={(e) => setForm({ ...form, openrouter_model: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Пусто — подберём бесплатную модель автоматически.
                    </p>
                  </div>
                </>
              ) : null}

              {form.refine_provider === "omniroute" ? (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="omnibase">Endpoint провайдера</Label>
                    <Input
                      id="omnibase"
                      placeholder="http://localhost:8080/v1"
                      value={form.omniroute_base_url ?? ""}
                      onChange={(e) => setForm({ ...form, omniroute_base_url: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Базовый URL OpenAI-совместимого API. Ключ берётся из поля Omniroute выше.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="omnimodel">Модель агента</Label>
                    <Input
                      id="omnimodel"
                      placeholder="напр. llama-3.3-70b"
                      value={form.omniroute_model ?? ""}
                      onChange={(e) => setForm({ ...form, omniroute_model: e.target.value })}
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-2 sm:col-span-3">
                <Label>Основная модель</Label>
                <Select
                  value={form.refine_model}
                  onValueChange={(v) => setForm({ ...form, refine_model: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex flex-col">
                          <span className="font-medium">{o.label}</span>
                          <span className="text-xs text-muted-foreground">{o.hint}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {getModelInfo(form.refine_model)?.supportsTemperature === false ? (
                  <p className="text-xs text-amber-500">
                    Эта модель не принимает температуру — параметр будет проигнорирован автоматически.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-3">
                <Label>Резервная модель</Label>
                <Select
                  value={form.refine_fallback_model}
                  onValueChange={(v) => setForm({ ...form, refine_fallback_model: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((o) => (
                      <SelectItem key={`fb-${o.value}`} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Используется автоматически, если основная модель недоступна или закончились кредиты.
                </p>
              </div>

              <div className="space-y-2 sm:col-span-3">
                <Label>Резервный провайдер (когда кончились токены Lovable)</Label>
                <Select
                  value={form.fallback_provider}
                  onValueChange={(v) => setForm({ ...form, fallback_provider: v as UserSettings["fallback_provider"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не использовать</SelectItem>
                    <SelectItem value="openrouter">OpenRouter (в т.ч. бесплатные модели)</SelectItem>
                    <SelectItem value="omniroute">Omniroute / локальный агент</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Если основной провайдер вернул 402/429/5xx — запрос автоматически уходит сюда.
                </p>
              </div>

              {form.fallback_provider === "openrouter" ? (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="orkey">API-ключ OpenRouter</Label>
                    <Input
                      id="orkey"
                      type="password"
                      placeholder="sk-or-…"
                      value={form.openrouter_api_key ?? ""}
                      onChange={(e) => setForm({ ...form, openrouter_api_key: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ormodel">Модель OpenRouter</Label>
                    <Input
                      id="ormodel"
                      placeholder="google/gemini-2.0-flash-exp:free"
                      value={form.openrouter_model ?? ""}
                      onChange={(e) => setForm({ ...form, openrouter_model: e.target.value })}
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="conceptmodel">Модель для визуальных концептов</Label>
                <Input
                  id="conceptmodel"
                  placeholder="google/gemini-3.1-flash-image"
                  value={form.concept_model}
                  onChange={(e) => setForm({ ...form, concept_model: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Используется, когда AI рисует 3 варианта дизайна перед доработкой.
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 sm:col-span-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={form.refine_research}
                  onChange={(e) => setForm({ ...form, refine_research: e.target.checked })}
                />
                <span className="text-sm">
                  <span className="font-medium">Режим исследования конкурентов</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Перед генерацией AI анализирует нишу и ближайших конкурентов и собирает макет
                    страницы, который должен быть сильнее оригинала. Добавляет ~30–60 секунд.
                  </span>
                </span>
              </label>

              <div className="space-y-2">
                <Label htmlFor="temp">Температура</Label>
                <Input
                  id="temp"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.refine_temperature}
                  onChange={(e) =>
                    setForm({ ...form, refine_temperature: Number(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">0.6 — сбалансированно</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="budget">Контекст-бюджет (символов)</Label>
                <Input
                  id="budget"
                  type="number"
                  min={20000}
                  max={150000}
                  step={5000}
                  value={form.refine_budget}
                  onChange={(e) =>
                    setForm({ ...form, refine_budget: Number(e.target.value) || 60000 })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Больше — качественнее аудит, но медленнее (60 000 — оптимум).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={() =>
              saveMut.mutate({
                default_mode: form.default_mode,
                default_framework: form.default_framework,
                default_styling: form.default_styling,
                refine_provider: form.refine_provider,
                refine_model: form.refine_model,
                refine_fallback_model: form.refine_fallback_model,
                refine_research: form.refine_research,
                refine_temperature: form.refine_temperature,
                refine_budget: form.refine_budget,
                omniroute_base_url: form.omniroute_base_url,
                omniroute_model: form.omniroute_model,
                fallback_provider: form.fallback_provider,
                openrouter_api_key: form.openrouter_api_key,
                openrouter_model: form.openrouter_model,
                concept_model: form.concept_model,
              })

            }
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Сохранить настройки
          </Button>
        </div>

        {/* ============= MCP-серверы ============= */}
        <div className="fade-up-delay-3">
          <McpServersCard />
        </div>
      </main>
    </div>
  );
}
