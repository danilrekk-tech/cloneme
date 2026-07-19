import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import {
  ArrowRight,
  Boxes,
  Gauge,
  Sparkles,
  Code2,
  Wand2,
  Plug,
  Github,
  Menu,
  X,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clone Studio — клонирование сайтов и AI-доработка" },
      {
        name: "description",
        content:
          "Вставьте URL — получите чистый Next.js или Vite проект за минуты. AI-доработка на базе полной копии сайта. Подключение сторонних агентов через MCP (Omniroute).",
      },
      { property: "og:title", content: "Clone Studio — клонирование сайтов и AI-доработка" },
      {
        property: "og:description",
        content:
          "Вставьте URL — получите чистый Next.js или Vite проект за минуты. AI-доработка на базе полной копии. Подключение MCP-агентов.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const ctaTo = signedIn ? "/app" : "/auth";
  const ctaLabel = signedIn ? "Открыть Clone Studio" : "Начать бесплатно";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ============= NAV ============= */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:py-4">
          <Link to="/" className="shrink-0" aria-label="Clone Studio">
            <Logo size="md" />
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">
              Как работает
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              Возможности
            </a>
            <a href="#mcp" className="transition-colors hover:text-foreground">
              MCP-агенты
            </a>
            <a
              href="https://github.com/ion-design/ditto.site"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" /> GitHub
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link to={ctaTo} className="hidden sm:block">
              <Button size="sm" className="rounded-full px-4">
                {signedIn ? "Открыть" : "Войти"}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Меню"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-border/60 bg-background md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col px-4 py-3 text-sm">
              <a
                href="#how"
                onClick={() => setMenuOpen(false)}
                className="py-2.5 text-foreground/80 transition-colors hover:text-foreground"
              >
                Как работает
              </a>
              <a
                href="#features"
                onClick={() => setMenuOpen(false)}
                className="py-2.5 text-foreground/80 transition-colors hover:text-foreground"
              >
                Возможности
              </a>
              <a
                href="#mcp"
                onClick={() => setMenuOpen(false)}
                className="py-2.5 text-foreground/80 transition-colors hover:text-foreground"
              >
                MCP-агенты
              </a>
              <a
                href="https://github.com/ion-design/ditto.site"
                target="_blank"
                rel="noreferrer"
                className="py-2.5 text-foreground/80"
              >
                GitHub
              </a>
              <Link to={ctaTo} onClick={() => setMenuOpen(false)}>
                <Button className="mt-2 w-full">{ctaLabel}</Button>
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* ============= HERO ============= */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-pattern" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] hero-halo" aria-hidden />

        <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24 lg:pt-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
            <div className="fade-up">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground animate-pulse" />
                Открытая версия · движок ditto
              </div>
              <h1 className="font-display text-[2.5rem] font-semibold leading-[0.98] tracking-tight sm:text-6xl lg:text-[4.5rem]">
                Клонируйте любой сайт.
                <br />
                <span className="text-muted-foreground">Улучшайте с AI-агентами.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
                Вставьте URL — получите настоящий, компонентизированный проект на Next.js или Vite за ~5 минут.
                Затем запустите AI-доработку по вашему брифу с подключением сторонних агентов через MCP
                (в том числе Omniroute).
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to={ctaTo} className="w-full sm:w-auto">
                  <Button size="lg" className="group w-full rounded-full px-6 sm:w-auto">
                    {ctaLabel}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <a href="#how" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full rounded-full px-6 sm:w-auto">
                    Как это работает
                  </Button>
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Без vendor lock-in
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Скачивание ZIP
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Версионирование правок
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> MCP-совместимость
                </span>
              </div>
            </div>

            {/* Terminal-ish preview card */}
            <div className="fade-up rounded-2xl border border-border bg-card/80 p-4 shadow-[0_20px_60px_-20px_rgb(0,0,0,0.15)] backdrop-blur">
              <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-destructive/60" />
                <span className="h-2 w-2 rounded-full bg-chart-4/60" />
                <span className="h-2 w-2 rounded-full bg-chart-2/60" />
                <span className="ml-1 font-mono">clone-studio ~ new job</span>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-secondary/70 p-4 font-mono text-[12.5px] leading-relaxed">
{`POST /v1/clones
{
  "url":     "https://stripe.com/atlas",
  "options": { "framework": "next",
               "styling":   "tailwind" }
}

→ 202  { jobId: "clone_7f2a…" }
   status: queued  →  fetching
                   →  parsing
                   →  ✓ ready  (48 files · 312 KB)

▸ refine  ⌘ /skill:redesign
   audit    → 6 issues
   version  → v1  ready
   mcp      → omniroute (12 tools)`}
              </pre>
            </div>
          </div>

          {/* Marquee */}
          <div className="relative mt-16 overflow-hidden border-y border-border/60 py-4">
            <div className="marquee-track flex w-max gap-12 text-sm text-muted-foreground/80">
              {[...Array(2)].flatMap((_, k) =>
                [
                  "Next.js",
                  "Vite",
                  "Tailwind",
                  "TypeScript",
                  "Supabase",
                  "MCP (Omniroute)",
                  "ditto engine",
                  "Google Gemini 2.5 Pro",
                  "OpenRouter",
                  "Cloudflare Workers",
                ].map((label, i) => (
                  <span key={`${k}-${i}`} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="h-1 w-1 rounded-full bg-foreground/40" />
                    {label}
                  </span>
                )),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============= HOW ============= */}
      <section id="how" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <div className="mb-14 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Как это работает
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              Три шага от ссылки до готовой страницы.
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
            <Step
              n="01"
              title="Вставьте URL"
              desc="Выберите фреймворк и стилизацию. Ditto парсит DOM, извлекает токены, шрифты и компоненты."
            />
            <Step
              n="02"
              title="Получите проект"
              desc="Скачайте ZIP с настоящим TypeScript-кодом. Или откройте исходники прямо в приложении."
            />
            <Step
              n="03"
              title="Улучшите с AI"
              desc="Gemini 2.5 Pro + MCP-агенты проведут аудит и выдадут готовую HTML-версию. Версионирование и rollback включены."
            />
          </div>
        </div>
      </section>

      {/* ============= FEATURES ============= */}
      <section id="features" className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-20 sm:py-28 md:grid-cols-6">
          <Feature
            className="md:col-span-4"
            icon={<Sparkles className="h-4 w-4" />}
            title="Детерминированное клонирование"
            desc="Не LLM-догадка. Один URL → один и тот же стабильный, воспроизводимый проект. Повторяющийся DOM превращается в переиспользуемые компоненты."
            large
          />
          <Feature
            className="md:col-span-2"
            icon={<Gauge className="h-4 w-4" />}
            title="~5 минут"
            desc="Средняя выдача клона для одной страницы."
          />
          <Feature
            className="md:col-span-2"
            icon={<Code2 className="h-4 w-4" />}
            title="Настоящий код"
            desc="Типизированный TypeScript, Tailwind или CSS, SEO, роутинг."
          />
          <Feature
            className="md:col-span-2"
            icon={<Wand2 className="h-4 w-4" />}
            title="AI-доработка"
            desc="Gemini 2.5 Pro читает полную копию и выдаёт улучшенную версию по /skill:redesign."
          />
          <Feature
            className="md:col-span-2"
            icon={<Boxes className="h-4 w-4" />}
            title="Версии + rollback"
            desc="История генераций, diff между версиями, активация одним кликом."
          />
        </div>
      </section>

      {/* ============= MCP ============= */}
      <section id="mcp" className="border-b border-border bg-secondary/40">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:py-28 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <Plug className="h-3.5 w-3.5" /> MCP · Model Context Protocol
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              Подключайте своих агентов.
              <br />
              <span className="text-muted-foreground">Omniroute и всё, что говорит на MCP.</span>
            </h2>
            <p className="mt-5 max-w-lg text-muted-foreground">
              Добавьте URL MCP-сервера прямо в интерфейс. Clone Studio опросит{" "}
              <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">tools/list</code>, покажет
              доступные инструменты и передаст их контекст в AI-доработку — так генерация учитывает знания вашего
              рабочего стека.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {[
                "Streamable HTTP transport (JSON + SSE)",
                "Bearer-токены для приватных серверов",
                "Автоматический опрос списка инструментов",
                "Работает с Omniroute, Linear, Notion, кастомными MCP",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                  <span className="text-foreground/80">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-background p-5">
            <div className="mb-4 flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">mcp_servers</span>
              <span className="rounded-full bg-foreground/5 px-2 py-0.5 font-medium">2 активны</span>
            </div>
            <div className="space-y-3">
              {[
                { name: "Omniroute", url: "https://omniroute.dev/mcp", tools: 12, active: true },
                { name: "Linear", url: "https://mcp.linear.app/sse", tools: 6, active: true },
                { name: "Custom", url: "https://api.acme.io/mcp", tools: 0, active: false },
              ].map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {s.name}
                      {s.active && (
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{s.url}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {s.tools} tools
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============= CTA ============= */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-0 grid-pattern opacity-60" aria-hidden />
          <div className="relative">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              Соберите следующий клон за минуты.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Полная копия + AI-доработка + MCP-агенты. Всё в одном рабочем пространстве.
            </p>
            <div className="mt-8">
              <Link to={ctaTo}>
                <Button size="lg" className="rounded-full px-8">
                  {ctaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============= FOOTER ============= */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Logo size="sm" compact />
            <span className="hidden text-xs sm:inline">· на движке ditto</span>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <a
              href="https://www.ditto.site"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              ditto.site
            </a>
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              MCP spec
            </a>
            <span>MIT-лицензия движка</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="group relative flex flex-col gap-3 bg-background p-8 transition-colors hover:bg-card">
      <div className="font-mono text-xs text-muted-foreground">{n}</div>
      <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
  large,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  large?: boolean;
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-col justify-between gap-6 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/20 " +
        (large ? "sm:p-8 " : "") +
        (className ?? "")
      }
    >
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground">
        {icon}
      </div>
      <div>
        <h3 className={"font-display font-semibold tracking-tight " + (large ? "text-2xl sm:text-3xl" : "text-lg")}>
          {title}
        </h3>
        <p className={"mt-2 text-muted-foreground " + (large ? "text-base max-w-md" : "text-sm")}>{desc}</p>
      </div>
    </div>
  );
}
