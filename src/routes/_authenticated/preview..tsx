
type Concept = {
  id: string;
  batch_id: string;
  idx: number;
  title: string;
  summary: string;
  spec: any;
  status: string;
  error: string | null;
  created_at: string;
  imageUrl: string | null;
};

function ConceptsView({
  concepts,
  loading,
  generating,
  onGenerate,
  onRecreate,
  recreatingId,
}: {
  concepts: Concept[];
  loading: boolean;
  generating: boolean;
  onGenerate: (brief: string) => void;
  onRecreate: (conceptId: string) => void;
  recreatingId: string | null;
}) {
  const [brief, setBrief] = useState("");
  const batches = useMemo(() => {
    const map = new Map<string, Concept[]>();
    for (const c of concepts) {
      const list = map.get(c.batch_id) ?? [];
      list.push(c);
      map.set(c.batch_id, list);
    }
    return [...map.entries()].map(([id, list]) => ({
      id,
      list: list.sort((a, b) => a.idx - b.idx),
    }));
  }, [concepts]);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Пожелания к дизайну (необязательно)
            </label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={2}
              placeholder="Например: премиальный минимализм, тёмная тема, крупная типографика"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button onClick={() => onGenerate(brief)} disabled={generating} className="sm:shrink-0">
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Создать 3 варианта
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем варианты…
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Вариантов пока нет. Сгенерируйте три направления дизайна — затем выберите один, и он будет
            воссоздан один в один интерактивной страницей.
          </CardContent>
        </Card>
      ) : (
        batches.map((b) => (
          <div key={b.id} className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Набор от {new Date(b.list[0].created_at).toLocaleString("ru-RU")}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {b.list.map((c) => (
                <Card key={c.id} className="flex flex-col overflow-hidden">
                  {c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt={`Вариант дизайна: ${c.title}`}
                      loading="lazy"
                      className="aspect-[16/10] w-full bg-muted object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[16/10] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                      {c.error ?? "Превью не сгенерировано"}
                    </div>
                  )}
                  <CardContent className="flex flex-1 flex-col gap-2 py-4">
                    <div className="text-sm font-semibold">{c.title}</div>
                    <p className="flex-1 text-xs text-muted-foreground">{c.summary}</p>
                    {Array.isArray(c.spec?.palette) && c.spec.palette.length ? (
                      <div className="flex gap-1">
                        {c.spec.palette.slice(0, 6).map((h: string, i: number) => (
                          <span
                            key={i}
                            className="h-4 w-4 rounded-full border border-border"
                            style={{ backgroundColor: h }}
                            title={h}
                          />
                        ))}
                      </div>
                    ) : null}
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => onRecreate(c.id)}
                      disabled={recreatingId === c.id}
                    >
                      {recreatingId === c.id ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-3.5 w-3.5" />
                      )}
                      Воссоздать
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function buildLiveDoc(files: Files, sourceUrl: string): string | null {
  const path = Object.keys(files).find((p) => /index\.html?$/i.test(p));
  const html = path ? files[path]?.content : undefined;
  if (typeof html !== "string" || !html.trim()) return null;
  let base = "";
  try {
    base = new URL(sourceUrl).origin + "/";
  } catch {
    base = "";
  }
  if (!base) return html;
  return /<base\s/i.test(html)
    ? html
    : html.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`);
}

function LiveView({ files, sourceUrl }: { files: Files; sourceUrl: string }) {
  const doc = useMemo(() => buildLiveDoc(files, sourceUrl), [files, sourceUrl]);
  if (!doc) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          В клоне нет готового HTML-файла для прямого рендера — откройте вкладку «Исходники» или
          скачайте ZIP проекта.
        </CardContent>
      </Card>
    );
  }
  function openInNewTab() {
    const blob = new Blob([doc!], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">Клонированная страница · {sourceUrl}</span>
        <Button size="sm" variant="ghost" onClick={openInNewTab}>
          Открыть в новой вкладке
        </Button>
      </div>
      <iframe
        title="Клонированная страница"
        srcDoc={doc}
        sandbox="allow-scripts allow-same-origin"
        className="h-[75vh] w-full bg-white"
      />
    </Card>
  );
}
