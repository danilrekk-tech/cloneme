/**
 * Встроенный клонировщик страниц.
 *
 * Используется, когда внешний сервис Ditto недоступен или держит задачу
 * в очереди: мы сами скачиваем страницу, её CSS и инлайним всё так,
 * чтобы копию можно было открыть в браузере без внешних зависимостей.
 */

export type ClonedFile = {
  type: "text";
  content: string;
  bytes: number;
};

export type ClonedFileMap = Record<string, ClonedFile>;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const MAX_CSS_FILES = 12;
const MAX_CSS_BYTES = 900_000;

function textFile(content: string): ClonedFile {
  return { type: "text", content, bytes: new TextEncoder().encode(content).length };
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function abs(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Делает все относительные ссылки в CSS абсолютными. */
function absolutizeCss(css: string, cssUrl: string): string {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/gi, (m, q, raw) => {
    const t = String(raw).trim();
    if (/^(data:|https?:|\/\/)/i.test(t)) return m;
    const a = abs(t, cssUrl);
    return a ? `url("${a}")` : m;
  });
}

function safeName(url: string, i: number): string {
  const last = url.split("?")[0].split("/").pop() || `style-${i}.css`;
  const clean = last.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `assets/${i}-${clean.endsWith(".css") ? clean : `${clean}.css`}`;
}

/**
 * Клонирует страницу: index.html + скачанные стили.
 * Возвращает карту файлов в том же формате, что и Ditto.
 */
export async function clonePage(pageUrl: string): Promise<ClonedFileMap> {
  const html = await fetchText(pageUrl, 25_000);
  const base = pageUrl;

  // Собираем внешние стили.
  const cssLinks: string[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const tag = m[0];
    if (!/rel\s*=\s*['"]?stylesheet/i.test(tag)) continue;
    const href = /href\s*=\s*['"]([^'"]+)['"]/i.exec(tag)?.[1];
    if (!href) continue;
    const a = abs(href, base);
    if (a && !cssLinks.includes(a)) cssLinks.push(a);
  }

  const files: ClonedFileMap = {};
  let inlineCss = "";
  let budget = MAX_CSS_BYTES;
  const localMap = new Map<string, string>();

  for (const [i, href] of cssLinks.slice(0, MAX_CSS_FILES).entries()) {
    try {
      const raw = await fetchText(href, 15_000);
      if (raw.length > budget) continue;
      budget -= raw.length;
      const css = absolutizeCss(raw, href);
      const name = safeName(href, i + 1);
      files[name] = textFile(css);
      localMap.set(href, name);
      inlineCss += `\n/* ${href} */\n${css}\n`;
    } catch {
      /* стиль недоступен — пропускаем */
    }
  }

  // Правим HTML: базовый URL для относительных ссылок + встроенные стили.
  let out = html;

  // Убираем существующий <base>, добавляем свой.
  out = out.replace(/<base\b[^>]*>/gi, "");
  const baseTag = `<base href="${base}">`;
  const styleTag = inlineCss
    ? `<style data-cloned="1">${inlineCss.replace(/<\/style/gi, "<\\/style")}</style>`
    : "";

  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, (mm, attrs) => `<head${attrs}>${baseTag}${styleTag}`);
  } else {
    out = `${baseTag}${styleTag}${out}`;
  }

  files["index.html"] = textFile(out);
  files["clone.json"] = textFile(
    JSON.stringify(
      {
        source: pageUrl,
        engine: "builtin",
        clonedAt: new Date().toISOString(),
        stylesheets: cssLinks.length,
        stylesheetsSaved: localMap.size,
      },
      null,
      2,
    ),
  );

  return files;
}
