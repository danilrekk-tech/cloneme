import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  getCloneFiles,
  activateRefinement,
  deleteRefinement,
  downloadRefinedBundle,
  refineClone,
} from "@/lib/ditto.functions";
import { generateConcepts, listConcepts } from "@/lib/concepts.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Code2,
  Download,
  FileText,
  GitCompare,
  History,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/preview/$jobId")({
  head: () => ({ meta: [{ title: "Просмотр клона — Clone Studio" }] }),
  component: PreviewPage,
});

type FileEntry = { type?: string; content?: string; url?: string; bytes?: number };
type Files = Record<string, FileEntry>;
type Refinement = {
  id: string;
  version: number;
  status: string;
  error: string | null;
  brief: string | null;
  model: string | null;
  created_at: string;
  isActive: boolean;
};
type PreviewData = {
  sourceUrl: string;
  files: Files;
  active: {
    id: string;
    version: number;
    brief: string | null;
    audit: string;
    changes: string;
    previewHtml: string;
  } | null;
  refinements: Refinement[];
};

function PreviewPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFilesFn = useServerFn(getCloneFiles);
  const activateFn = useServerFn(activateRefinement);
  const deleteRefFn = useServerFn(deleteRefinement);
  const downloadRefFn = useServerFn(downloadRefinedBundle);

  const q = useQuery({
    queryKey: ["clone_preview", jobId],
    queryFn: () => getFilesFn({ data: { id: jobId } }) as Promise<PreviewData>,
    refetchInterval: (query) => {
      const d = query.state.data as PreviewData | undefined;
      return d?.refinements?.some((r) => r.status === "processing") ? 4000 : false;
    },
  });

  const [tab, setTab] = useState<"refined" | "diff" | "source" | "files" | "history">("refined");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const activateMut = useMutation({
    mutationFn: (rid: string) => activateFn({ data: { jobId, refinementId: rid } }),
    onSuccess: () => {
      toast.success("Версия активирована");
      qc.invalidateQueries({ queryKey: ["clone_preview", jobId] });
      qc.invalidateQueries({ queryKey: ["clone_jobs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Ошибка"),
  });
  const deleteMut = useMutation({
    mutationFn: (rid: string) => deleteRefFn({ data: { refinementId: rid } }),
    onSuccess: () => {
      toast.success("Версия удалена");
      qc.invalidateQueries({ queryKey: ["clone_preview", jobId] });
      qc.invalidateQueries({ queryKey: ["clone_jobs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Ошибка"),
  });

  const files = q.data?.files ?? {};
  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const activePath =
    selectedPath ?? paths.find((p) => /page\.tsx?$|index\.html?$/.test(p)) ?? paths[0] ?? null;
  const activeEntry = activePath ? files[activePath] : null;
  const active = q.data?.active ?? null;
  const hasRefined = !!active?.previewHtml;

  async function onDownloadRefined(rid?: string) {
    const t = toast.loading("Готовим ZIP с исправленной версией…");
    try {
      const res = await downloadRefFn({ data: { id: jobId, refinementId: rid } });
      triggerDownload(res.filename, res.contentType, res.base64);
      toast.success(`Скачано ${res.filename}`, { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? "Скачивание не удалось", { id: t });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app" })}>
              <ArrowLeft className="mr-2 h-4 w-4" /> К задачам
            </Button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{q.data?.sourceUrl ?? "…"}</div>
              <div className="text-xs text-muted-foreground">
                Просмотр результата клонирования{active ? ` · активна v${active.version}` : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-secondary/50 p-0.5">
            <TabBtn active={tab === "refined"} onClick={() => setTab("refined")} disabled={!hasRefined}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI-версия
            </TabBtn>
            <TabBtn active={tab === "diff"} onClick={() => setTab("diff")} disabled={!hasRefined}>
              <GitCompare className="mr-1.5 h-3.5 w-3.5" /> Diff
            </TabBtn>
            <TabBtn active={tab === "history"} onClick={() => setTab("history")}>
              <History className="mr-1.5 h-3.5 w-3.5" /> История
              {q.data?.refinements?.length ? (
                <span className="ml-1 rounded bg-muted px-1 text-[10px]">{q.data.refinements.length}</span>
              ) : null}
            </TabBtn>
            <TabBtn active={tab === "source"} onClick={() => setTab("source")}>
              <Code2 className="mr-1.5 h-3.5 w-3.5" /> Исходники
            </TabBtn>
            <TabBtn active={tab === "files"} onClick={() => setTab("files")}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Файлы
            </TabBtn>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем файлы клона…
          </div>
        ) : q.isError ? (
          <ErrorBox message={(q.error as Error)?.message ?? "Ошибка загрузки"} />
        ) : tab === "refined" ? (
          hasRefined ? (
            <RefinedView active={active!} onDownloadZip={() => onDownloadRefined(active!.id)} />
          ) : (
            <EmptyRefined onSource={() => setTab("source")} />
          )
        ) : tab === "diff" ? (
          hasRefined ? (
            <DiffView original={pickOriginalHtml(files)} refined={active!.previewHtml} />
          ) : (
            <EmptyRefined onSource={() => setTab("source")} />
          )
        ) : tab === "history" ? (
          <HistoryView
            refinements={q.data?.refinements ?? []}
            onActivate={(id) => activateMut.mutate(id)}
            onDelete={(id) => {
              if (confirm("Удалить эту версию?")) deleteMut.mutate(id);
            }}
            onDownload={(id) => onDownloadRefined(id)}
            busyActivate={activateMut.isPending ? activateMut.variables ?? null : null}
            busyDelete={deleteMut.isPending ? deleteMut.variables ?? null : null}
          />
        ) : tab === "source" ? (
          <SourceView
            paths={paths}
            files={files}
            activePath={activePath}
            activeEntry={activeEntry}
            onSelect={setSelectedPath}
          />
        ) : (
          <FilesList paths={paths} files={files} />
        )}
      </main>
    </div>
  );
}

function TabBtn({
  active,
  disabled,
  children,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-2 py-6 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4" />
        <div>{message}</div>
      </CardContent>
    </Card>
  );
}

function EmptyRefined({ onSource }: { onSource: () => void }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        <Sparkles className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <p>AI-версия ещё не сгенерирована. Запустите доработку с главной страницы.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" variant="outline" onClick={onSource}>
            Открыть исходники
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RefinedView({
  active,
  onDownloadZip,
}: {
  active: NonNullable<PreviewData["active"]>;
  onDownloadZip: () => void;
}) {
  function openInNewTab() {
    const blob = new Blob([active.previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  function downloadHtml() {
    const blob = new Blob([active.previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `refined-v${active.version}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-destructive/70" />
            <span className="h-2 w-2 rounded-full bg-chart-4/70" />
            <span className="h-2 w-2 rounded-full bg-chart-2/70" />
            <span className="ml-2">refined-preview.html · v{active.version}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={openInNewTab}>
              Открыть в новой вкладке
            </Button>
            <Button size="sm" variant="outline" onClick={downloadHtml}>
              HTML
            </Button>
            <Button size="sm" onClick={onDownloadZip}>
              <Download className="mr-2 h-4 w-4" /> Скачать ZIP
            </Button>
          </div>
        </div>
        <iframe
          title="AI preview"
          srcDoc={active.previewHtml}
          sandbox="allow-scripts allow-same-origin"
          className="h-[70vh] w-full bg-white"
        />
      </Card>
      <div className="space-y-3">
        {active.brief ? (
          <Card>
            <CardContent className="py-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Бриф</div>
              <div className="whitespace-pre-wrap text-sm">{active.brief}</div>
            </CardContent>
          </Card>
        ) : null}
        {active.audit ? (
          <Card>
            <CardContent className="py-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Аудит</div>
              <div className="whitespace-pre-wrap text-sm">{active.audit}</div>
            </CardContent>
          </Card>
        ) : null}
        {active.changes ? (
          <Card>
            <CardContent className="py-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Что изменено</div>
              <div className="whitespace-pre-wrap text-sm">{active.changes}</div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function HistoryView({
  refinements,
  onActivate,
  onDelete,
  onDownload,
  busyActivate,
  busyDelete,
}: {
  refinements: Refinement[];
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
  busyActivate: string | null;
  busyDelete: string | null;
}) {
  if (!refinements.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Ещё нет версий AI-доработки.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {refinements.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.isActive ? "default" : "outline"}>v{r.version}</Badge>
                <StatusBadge status={r.status} />
                {r.isActive ? <Badge variant="secondary">активна</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ru-RU")} · {r.model ?? "—"}
                </span>
              </div>
              {r.brief ? (
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.brief}</div>
              ) : null}
              {r.status === "failed" && r.error ? (
                <div className="mt-1 text-xs text-destructive">{r.error}</div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              {r.status === "ready" && !r.isActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onActivate(r.id)}
                  disabled={busyActivate === r.id}
                >
                  {busyActivate === r.id ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Сделать активной
                </Button>
              ) : null}
              {r.status === "ready" ? (
                <Button size="sm" variant="outline" onClick={() => onDownload(r.id)}>
                  <Download className="mr-2 h-3.5 w-3.5" /> ZIP
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(r.id)}
                disabled={busyDelete === r.id}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    processing: { label: "обрабатывается", variant: "secondary" },
    ready: { label: "готово", variant: "default" },
    failed: { label: "ошибка", variant: "destructive" },
  };
  const m = map[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={m.variant} className="gap-1">
      {status === "processing" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {m.label}
    </Badge>
  );
}

function pickOriginalHtml(files: Files): string {
  const preferred = Object.keys(files).find((p) => /index\.html?$/i.test(p));
  if (preferred && typeof files[preferred].content === "string") return files[preferred].content!;
  const page = Object.keys(files).find((p) => /page\.tsx?$/.test(p));
  if (page && typeof files[page].content === "string") return files[page].content!;
  const anyText = Object.entries(files).find(([, v]) => typeof v.content === "string");
  return anyText?.[1].content ?? "";
}

function DiffView({ original, refined }: { original: string; refined: string }) {
  const lines = useMemo(() => computeLineDiff(original, refined), [original, refined]);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        Простой построчный diff. Слева — исходная страница клона, справа — AI-версия.
      </div>
      <div className="grid max-h-[75vh] grid-cols-2 overflow-auto font-mono text-xs">
        <div className="border-r border-border">
          <div className="sticky top-0 border-b border-border bg-background px-3 py-1.5 text-[11px] font-semibold">
            Оригинал
          </div>
          {lines.map((l, i) =>
            l.kind === "add" ? (
              <div key={i} className="min-h-[1.25rem] bg-muted/20 px-3" />
            ) : (
              <div
                key={i}
                className={`whitespace-pre-wrap px-3 ${
                  l.kind === "del" ? "bg-destructive/15 text-destructive-foreground" : ""
                }`}
              >
                {l.text || " "}
              </div>
            ),
          )}
        </div>
        <div>
          <div className="sticky top-0 border-b border-border bg-background px-3 py-1.5 text-[11px] font-semibold">
            AI-версия
          </div>
          {lines.map((l, i) =>
            l.kind === "del" ? (
              <div key={i} className="min-h-[1.25rem] bg-muted/20 px-3" />
            ) : (
              <div
                key={i}
                className={`whitespace-pre-wrap px-3 ${
                  l.kind === "add" ? "bg-emerald-500/15" : ""
                }`}
              >
                {l.text || " "}
              </div>
            ),
          )}
        </div>
      </div>
    </Card>
  );
}

type DiffLine = { kind: "eq" | "add" | "del"; text: string };
function computeLineDiff(a: string, b: string): DiffLine[] {
  const A = a.split("\n").slice(0, 4000);
  const B = b.split("\n").slice(0, 4000);
  // LCS with rolling arrays, bounded.
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const out: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      out.push({ kind: "eq", text: A[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ kind: "del", text: A[i - 1] });
      i--;
    } else {
      out.push({ kind: "add", text: B[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    out.push({ kind: "del", text: A[--i] });
  }
  while (j > 0) {
    out.push({ kind: "add", text: B[--j] });
  }
  return out.reverse();
}

function SourceView({
  paths,
  files,
  activePath,
  activeEntry,
  onSelect,
}: {
  paths: string[];
  files: Files;
  activePath: string | null;
  activeEntry: FileEntry | null;
  onSelect: (p: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card className="max-h-[75vh] overflow-auto">
        <CardContent className="py-3">
          <ul className="space-y-0.5 font-mono text-xs">
            {paths.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className={`w-full truncate rounded px-2 py-1 text-left transition-colors hover:bg-muted ${
                    p === activePath
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                  title={p}
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {activePath ?? "Выберите файл"}
        </div>
        {activeEntry && typeof activeEntry.content === "string" ? (
          <pre className="max-h-[70vh] overflow-auto bg-background p-4 text-xs leading-relaxed">
            <code>{activeEntry.content}</code>
          </pre>
        ) : activeEntry?.url ? (
          <div className="p-6 text-sm text-muted-foreground">
            Бинарный файл ({activeEntry.bytes ? `${activeEntry.bytes} байт` : "неизвестный размер"}). Доступен через ZIP.
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Пусто</div>
        )}
      </Card>
    </div>
  );
}

function FilesList({ paths, files }: { paths: string[]; files: Files }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 text-sm text-muted-foreground">Всего файлов: {paths.length}</div>
        <ul className="space-y-1 font-mono text-xs">
          {paths.map((p) => {
            const e = files[p];
            const isBin = e?.type === "binary" || (!e?.content && !!e?.url);
            return (
              <li key={p} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
                <span className="truncate">{p}</span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {isBin ? <Badge variant="outline">binary</Badge> : null}
                  <span>{e?.bytes ? `${e.bytes} Б` : ""}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function triggerDownload(filename: string, contentType: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
