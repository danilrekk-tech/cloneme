import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listMcpServers,
  saveMcpServer,
  deleteMcpServer,
  testMcpServer,
  type McpServerRow,
} from "@/lib/mcp.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plug,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

const OMNIROUTE_URL = "https://api.omniroute.dev/mcp";

export function McpServersCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMcpServers);
  const saveFn = useServerFn(saveMcpServer);
  const deleteFn = useServerFn(deleteMcpServer);
  const testFn = useServerFn(testMcpServer);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<McpServerRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    url: "",
    auth_token: "",
    enabled: true,
  });

  const q = useQuery({
    queryKey: ["mcp_servers"],
    queryFn: () => listFn() as Promise<McpServerRow[]>,
  });

  const saveMut = useMutation({
    mutationFn: (input: {
      id?: string;
      name: string;
      url: string;
      auth_token?: string | null;
      enabled: boolean;
    }) => saveFn({ data: { ...input, transport: "http" as const } }),
    onSuccess: () => {
      toast.success(editing ? "Обновлено" : "MCP-сервер добавлен");
      setOpen(false);
      setEditing(null);
      resetForm();
      qc.invalidateQueries({ queryKey: ["mcp_servers"] });
    },
    onError: (e: any) => toast.error("Не удалось сохранить", { description: String(e?.message ?? e).slice(0, 240) }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["mcp_servers"] });
    },
    onError: (e: any) => toast.error("Не удалось удалить", { description: String(e?.message ?? e).slice(0, 240) }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: (res: any) => {
      toast.success(`Подключено · ${res?.tools?.length ?? 0} инструментов`);
      qc.invalidateQueries({ queryKey: ["mcp_servers"] });
    },
    onError: (e: any) =>
      toast.error("MCP не отвечает", { description: String(e?.message ?? e).slice(0, 300) }),
  });

  function resetForm() {
    setForm({ name: "", url: "", auth_token: "", enabled: true });
  }

  function openNew() {
    setEditing(null);
    resetForm();
    setOpen(true);
  }

  function openOmniroute() {
    setEditing(null);
    setForm({ name: "Omniroute", url: OMNIROUTE_URL, auth_token: "", enabled: true });
    setOpen(true);
  }

  function openEdit(row: McpServerRow) {
    setEditing(row);
    setForm({
      name: row.name,
      url: row.url,
      auth_token: row.auth_token ?? "",
      enabled: row.enabled,
    });
    setOpen(true);
  }

  const servers = q.data ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5" /> MCP-агенты
              </CardTitle>
              <CardDescription>
                Подключите сторонние агенты через Model Context Protocol. Их инструменты станут контекстом для
                AI-доработки.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={openOmniroute}>
                <Plus className="mr-2 h-4 w-4" /> Omniroute
              </Button>
              <Button size="sm" onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> Добавить сервер
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : servers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Ещё нет подключённых MCP-серверов. Добавьте Omniroute или укажите свой URL — AI-доработка будет учитывать
              их инструменты.
            </div>
          ) : (
            <div className="space-y-2">
              {servers.map((s) => (
                <McpRow
                  key={s.id}
                  row={s}
                  expanded={expanded === s.id}
                  onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
                  onEdit={() => openEdit(s)}
                  onDelete={() => {
                    if (confirm(`Удалить MCP-сервер "${s.name}"?`)) delMut.mutate(s.id);
                  }}
                  onTest={() => testMut.mutate(s.id)}
                  testing={testMut.isPending && testMut.variables === s.id}
                  deleting={delMut.isPending && delMut.variables === s.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !saveMut.isPending) {
            setOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Изменить MCP-сервер" : "Новый MCP-сервер"}</DialogTitle>
            <DialogDescription>
              Streamable HTTP (или SSE). Для Omniroute используйте личный токен.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mcp-name">Название</Label>
              <Input
                id="mcp-name"
                placeholder="Omniroute"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-url">URL MCP-сервера</Label>
              <Input
                id="mcp-url"
                placeholder="https://api.omniroute.dev/mcp"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Обычно оканчивается на <code className="font-mono">/mcp</code> или <code className="font-mono">/sse</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-token">Bearer-токен (опционально)</Label>
              <Input
                id="mcp-token"
                type="password"
                placeholder="sk-…"
                value={form.auth_token}
                onChange={(e) => setForm((f) => ({ ...f, auth_token: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Активен</div>
                <div className="text-xs text-muted-foreground">Отключённые серверы не участвуют в AI-доработке.</div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saveMut.isPending}
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Отмена
            </Button>
            <Button
              disabled={saveMut.isPending || !form.name.trim() || !form.url.trim()}
              onClick={() =>
                saveMut.mutate({
                  id: editing?.id,
                  name: form.name.trim(),
                  url: form.url.trim(),
                  auth_token: form.auth_token.trim() || null,
                  enabled: form.enabled,
                })
              }
            >
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function McpRow({
  row,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onTest,
  testing,
  deleting,
}: {
  row: McpServerRow;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testing: boolean;
  deleting: boolean;
}) {
  const tools = row.tools ?? [];
  const hasError = !!row.last_error;
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.name}</span>
            {row.enabled ? (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                активен
              </Badge>
            ) : (
              <Badge variant="secondary">выкл</Badge>
            )}
            {tools.length > 0 ? (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> {tools.length} tools
              </Badge>
            ) : hasError ? (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" /> ошибка
              </Badge>
            ) : (
              <Badge variant="secondary">не проверен</Badge>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{row.url}</div>
          {hasError ? (
            <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {row.last_error}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button size="sm" variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Проверить
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <ExternalLink className="mr-2 h-4 w-4" /> Изменить
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={deleting}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {tools.length > 0 ? (
        <div className="border-t border-border px-4 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Скрыть инструменты" : `Показать инструменты (${tools.length})`}
          </button>
          {expanded ? (
            <ul className="mt-2 max-h-56 space-y-1 overflow-auto rounded-md bg-muted/30 p-2 font-mono text-xs">
              {tools.map((t) => (
                <li key={t.name} className="truncate">
                  <span className="text-foreground">{t.name}</span>
                  {t.description ? <span className="text-muted-foreground"> — {t.description}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
