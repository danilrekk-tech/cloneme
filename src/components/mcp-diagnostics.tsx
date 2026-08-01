import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  diagnoseMcpServer,
  type DiagResult,
  type DiagStep,
} from "@/lib/mcp.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MinusCircle,
  RotateCw,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";

function StepIcon({ status }: { status: DiagStep["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "fail") return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (status === "warn") return <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />;
  return <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

/** Пошаговая диагностика MCP-подключения с понятными ошибками и кнопкой «Повторить». */
export function McpDiagnostics({
  serverId,
  url,
  token,
  compact = false,
}: {
  serverId?: string;
  url?: string;
  token?: string | null;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const diagFn = useServerFn(diagnoseMcpServer);
  const [result, setResult] = useState<DiagResult | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      diagFn({
        data: serverId ? { id: serverId } : { url: url ?? "", auth_token: token ?? null },
      }) as Promise<DiagResult>,
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ["mcp_servers"] });
    },
    onError: (e: any) =>
      setResult({
        ok: false,
        tools: [],
        steps: [
          {
            key: "fatal",
            label: "Диагностика",
            status: "fail",
            detail: String(e?.message ?? e).slice(0, 300),
          },
        ],
        hint: "Проверьте, что сервер сохранён, и повторите попытку.",
      }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={compact ? "ghost" : "outline"}
          onClick={() => mut.mutate()}
          disabled={mut.isPending || (!serverId && !url)}
        >
          {mut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Stethoscope className="mr-2 h-4 w-4" />
          )}
          Диагностика
        </Button>
        {result ? (
          <Badge variant={result.ok ? "default" : "destructive"}>
            {result.ok ? "Подключение работает" : "Есть проблемы"}
          </Badge>
        ) : null}
        {result && !result.ok ? (
          <Button size="sm" variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending}>
            <RotateCw className="mr-2 h-3.5 w-3.5" /> Повторить
          </Button>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          {result.steps.map((s) => (
            <div key={s.key} className="flex items-start gap-2 text-xs">
              <StepIcon status={s.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {s.label}
                  {typeof s.ms === "number" ? (
                    <span className="text-[10px] font-normal text-muted-foreground">{s.ms} мс</span>
                  ) : null}
                </div>
                <div className="mt-0.5 break-words text-muted-foreground">{s.detail}</div>
              </div>
            </div>
          ))}
          {result.hint ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs text-foreground/80">
              Подсказка: {result.hint}
            </div>
          ) : null}
          {result.tools.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {result.tools.slice(0, 14).map((t) => (
                <Badge key={t.name} variant="outline" className="font-mono text-[10px]">
                  {t.name}
                </Badge>
              ))}
              {result.tools.length > 14 ? (
                <span className="text-[10px] text-muted-foreground">
                  +{result.tools.length - 14} ещё
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
