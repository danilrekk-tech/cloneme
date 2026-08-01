import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getUserSettings, type UserSettings } from "@/lib/settings.functions";
import {
  activateOmniroute,
  listMcpServers,
  saveMcpServer,
  OMNIROUTE_URL,
  type McpServerRow,
} from "@/lib/mcp.functions";
import { AI_PRESETS } from "@/lib/ai-presets";
import { Logo } from "@/components/logo";
import { McpServersCard } from "@/components/mcp-servers-card";
import { McpDiagnostics } from "@/components/mcp-diagnostics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Bot,
  KeyRound,
  Loader2,
  LogOut,
  Plug,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Интеграции — Clone Studio" },
      {
        name: "description",
        content:
          "Подключайте сторонних агентов по MCP, локальный Omniroute через API-ключ и готовые AI-профили улучшения сайтов.",
      },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const settingsFn = useServerFn(getUserSettings);
  const omniFn = useServerFn(activateOmniroute);
  const listFn = useServerFn(listMcpServers);
  const saveFn = useServerFn(saveMcpServer);

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const settingsQuery = useQuery({
    queryKey: ["user_settings"],
    queryFn: () => settingsFn() as Promise<UserSettings>,
  });

  const serversQuery = useQuery({
    queryKey: ["mcp_servers"],
    queryFn: () => listFn() as Promise<McpServerRow[]>,
  });

  const [omniKey, setOmniKey] = useState("");
  const [omniUrl, setOmniUrl] = useState(OMNIROUTE_URL);
  useEffect(() => {
    if (settingsQuery.data?.omniroute_api_key) setOmniKey(settingsQuery.data.omniroute_api_key);
  }, [settingsQuery.data?.omniroute_api_key]);

  const omniRow = (serversQuery.data ?? []).find((s) => s.provider === "omniroute") ?? null;
  useEffect(() => {
    if (omniRow?.url) setOmniUrl(omniRow.url);
  }, [omniRow?.url]);

  const omniMut = useMutation({
    mutationFn: async (key: string) => {
      const res: any = await omniFn({ data: { apiKey: key } });
      // если пользователь указал свой (локальный/туннельный) endpoint — сохраняем его
      if (res?.row?.id && omniUrl.trim() && omniUrl.trim() !== res.row.url) {
        await saveFn({
          data: {
            id: res.row.id,
            name: "Omniroute",
            url: omniUrl.trim(),
            transport: "http" as const,
            auth_token: key,
            enabled: true,
            provider: "omniroute" as const,
          },
        });
      }
      return res;
    },
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

  const activeTools = (serversQuery.data ?? [])
    .filter((s) => s.enabled)
    .reduce((n, s) => n + (s.tools?.length ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link to="/app">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" /> К задачам
              </Button>
            </Link>
            <div className="hidden sm:block">
              <Logo size="md" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/settings">
              <Button variant="ghost" size="sm">
                <Settings2 className="mr-2 h-4 w-4" /> Настройки
              </Button>
            </Link>
            <span className="hidden text-muted-foreground md:inline">{email}</span>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="fade-up">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Интеграции
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Агенты и подключения
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Подключите Omniroute по API-ключу, добавьте любых сторонних агентов по MCP и включайте
            готовые AI-профили улучшения сайтов. Активных инструментов сейчас:{" "}
            <span className="font-medium text-foreground">{activeTools}</span>.
          </p>
        </div>

        {/* ===== Omniroute ===== */}
        <Card className="fade-up-delay-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" /> Omniroute
              {omniRow ? (
                <Badge variant={omniRow.last_error ? "destructive" : "default"}>
                  {omniRow.last_error ? "ошибка" : "подключён"}
                </Badge>
              ) : (
                <Badge variant="outline">не подключён</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Введите личный API-ключ Omniroute — Clone Studio подтянет список ваших агентов и
              сделает их доступными в AI-доработке. Если Omniroute работает на локальном компьютере,
              укажите публичный адрес туннеля (ngrok, cloudflared) — прямой localhost из облака
              недоступен.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="omni-key">API-ключ</Label>
                <Input
                  id="omni-key"
                  type="password"
                  placeholder="omr_live_…"
                  autoComplete="off"
                  value={omniKey}
                  onChange={(e) => setOmniKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="omni-url">MCP endpoint</Label>
                <Input
                  id="omni-url"
                  placeholder="https://ваш-туннель.ngrok.app/mcp"
                  value={omniUrl}
                  onChange={(e) => setOmniUrl(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => omniMut.mutate(omniKey.trim())}
                disabled={!omniKey.trim() || omniMut.isPending}
              >
                {omniMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                {omniRow ? "Переподключить" : "Подключить"}
              </Button>
              {omniRow ? (
                <span className="text-xs text-muted-foreground">
                  Инструментов: {omniRow.tools?.length ?? 0}
                  {omniRow.last_checked_at
                    ? ` · проверено ${new Date(omniRow.last_checked_at).toLocaleString("ru-RU")}`
                    : ""}
                </span>
              ) : null}
            </div>
            {omniRow?.last_error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {omniRow.last_error}
              </div>
            ) : null}
            <McpDiagnostics
              serverId={omniRow?.id}
              url={omniUrl}
              token={omniKey || omniRow?.auth_token || null}
            />
          </CardContent>
        </Card>

        {/* ===== Сторонние агенты по MCP ===== */}
        <div className="fade-up-delay-2 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plug className="h-4 w-4" /> Сторонние агенты (MCP)
          </div>
          <McpServersCard />
        </div>

        {/* ===== Готовые AI-профили ===== */}
        <Card className="fade-up-delay-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> Готовые AI для улучшения сайтов
            </CardTitle>
            <CardDescription>
              Преднастроенные профили доработки: выбираете один в диалоге «AI-доработка» — модель,
              температура и подробный бриф подставляются автоматически.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {AI_PRESETS.map((p) => (
              <div
                key={p.id}
                className="tile-hover rounded-xl border border-border p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {p.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.tagline}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                    {p.model.split("/")[1]}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="pb-10 text-center">
          <Link to="/app">
            <Button variant="outline">Перейти к задачам</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
