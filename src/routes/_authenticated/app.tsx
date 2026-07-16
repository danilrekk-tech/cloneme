import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createCloneJob, listCloneJobs, refreshCloneJob, downloadCloneBundle } from "@/lib/ditto.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, LogOut, Download, Sparkles, AlertCircle, ChevronDown, ChevronUp, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Clone Studio — Ditto Clone Studio" },
      { name: "description", content: "Submit any URL and get clean, componentized Next.js or Vite code back." },
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
  created_at: string;
  updated_at: string;
};

function AppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createFn = useServerFn(createCloneJob);
  const listFn = useServerFn(listCloneJobs);
  const refreshFn = useServerFn(refreshCloneJob);
  const downloadFn = useServerFn(downloadCloneBundle);

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [framework, setFramework] = useState<"next" | "vite">("next");
  const [styling, setStyling] = useState<"tailwind" | "css">("tailwind");

  const jobsQuery = useQuery({
    queryKey: ["clone_jobs"],
    queryFn: () => listFn(),
    refetchInterval: (q) => {
      const jobs = (q.state.data as Job[] | undefined) ?? [];
      const active = jobs.some((j) => !["done", "succeeded", "failed", "error", "cancelled"].includes(j.status));
      return active ? 4000 : false;
    },
  });

  const createMut = useMutation({
    mutationFn: (input: { url: string; mode: "single" | "multi"; framework: "next" | "vite"; styling: "tailwind" | "css" }) =>
      createFn({ data: input }),
    onSuccess: () => {
      toast.success("Clone job submitted");
      setUrl("");
      setUrlError(null);
      queryClient.invalidateQueries({ queryKey: ["clone_jobs"] });
    },
    onError: (e) => {
      const { title, description } = friendlyError(e, "Failed to submit job");
      toast.error(title, { description });
    },
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clone_jobs"] }),
    onError: (e) => {
      const { title, description } = friendlyError(e, "Failed to refresh");
      toast.error(title, { description });
    },
  });

  // Auto-refresh in-progress jobs' events from Ditto (server-side poll).
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm">D</span>
            Clone Studio
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{email}</span>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Clone a website
            </CardTitle>
            <CardDescription>
              Paste any URL. Ditto returns clean, componentized {framework === "next" ? "Next.js" : "Vite"} code within ~5 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">Website URL</Label>
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
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single page</SelectItem>
                      <SelectItem value="multi">Multi page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Framework</Label>
                  <Select value={framework} onValueChange={(v) => setFramework(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="next">Next.js</SelectItem>
                      <SelectItem value="vite">Vite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Styling</Label>
                  <Select value={styling} onValueChange={(v) => setStyling(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tailwind">Tailwind</SelectItem>
                      <SelectItem value="css">Plain CSS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={createMut.isPending} className="w-full sm:w-auto">
                {createMut.isPending ? "Submitting…" : "Start cloning"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your jobs</h2>
            <Button variant="ghost" size="sm" onClick={() => jobsQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
          {jobsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : jobs.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No jobs yet. Submit a URL above to get started.
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
                  onDownload={() => downloadJob(j.id, downloadFn)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

async function downloadJob(
  id: string,
  fn: (args: { data: { id: string } }) => Promise<{ filename: string; contentType: string; base64: string }>,
) {
  try {
    toast.info("Preparing download…");
    const res = await fn({ data: { id } });
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
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Download failed");
  }
}

function JobRow({
  job,
  onRefresh,
  refreshing,
  onDownload,
}: {
  job: Job;
  onRefresh: () => void;
  refreshing: boolean;
  onDownload: () => void;
}) {
  const done = ["done", "succeeded"].includes(job.status);
  const failed = ["failed", "error", "cancelled"].includes(job.status);
  const variant: "default" | "secondary" | "destructive" | "outline" =
    done ? "default" : failed ? "destructive" : "secondary";
  const fileCount: number | undefined = job.result?.files?.count;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={variant} className="capitalize">{job.status}</Badge>
            <span className="text-xs text-muted-foreground">
              {job.framework} · {job.styling} · {job.mode}
              {fileCount ? ` · ${fileCount} files` : ""}
            </span>
          </div>
          <div className="mt-1 truncate text-sm font-medium">{job.source_url}</div>
          {job.error ? (
            <div className="mt-1 truncate text-xs text-destructive">{job.error}</div>
          ) : job.last_event?.message ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">{String(job.last_event.message)}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {done ? (
            <Button size="sm" onClick={onDownload}>
              <ExternalLink className="mr-2 h-4 w-4" /> Download .tgz
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Update
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

