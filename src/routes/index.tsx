import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Boxes,
  Braces,
  Check,
  Download,
  FileCode2,
  GitCompare,
  History,
  Layers,
  Plug,
  Rocket,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wand2,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clone Studio — копия сайта и AI-редизайн за минуты" },
      {
        name: "description",
        content:
          "Заберите полную копию любого сайта, соберите на её основе улучшенную AI-версию, сравните построчно и скачайте ZIP. Подключайте своих агентов по MCP и Omniroute.",
      },
      { property: "og:title", content: "Clone Studio — копия сайта и AI-редизайн" },
      {
        property: "og:description",
        content:
          "Полная копия сайта, AI-доработка с версионированием, diff и экспорт в ZIP. MCP-агенты и Omniroute на борту.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PIPELINE = [
  {
    icon: Terminal,
    step: "01",
    title: "Забираем оригинал",
    text: "Отдаёте ссылку — движок обходит страницу, вытягивает разметку, стили, скрипты и медиа в структурированное дерево файлов.",
  },
  {
    icon: Layers,
    step: "02",
    title: "Раскладываем по полкам",
    text: "Копия попадает в приватное хранилище: манифест файлов, размеры, исходники доступны прямо в браузере без скачивания.",
  },
  {
    icon: Wand2,
    step: "03",
    title: "Пересобираем с AI",
    text: "Модель читает реальный код страницы, а не скриншот: правит иерархию, типографику, сетку, отклик и доступность.",
  },
  {
    icon: GitCompare,
    step: "04",
    title: "Сверяете и забираете",
    text: "Построчный diff, история версий, откат в один клик и ZIP со всеми связанными файлами вместе с новым HTML.",
  },
];

const FEATURES = [
  {
    icon: FileCode2,
    title: "Копия целиком",
    text: "Не «похожая вёрстка», а фактический набор файлов страницы с путями и размерами.",
  },
  {
    icon: History,
    title: "Версии и откат",
    text: "Каждая AI-доработка сохраняется отдельной версией. Активируйте любую, старые остаются на месте.",
  },
  {
    icon: GitCompare,
    title: "Diff по строкам",
    text: "Видно, что именно поменяла модель в разметке — без догадок и «доверься мне».",
  },
  {
    icon: Download,
    title: "ZIP одной кнопкой",
    text: "Исходники, preview.html и README со списком изменений — готово к передаче разработчику.",
  },
  {
    icon: Plug,
    title: "MCP-агенты",
    text: "Подключайте сторонние MCP-серверы и выбирайте конкретные tools для конкретной задачи.",
  },
  {
    icon: Zap,
    title: "Omniroute по ключу",
    text: "Свои локальные агенты Omniroute — через API-ключ и публичный endpoint туннеля.",
  },
];

const PRESETS = [
  "Модернизация 2026",
  "Конверсия и оффер",
  "Премиум-бренд",
  "Mobile-first",
  "SEO и доступность",
  "Скорость загрузки",
];

function Landing() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  const cta = authed ? "/app" : "/auth";

  return (
    <div className="min-h-screen bg-background">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo size="md" />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#pipeline" className="transition-colors hover:text-foreground">
              Как это работает
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              Возможности
            </a>
            <a href="#agents" className="transition-colors hover:text-foreground">
              Агенты
            </a>
          </nav>
          <Link to={cta}>
            <Button size="sm">
              {authed ? "В рабочую область" : "Начать"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="grid-pattern absolute inset-0 opacity-[0.35]" aria-hidden="true" />
        <div className="hero-halo absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:pt-24">
          <Badge variant="outline" className="fade-up mb-8 gap-2 py-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Копия сайта → разбор → новая версия
          </Badge>

          <div className="hero-logo fade-up mx-auto w-full">
            <Logo size="hero" className="justify-center" />
          </div>

          <p className="fade-up-delay-1 mx-auto mt-8 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
            Скопируйте чужую страницу целиком, разберите её по файлам и соберите свою — лучше.
            Не косметика поверх скриншота, а работа по настоящему коду сайта.
          </p>

          <div className="fade-up-delay-2 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to={cta} className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                <Rocket className="mr-2 h-4 w-4" />
                Клонировать первый сайт
              </Button>
            </Link>
            <a href="#pipeline" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Посмотреть процесс
              </Button>
            </a>
          </div>

          <div className="fade-up-delay-3 mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Один URL", "и весь исходник"],
              ["N версий", "с откатом"],
              ["Diff", "по строкам"],
              ["MCP", "свои агенты"],
            ].map(([a, b]) => (
              <div
                key={a}
                className="rounded-xl border border-border/70 bg-card/40 px-3 py-4 backdrop-blur"
              >
                <div className="font-display text-lg font-semibold">{a}</div>
                <div className="text-xs text-muted-foreground">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PIPELINE */}
      <section id="pipeline" className="border-b border-border py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Маршрут
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              От чужой ссылки до своей версии
            </h2>
            <p className="mt-3 text-muted-foreground">
              Четыре шага, каждый виден в интерфейсе: ничего не происходит «где-то в облаке» без
              вашего контроля.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {PIPELINE.map((s, i) => (
              <div
                key={s.step}
                className={`tile-hover relative rounded-2xl border border-border bg-card p-6 fade-up-delay-${Math.min(i, 3)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{s.step}</span>
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-b border-border py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Внутри
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Инструменты, а не демо
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="tile-hover rounded-2xl border border-border bg-card p-6"
              >
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-medium">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AGENTS */}
      <section id="agents" className="border-b border-border py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Экосистема
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Ваши агенты работают вместе с нашим
            </h2>
            <p className="mt-3 text-muted-foreground">
              Clone Studio не запирает вас в одной модели. Подключите MCP-сервер, выберите нужные
              tools — они выполнятся перед доработкой, а их вывод попадёт в контекст. Локальный
              Omniroute подключается личным API-ключом.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "MCP по HTTP и SSE, bearer-токен, диагностика подключения",
                "Выбор конкретных tools под конкретную задачу",
                "Таймлайн вызовов: аргументы и ответы раскрываются прямо в UI",
                "Готовые AI-профили доработки под цель — от конверсии до скорости",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Boxes className="h-4 w-4 text-primary" /> Профили доработки
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Badge key={p} variant="secondary" className="py-1">
                  {p}
                </Badge>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <Braces className="h-3.5 w-3.5" /> refine.run()
              </div>
              <div className="mt-2 space-y-1">
                <div>→ mcp: omniroute/audit_page ✓</div>
                <div>→ mcp: design/tokens_extract ✓</div>
                <div>→ model: генерация preview.html ✓</div>
                <div className="text-primary">← версия v3 сохранена</div>
              </div>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Ключи и артефакты хранятся приватно и доступны только вашему аккаунту.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-24">
        <div className="dot-pattern absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <Logo size="xl" className="justify-center" />
          <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Один URL — и у вас есть с чем работать
          </h2>
          <p className="mt-3 text-muted-foreground">
            Регистрация занимает минуту, первый клон — меньше.
          </p>
          <Link to={cta} className="mt-8 inline-block">
            <Button size="lg">
              Начать сейчас <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row">
          <Logo size="sm" />
          <span>Клонирование, разбор и AI-доработка сайтов</span>
        </div>
      </footer>
    </div>
  );
}
