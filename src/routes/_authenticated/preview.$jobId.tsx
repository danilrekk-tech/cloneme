import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getCloneFiles } from "@/lib/ditto.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowLeft, Code2, FileText, Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/preview/$jobId")({
  head: () => ({ meta: [{ title: "Просмотр клона — Clone Studio" }] }),
  component: PreviewPage,
});

type FileEntry = { type?: string; content?: string; url?: string; bytes?: number };
type Files = Record<string, FileEntry>;

function PreviewPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const getFilesFn = useServerFn(getCloneFiles);

  const q = useQuery({
    queryKey: ["clone_preview", jobId],
    queryFn: () => getFilesFn({ data: { id: jobId } }) as Promise<{
      sourceUrl: string;
      files: Files;
      refined: { previewHtml?: string; audit?: string; changes?: string; brief?: string | null } | null;
    }>,
    staleTime: 60_000,
  });

  const [tab, setTab] = useState<"refined" | "source" | "files">("refined");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const files = q.data?.files ?? {};
  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const activePath = selectedPath ?? paths.find((p) => /page\.tsx?$|index\.html?$/.test(p)) ?? paths[0] ?? null;
  const activeEntry = activePath ? files[activePath] : null;
  const hasRefined = !!q.data?.refined?.previewHtml;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app" })}>
              <ArrowLeft className="mr-2 h-4 w-4" /> К задачам
            </Button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{q.data?.sourceUrl ?? "…"}</div>
              <div className="text-xs text-muted-foreground">Просмотр результата клонирования</div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/50 p-0.5">
            <TabBtn active={tab === "refined"} onClick={() => setTab("refined")} disabled={!hasRefined}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI-версия
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
            <RefinedView data={q.data!.refined!} />
          ) : (
            <EmptyRefined onSource={() => setTab("source")} />
          )
        ) : tab === "source" ? (
          <SourceView paths={paths} activePath={activePath} activeEntry={activeEntry} onSelect={setSelectedPath} />
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
        <p>AI-версия ещё не сгенерирована для этой задачи.</p>
        <p className="mt-1">Вернитесь к задачам и нажмите «AI-доработка», либо посмотрите исходный код клона.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/app">
            <Button size="sm">К задачам</Button>
          </Link>
          <Button size="sm" variant="outline" onClick={onSource}>
            Открыть исходники
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RefinedView({
  data,
}: {
  data: { previewHtml?: string; audit?: string; changes?: string; brief?: string | null };
}) {
  function openInNewTab() {
    if (!data.previewHtml) return;
    const blob = new Blob([data.previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  function download() {
    if (!data.previewHtml) return;
    const blob = new Blob([data.previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "refined-preview.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-destructive/70" />
            <span className="h-2 w-2 rounded-full bg-chart-4/70" />
            <span className="h-2 w-2 rounded-full bg-chart-2/70" />
            <span className="ml-2">refined-preview.html</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={openInNewTab}>
              Открыть в новой вкладке
            </Button>
            <Button size="sm" variant="outline" onClick={download}>
              Скачать HTML
            </Button>
          </div>
        </div>
        <iframe
          title="AI preview"
          srcDoc={data.previewHtml}
          sandbox="allow-scripts allow-same-origin"
          className="h-[70vh] w-full bg-white"
        />
      </Card>
      <div className="space-y-3">
        {data.brief ? (
          <Card>
            <CardContent className="py-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Бриф</div>
              <div className="text-sm whitespace-pre-wrap">{data.brief}</div>
            </CardContent>
          </Card>
        ) : null}
        {data.audit ? (
          <Card>
            <CardContent className="py-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Аудит</div>
              <div className="text-sm whitespace-pre-wrap">{data.audit}</div>
            </CardContent>
          </Card>
        ) : null}
        {data.changes ? (
          <Card>
            <CardContent className="py-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Что изменено</div>
              <div className="text-sm whitespace-pre-wrap">{data.changes}</div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function SourceView({
  paths,
  activePath,
  activeEntry,
  onSelect,
}: {
  paths: string[];
  activePath: string | null;
  activeEntry: FileEntry | null;
  onSelect: (p: string) => void;
}) {
  const textPaths = paths.filter((p) => {
    const e = { ...(({} as Files)[p] ?? {}) };
    return true; // filter later per entry
  });
  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card className="max-h-[75vh] overflow-auto">
        <CardContent className="py-3">
          <ul className="space-y-0.5 font-mono text-xs">
            {textPaths.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className={`w-full truncate rounded px-2 py-1 text-left transition-colors hover:bg-muted ${
                    p === activePath ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
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
            Бинарный файл ({activeEntry.bytes ? `${activeEntry.bytes} байт` : "неизвестный размер"}). Доступен через
            загрузку .zip.
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
