import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createCloneJob,
  listCloneJobs,
  refreshCloneJob,
  downloadCloneBundle,
  refineClone,
  deleteCloneJob,
} from "@/lib/ditto.functions";
import {
  listMcpServers,
  runMcpToolsPreview,
  type McpServerRow,
  type McpToolInfo,
  type ToolCallEntry,
} from "@/lib/mcp.functions";
import { AI_PRESETS, getPreset } from "@/lib/ai-presets";
import { McpToolTimeline } from "@/components/mcp-tool-timeline";
import { getUserSettings, type UserSettings } from "@/lib/settings.functions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RefreshCw,
  LogOut,
  Download,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Wand2,
  Eye,
  Loader2,
  Trash2,
  ExternalLink,
  Settings2,
  Plug,
  PlugZap,
  Play,
  Bot,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Clone Studio — рабочее пространство" },
      { name: "description", content: "Клонируйте сайт, скачивайте исходники и улучшайте страницу с помощью AI." },
    ],
  }),
  component: AppPage,
});

type Job = {
  id: string;
  ditto_job_id: string | null;
  source_url: string;
  mode: string;
  framework: string;
  styling: string;
  status: string;
  last_event: any;
  result: any;
  error: string | null;
  files_path: string | null;
  refined_path: string | null;
  refined_status: string | null;
  refined_error: string | null;
  refined_brief: string | null;
  refined_at: string | null;
  created_at: string;
  updated_at: string;
};

const MODEL_OPTIONS = AI_MODELS.map((m) => ({
  value: m.id,
  label: `${m.label} — ${m.hint}`,
}));


function AppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createFn = useServerFn(createCloneJob);
  const listFn = useServerFn(listCloneJobs);
  const refreshFn = useServerFn(refreshCloneJob);
  const downloadFn = useServerFn(downloadCloneBundle);
  const refineFn = useServerFn(refineClone);
  const deleteFn = useServerFn(deleteCloneJob);
  const listMcpFn = useServerFn(listMcpServers);
  const settingsFn = useServerFn(getUserSettings);

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const settingsQuery = useQuery({
    queryKey: ["user_settings"],
    queryFn: () => settingsFn() as Promise<UserSettings>,
  });

  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [framework, setFramework] = useState<"next" | "vite">("next");
  const [styling, setStyling] = useState<"tailwind" | "css">("tailwind");

  // sync from user settings once loaded
  useEffect(() => {
    if (settingsQuery.data) {
      setMode(settingsQuery.data.default_mode);
      setFramework(settingsQuery.data.default_framework);
      setStyling(settingsQuery.data.default_styling);
    }
  }, [settingsQuery.data]);

  const [refineTarget, setRefineTarget] = useState<Job | null>(null);
  const [refineBrief, setRefineBrief] = useState("");
  const [refineModel, setRefineModel] = useState<string>("google/gemini-2.5-pro");
  const [refineTemp, setRefineTemp] = useState<number>(0.6);
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>({});
  const [presetId, setPresetId] = useState<string>("none");
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const runToolsFn = useServerFn(runMcpToolsPreview);

  useEffect(() => {
    if (settingsQuery.data) {
      setRefineModel(settingsQuery.data.refine_model);
      setRefineTemp(settingsQuery.data.refine_temperature);
    }
  }, [settingsQuery.data, refineTarget]);

  const runToolsMut = useMutation({
    mutationFn: (input: {
      url?: string;
      brief?: string;
      selected: Array<{ serverId: string; toolName: string }>;
    }) => runToolsFn({ data: input }) as Promise<{ calls: ToolCallEntry[] }>,
    onSuccess: (res) => {
      setToolCalls(res.calls);
      const failed = res.calls.filter((c) => !c.ok).length;
      if (failed === 0) toast.success(`Выполнено инструментов: ${res.calls.length}`);
      else toast.warning(`Готово, но ${failed} вызов(ов) с ошибкой — раскройте детали в таймлайне`);
    },
    onError: (e: any) =>
      toast.error("Не удалось выполнить инструменты", {
        description: String(e?.message ?? e).slice(0, 240),
      }),
  });

  function applyPreset(id: string) {
    setPresetId(id);
    const p = getPreset(id === "none" ? null : id);
    if (!p) return;
    setRefineBrief(p.brief);
    setRefineModel(p.model);
    setRefineTemp(p.temperature);
  }

  const mcpQuery = useQuery({
    queryKey: ["mcp_servers"],
    queryFn: () => listMcpFn() as Promise<McpServerRow[]>,
  });

  const jobsQuery = useQuery({
    queryKey: ["clone_jobs"],
    queryFn: () => listFn() as Promise<Job[]>,
    refetchInterval: (q) => {
      const jobs = (q.state.data as Job[] | undefined) ?? [];
      const active = jobs.some(
        (j) =>
          !["done", "succeeded", "failed", "error", "cancelled"].includes(j.status) ||
          j.refined_status === "processing",
      );
      return active ? 4000 : false;
    },
  });

  const createMut = useMutation({
    mutationFn: (input: {
      url: string;
      mode: "single" | "multi";
      framework: "next" | "vite";
      styling: "tailwind" | "css";
    }) => createFn({ data: input }),
    onSuccess: () => {
      toast.success("Задача на клонирование отправлена");
      setUrl("");
      setUrlError(null);
      queryClient.invalidateQueries({ queryKey: ["clone_jobs"] });
    },
    onError: (e) => {
      const { title, description } = friendlyError(e, "Не удалось отправить задачу");
      toast.error(title, { description });
    },
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clone_jobs"] }),
    onError: (e) => {
      const { title, description } = friendlyError(e, "Не удалось обновить статус");
      toast.error(title, { description });
    },
  });

  const refineMut = useMutation({
    mutationFn: (input: {
      id: string;
      brief?: string;
      model: string;
      temperature: number;
      selectedTools: Array<{ serverId: string; toolName: string }>;
    }) => refineFn({ data: input }),
    onSuccess: () => {
      toast.success("AI-версия готова");
      setRefineTarget(null);
      setRefineBrief("");
      setSelectedTools({});
      setToolCalls([]);
      setPresetId("none");
      queryClient.invalidateQueries({ queryKey: ["clone_jobs"] });
    },
    onError: (e) => {
      const { title, description } = friendlyError(e, "AI-доработка не удалась");
      toast.error(title, { description });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Клон удалён");
      queryClient.invalidateQueries({ queryKey: ["clone_jobs"] });
    },
    onError: (e) => {
      const { title, description } = friendlyError(e, "Не удалось удалить");
      toast.error(title, { description });
    },
  });

  useEffect(() => {
    const jobs = (jobsQuery.data as Job[] | undefined) ?? [];
    const active = jobs.filter(
      (j) => j.ditto_job_id && !["done", "succeeded", "failed", "error", "cancelled"].includes(j.status),
    );
    if (!active.length) return;
    const t = setInterval(() => {
      active.forEach((j) => refreshMut.mutate(j.id));
    }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsQuery.data]);

  async function onSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    const err = validateUrl(trimmed);
    if (err) {
      setUrlError(err);
      toast.error(err);
      return;
    }
    setUrlError(null);
    createMut.mutate({ url: trimmed, mode, framework, styling });
  }

  const jobs = (jobsQuery.data as Job[] | undefined) ?? [];
  const mcpServers = mcpQuery.data ?? [];
  const activeMcp = mcpServers.filter((s) => s.enabled && (s.tools?.length ?? 0) > 0);

  // Flat list of all tools with server context, for the refine dialog.
  const allTools = useMemo(() => {
    const items: Array<{ key: string; serverId: string; serverName: string; provider: string; tool: McpToolInfo }> = [];
    for (const s of activeMcp) {
      for (const t of s.tools ?? []) {
        items.push({
          key: `${s.id}::${t.name}`,
          serverId: s.id,
          serverName: s.name,
          provider: s.provider ?? "custom",
          tool: t,
        });
      }
    }
    return items;
  }, [activeMcp]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="shrink-0" aria-label="Clone Studio">
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{email}</span>
            <Link to="/integrations">
              <Button variant="ghost" size="sm">
                <PlugZap className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Интеграции</span>
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="ghost" size="sm">
                <Settings2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Настройки</span>
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <Card className="fade-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Склонировать сайт
            </CardTitle>
            <CardDescription>
              Вставьте URL — получите настоящий{" "}
              {framework === "next" ? "Next.js" : "Vite"} проект за ~5 минут.
              Все параметры — по умолчанию из{" "}
              <Link to="/settings" className="underline underline-offset-2">
                настроек
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">URL сайта</Label>
                <Input
                  id="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  aria-invalid={urlError ? true : undefined}
                  className={urlError ? "border-destructive focus-visible:ring-destructive" : ""}
                  required
                />
                {urlError ? (
                  <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {urlError}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-dashed border-border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setAdvancedOpen((v) => !v)}
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Расширенные параметры для этой задачи
                  </span>
                  {advancedOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {advancedOpen ? (
                  <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Режим</Label>
                      <Select value={mode} onValueChange={(v) => setMode(v as any)}>
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
                      <Select value={framework} onValueChange={(v) => setFramework(v as any)}>
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
                      <Select value={styling} onValueChange={(v) => setStyling(v as any)}>
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
                ) : (
                  <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    {mode === "single" ? "Одна страница" : "Много страниц"} ·{" "}
                    {framework === "next" ? "Next.js" : "Vite"} ·{" "}
                    {styling === "tailwind" ? "Tailwind" : "CSS"}
                  </div>
                )}
              </div>

              <Button type="submit" disabled={createMut.isPending} className="w-full sm:w-auto">
                {createMut.isPending ? "Отправка…" : "Начать клонирование"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* MCP context indicator */}
        <div className="fade-up-delay-1 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Plug className="h-3.5 w-3.5" />
            {activeMcp.length === 0 ? (
              <span>MCP-агенты не подключены — AI-доработка сработает и без них.</span>
            ) : (
              <span>
                Подключено <span className="font-medium text-foreground">{activeMcp.length}</span>{" "}
                MCP-серверов ·{" "}
                <span className="font-medium text-foreground">
                  {activeMcp.reduce((s, r) => s + (r.tools?.length ?? 0), 0)}
                </span>{" "}
                инструментов. Выберите нужные при запуске AI-доработки.
              </span>
            )}
          </div>
          <Link to="/settings">
            <Button size="sm" variant="ghost">
              Управление в настройках →
            </Button>
          </Link>
        </div>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Ваши задачи</h2>
            <Button variant="ghost" size="sm" onClick={() => jobsQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Обновить список
            </Button>
          </div>
          {jobsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : jobs.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Ещё нет задач. Отправьте URL выше, чтобы начать.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((j) => (
                <JobRow
                  key={j.id}
                  job={j}
                  onRefresh={() => refreshMut.mutate(j.id)}
                  refreshing={refreshMut.isPending && refreshMut.variables === j.id}
                  onDownload={() => downloadJob(j.id, downloadFn as any)}
                  onRefine={() => {
                    setRefineTarget(j);
                    setRefineBrief(j.refined_brief ?? "");
                    setSelectedTools({});
                  }}
                  onPreview={() => navigate({ to: "/preview/$jobId", params: { jobId: j.id } })}
                  onDelete={() => {
                    if (confirm(`Удалить клон ${j.source_url}? Все версии AI-доработки также будут удалены.`)) {
                      deleteMut.mutate(j.id);
                    }
                  }}
                  deleting={deleteMut.isPending && deleteMut.variables === j.id}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog
        open={!!refineTarget}
        onOpenChange={(o) => {
          if (!o && !refineMut.isPending) {
            setRefineTarget(null);
            setRefineBrief("");
            setSelectedTools({});
            setToolCalls([]);
            setPresetId("none");
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" /> AI-доработка страницы
            </DialogTitle>
            <DialogDescription>
              Выберите модель и MCP-инструменты, которые нужно исполнить перед генерацией. Их результаты
              попадут в контекст модели.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Bot className="h-4 w-4" /> Готовый AI-профиль
              </Label>
              <Select value={presetId} onValueChange={applyPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Без профиля" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без профиля — свой бриф</SelectItem>
                  {AI_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex flex-col">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.tagline}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getPreset(presetId === "none" ? null : presetId) ? (
                <p className="text-xs text-muted-foreground">
                  {getPreset(presetId)!.description}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div className="space-y-2">
                <Label>Модель</Label>
                <Select value={refineModel} onValueChange={setRefineModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="temp2">Температура</Label>
                <Input
                  id="temp2"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={refineTemp}
                  onChange={(e) => setRefineTemp(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brief">Бриф (необязательно)</Label>
              <Textarea
                id="brief"
                placeholder="Например: усилить hero, добавить социальные доказательства, премиум-B2B тон."
                value={refineBrief}
                onChange={(e) => setRefineBrief(e.target.value)}
                rows={4}
                maxLength={4000}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Plug className="h-4 w-4" /> MCP-инструменты для контекста
                </Label>
                <span className="text-xs text-muted-foreground">
                  {Object.values(selectedTools).filter(Boolean).length} выбрано из {allTools.length}
                </span>
              </div>
              {allTools.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  Нет активных инструментов. Подключите Omniroute или свой MCP-сервер в{" "}
                  <Link to="/settings" className="underline">
                    настройках
                  </Link>
                  .
                </div>
              ) : (
                <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-border p-1.5">
                  {allTools.map((it) => (
                    <label
                      key={it.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded px-2 py-1.5 text-xs hover:bg-muted/60"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={!!selectedTools[it.key]}
                        onCheckedChange={(v) =>
                          setSelectedTools((s) => ({ ...s, [it.key]: !!v }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{it.tool.name}</span>
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">
                            {it.serverName}
                          </Badge>
                          {it.provider === "omniroute" ? (
                            <Badge className="h-4 px-1 text-[10px]" variant="secondary">
                              omniroute
                            </Badge>
                          ) : null}
                        </div>
                        {it.tool.description ? (
                          <div className="mt-0.5 truncate text-muted-foreground">
                            {it.tool.description}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Инструменты запускаются со стандартными аргументами{" "}
                <code className="rounded bg-muted px-1 font-mono text-[10px]">{"{ url, brief }"}</code>{" "}
                — их результаты попадут в контекст модели.
              </p>

              {allTools.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    runToolsMut.isPending ||
                    Object.values(selectedTools).filter(Boolean).length === 0
                  }
                  onClick={() => {
                    const picks = allTools
                      .filter((it) => selectedTools[it.key])
                      .map((it) => ({ serverId: it.serverId, toolName: it.tool.name }));
                    runToolsMut.mutate({
                      url: refineTarget?.source_url,
                      brief: refineBrief || undefined,
                      selected: picks,
                    });
                  }}
                >
                  {runToolsMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Пробный прогон инструментов
                </Button>
              ) : null}

              <McpToolTimeline
                calls={toolCalls}
                running={runToolsMut.isPending}
                title="Вызовы MCP-инструментов до refine"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={refineMut.isPending}
              onClick={() => {
                setRefineTarget(null);
                setRefineBrief("");
                setSelectedTools({});
              }}
            >
              Отмена
            </Button>
            <Button
              disabled={refineMut.isPending || !refineTarget}
              onClick={() => {
                if (!refineTarget) return;
                const picks = allTools
                  .filter((it) => selectedTools[it.key])
                  .map((it) => ({ serverId: it.serverId, toolName: it.tool.name }));
                refineMut.mutate({
                  id: refineTarget.id,
                  brief: refineBrief.trim() || undefined,
                  model: refineModel,
                  temperature: refineTemp,
                  selectedTools: picks,
                });
              }}
            >
              {refineMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Обрабатываем…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" /> Запустить доработку
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function validateUrl(value: string): string | null {
  if (!value) return "Укажите URL";
  if (value.length > 2048) return "URL слишком длинный (макс. 2048 символов)";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Неверный URL. Укажите схему, например https://example.com";
  }
  if (!/^https?:$/.test(parsed.protocol)) return "Поддерживаются только http:// и https://";
  if (!parsed.hostname || !parsed.hostname.includes(".")) return "URL должен содержать корректный домен";
  return null;
}

function friendlyError(e: unknown, fallback: string): { title: string; description?: string } {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const lower = raw.toLowerCase();
  if (!raw) return { title: fallback };
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request")) {
    return { title: "Сетевая ошибка", description: "Проверьте соединение и попробуйте снова." };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return { title: "Таймаут запроса", description: "Ditto не ответил вовремя. Попробуйте обновить задачу." };
  }
  if (/\b401\b/.test(raw) || lower.includes("unauthorized") || lower.includes("не авторизован")) {
    return {
      title: "Не авторизован (401)",
      description: "Сессия истекла или ключ Ditto недействителен. Перезайдите в аккаунт.",
    };
  }
  if (/\b403\b/.test(raw) || lower.includes("forbidden")) {
    return { title: "Доступ запрещён (403)", description: "Ditto отклонил запрос. Проверьте права API-ключа." };
  }
  if (/\b429\b/.test(raw) || lower.includes("rate limit")) {
    return { title: "Слишком много запросов (429)", description: "Немного подождите и повторите." };
  }
  if (/\b5\d{2}\b/.test(raw)) return { title: "Ошибка сервиса Ditto", description: raw.slice(0, 200) };
  if (lower.includes("no authorization header")) return { title: "Сессия истекла", description: "Войдите заново." };
  return { title: fallback, description: raw.slice(0, 240) };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

async function downloadJob(
  id: string,
  fn: (args: { data: { id: string } }) => Promise<{ filename: string; contentType: string; base64: string }>,
) {
  const tId = toast.loading("Готовим архив…");
  try {
    const res = await fn({ data: { id } });
    if (!res.base64) throw new Error("Пустой ответ от сервера");
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: res.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Скачано ${res.filename} (${formatBytes(bytes.length)})`, { id: tId });
  } catch (e) {
    const { title, description } = friendlyError(e, "Скачивание не удалось");
    toast.error(title, { id: tId, description });
  }
}

const STATUS_RU: Record<string, string> = {
  submitting: "отправка",
  queued: "в очереди",
  processing: "выполняется",
  capturing: "захват",
  generating: "генерация",
  verifying: "проверка",
  succeeded: "готово",
  done: "готово",
  failed: "ошибка",
  error: "ошибка",
  cancelled: "отменено",
};

function JobRow({
  job,
  onRefresh,
  refreshing,
  onDownload,
  onRefine,
  onPreview,
  onDelete,
  deleting,
}: {
  job: Job;
  onRefresh: () => void;
  refreshing: boolean;
  onDownload: () => void;
  onRefine: () => void;
  onPreview: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const done = ["done", "succeeded"].includes(job.status);
  const failed = ["failed", "error", "cancelled"].includes(job.status);
  const variant: "default" | "secondary" | "destructive" | "outline" = done ? "default" : failed ? "destructive" : "secondary";

  const files: { count?: number; totalBytes?: number; paths?: string[] } | null = job.result?.files ?? null;
  const fileCount = files?.count ?? 0;
  const totalBytes = files?.totalBytes ?? 0;
  const paths = files?.paths ?? [];
  const emptyResult = done && fileCount === 0;

  const displayError = job.error ? friendlyError(new Error(job.error), "Задача завершилась ошибкой") : null;
  const refineBusy = job.refined_status === "processing";
  const refineReady = job.refined_status === "ready" && job.refined_path;
  const refineFailed = job.refined_status === "failed";

  return (
    <Card className="tile-hover">
      <CardContent className="py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={variant} className="capitalize">
                {STATUS_RU[job.status] ?? job.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {job.framework} · {job.styling} · {job.mode === "single" ? "одна страница" : "мульти"}
              </span>
              {done && fileCount > 0 ? (
                <span className="text-xs font-medium text-foreground">
                  {fileCount} файлов · {formatBytes(totalBytes)}
                </span>
              ) : null}
              {refineReady ? (
                <Badge variant="outline" className="border-primary/40 text-primary">
                  AI-версия готова
                </Badge>
              ) : refineBusy ? (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> AI обрабатывает…
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 truncate text-sm font-medium">{job.source_url}</div>

            {displayError ? (
              <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-3.5 w-3.5" /> {displayError.title}
                </div>
                {displayError.description ? <div className="mt-0.5 text-destructive/90">{displayError.description}</div> : null}
              </div>
            ) : emptyResult ? (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-3.5 w-3.5" /> Пустой результат
                </div>
                <div className="mt-0.5">Ditto завершил задачу, но файлов нет. Возможно, страница закрыта или пуста.</div>
              </div>
            ) : job.last_event?.message ? (
              <div className="mt-1 truncate text-xs text-muted-foreground">{String(job.last_event.message)}</div>
            ) : null}

            {refineFailed && job.refined_error ? (
              <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-3.5 w-3.5" /> AI-доработка не удалась
                </div>
                <div className="mt-0.5 text-destructive/90">{job.refined_error.slice(0, 240)}</div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {done && fileCount > 0 ? (
              <>
                <Button size="sm" onClick={onPreview}>
                  <Eye className="mr-2 h-4 w-4" /> Открыть
                </Button>
                {refineReady ? (
                  <a
                    href={`/preview/${job.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <Button size="sm" variant="outline">
                      <ExternalLink className="mr-2 h-4 w-4" /> В новой вкладке
                    </Button>
                  </a>
                ) : null}
                <Button size="sm" variant="outline" onClick={onDownload}>
                  <Download className="mr-2 h-4 w-4" /> .zip
                </Button>
                <Button size="sm" variant="secondary" onClick={onRefine} disabled={refineBusy}>
                  {refineBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  {refineReady ? "Новая AI-версия" : "AI-доработка"}
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              title="Удалить клон"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {done && fileCount > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Скрыть файлы" : `Показать файлы (${fileCount})`}
            </button>
            {expanded ? (
              <ul className="mt-2 max-h-64 space-y-0.5 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-xs">
                {paths.slice(0, 500).map((p) => (
                  <li key={p} className="flex items-center gap-1.5 truncate text-muted-foreground">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{p}</span>
                  </li>
                ))}
                {paths.length > 500 ? (
                  <li className="pt-1 text-muted-foreground">…и ещё {paths.length - 500} файлов</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
