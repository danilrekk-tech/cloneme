import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2,
  Terminal,
} from "lucide-react";

export type TimelineCall = {
  serverName?: string;
  toolName: string;
  args?: Record<string, any>;
  ok?: boolean;
  ms?: number;
  output?: string;
  error?: string;
  startedAt?: string;
};

/** Таймлайн вызовов MCP-инструментов с раскрытием деталей. */
export function McpToolTimeline({
  calls,
  running = false,
  title = "Вызовы MCP-инструментов",
}: {
  calls: TimelineCall[];
  running?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  if (!running && calls.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Terminal className="h-3.5 w-3.5" />
        {title}
        <Badge variant="outline" className="h-4 px-1 text-[10px]">
          {calls.length}
        </Badge>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      </div>

      <ol className="mt-2 space-y-1.5 border-l border-border pl-3">
        {calls.map((c, i) => {
          const isOpen = !!open[i];
          return (
            <li key={`${c.toolName}-${i}`} className="relative">
              <span
                className={`absolute -left-[17px] top-2 h-2 w-2 rounded-full ${
                  c.ok ? "bg-emerald-500" : "bg-destructive"
                }`}
              />
              <button
                type="button"
                onClick={() => setOpen((s) => ({ ...s, [i]: !s[i] }))}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted/60"
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                {c.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
                <span className="truncate font-mono font-medium">{c.toolName}</span>
                {c.serverName ? (
                  <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                    {c.serverName}
                  </Badge>
                ) : null}
                {typeof c.ms === "number" ? (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{c.ms} мс</span>
                ) : null}
              </button>

              {isOpen ? (
                <div className="ml-6 space-y-2 pb-2 text-[11px]">
                  {c.args ? (
                    <div>
                      <div className="text-muted-foreground">Аргументы</div>
                      <pre className="mt-0.5 max-h-32 overflow-auto rounded bg-background p-2 font-mono">
                        {JSON.stringify(c.args, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  {c.error ? (
                    <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                      {c.error}
                    </div>
                  ) : null}
                  {c.output ? (
                    <div>
                      <div className="text-muted-foreground">Результат</div>
                      <pre className="mt-0.5 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono">
                        {c.output}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
