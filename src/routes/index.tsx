import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Boxes, Gauge, Sparkles, Code2, Wand2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clone Studio — клонирование сайтов и AI-доработка" },
      {
        name: "description",
        content:
          "Вставьте URL — получите чистый Next.js или Vite проект за минуты, а затем детально доработайте страницу с помощью AI. На базе open-source движка ditto.",
      },
      { property: "og:title", content: "Clone Studio — клонирование сайтов и AI-доработка" },
      {
        property: "og:description",
        content: "Вставьте URL — получите чистый Next.js или Vite проект за минуты, а затем детально доработайте страницу с помощью AI. На базе open-source движка ditto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const ctaTo = signedIn ? "/app" : "/auth";
  const ctaLabel = signedIn ? "Открыть Clone Studio" : "Начать бесплатно";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm">
              D
            </span>
            Clone Studio
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <a
              className="hidden text-muted-foreground hover:text-foreground sm:inline"
              href="https://github.com/ion-design/ditto.site"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <Link to={ctaTo}>
              <Button size="sm">{signedIn ? "Открыть приложение" : "Войти"}</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> На базе open-source движка ditto
          </div>
          <h1 className="mx-auto max-w-3xl text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Клонируйте любой сайт. Улучшайте с AI.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Вставьте URL — получите настоящий, компонентизированный проект на{" "}
            <span className="text-foreground">Next.js</span> или <span className="text-foreground">Vite</span> примерно за
            5 минут. Затем запустите AI-доработку и получите готовую HTML-страницу, которую можно открыть в браузере.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={ctaTo}>
              <Button size="lg" className="gap-2">
                {ctaLabel} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="outline">
                Как это работает
              </Button>
            </a>
          </div>
          <div className="mx-auto mt-14 max-w-3xl rounded-xl border border-border bg-card p-5 text-left shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-destructive/70" />
              <span className="h-2 w-2 rounded-full bg-chart-4/70" />
              <span className="h-2 w-2 rounded-full bg-chart-2/70" />
              <span className="ml-2">clone-studio · новая задача</span>
            </div>
            <pre className="overflow-x-auto rounded-md bg-secondary p-4 text-sm text-foreground">
{`POST /v1/clones
{
  "url": "https://example.com",
  "options": {
    "mode": "single",
    "framework": "next",
    "styling": "tailwind"
  }
}
→ 202 { "jobId": "clone_...", "status": "queued" }`}
            </pre>
          </div>
        </section>

        <section id="how" className="border-t border-border bg-secondary/30">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={<Gauge className="h-5 w-5" />} title="Детерминированно">
              Не LLM-догадка. Один и тот же URL даёт один и тот же стабильный проект.
            </Feature>
            <Feature icon={<Boxes className="h-5 w-5" />} title="Компонентизировано">
              Повторяющийся DOM превращается в компоненты. Секции, токены, шрифты — всё извлечено.
            </Feature>
            <Feature icon={<Code2 className="h-5 w-5" />} title="Настоящий проект">
              Типизированный TypeScript, Tailwind или CSS, роуты, SEO — готово к разработке.
            </Feature>
            <Feature icon={<Wand2 className="h-5 w-5" />} title="AI-доработка">
              На основе полной копии AI проводит аудит и выдаёт улучшенную HTML-страницу для просмотра в браузере.
            </Feature>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
            <h2 className="text-3xl font-semibold">Соберите следующий клон за минуты.</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Отслеживайте каждую задачу, скачивайте архив и открывайте AI-версию прямо в браузере.
            </p>
            <div className="mt-6">
              <Link to={ctaTo}>
                <Button size="lg" className="gap-2">
                  {ctaLabel} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <div>
            Clone Studio — на базе{" "}
            <a className="underline hover:text-foreground" href="https://www.ditto.site" target="_blank" rel="noreferrer">
              ditto
            </a>
            .
          </div>
          <div>MIT-лицензия движка.</div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
