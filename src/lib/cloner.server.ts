/**
 * Встроенный клонировщик страниц.
 *
 * Скачивает HTML, стили, шрифты, изображения и скрипты и делает
 * самодостаточную копию страницы (index.html), которую можно открыть
 * в браузере без обращения к исходному сайту.
 */

export type ClonedFile = {
  type: "text";
  content: string;
  bytes: number;
};

export type ClonedFileMap = Record<string, ClonedFile>;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const MAX_CSS_FILES = 40;
const MAX_CSS_BYTES = 3_000_000;
const MAX_ASSETS = 260;
const MAX_ASSET_BYTES = 2_500_000; // на один файл
const MAX_TOTAL_ASSET_BYTES = 26_000_000;

function textFile(content: string): ClonedFile {
  return { type: "text", content, bytes: new TextEncoder().encode(content).length };
}

async function fetchWithTimeout(url: string, timeoutMs: number, referer?: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        ...(referer ? { Referer: referer } : {}),
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, timeoutMs = 20_000, referer?: string): Promise<string> {
  const res = await fetchWithTimeout(url, timeoutMs, referer);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function abs(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa доступен в worker-рантайме
  return btoa(binary);
}

function guessMime(url: string, headerType: string | null): string {
  if (headerType && !headerType.startsWith("text/plain")) return headerType.split(";")[0].trim();
  const ext = (url.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    eot: "application/vnd.ms-fontobject",
    mp4: "video/mp4",
    webm: "video/webm",
    js: "application/javascript",
    mjs: "application/javascript",
    css: "text/css",
    json: "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Кэшируемая загрузка бинарного ресурса в data: URI. */
class AssetInliner {
  private cache = new Map<string, string | null>();
  private total = 0;
  private count = 0;

  constructor(private referer: string) {}

  get stats() {
    return { count: this.count, bytes: this.total };
  }

  async inline(url: string): Promise<string | null> {
    if (this.cache.has(url)) return this.cache.get(url) ?? null;
    if (this.count >= MAX_ASSETS || this.total >= MAX_TOTAL_ASSET_BYTES) return null;
    let result: string | null = null;
    try {
      const res = await fetchWithTimeout(url, 15_000, this.referer);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length <= MAX_ASSET_BYTES && this.total + buf.length <= MAX_TOTAL_ASSET_BYTES) {
          const mime = guessMime(url, res.headers.get("content-type"));
          result = `data:${mime};base64,${toBase64(buf)}`;
          this.total += buf.length;
          this.count += 1;
        }
      }
    } catch {
      result = null;
    }
    this.cache.set(url, result);
    return result;
  }
}

/** Все url(...) в CSS -> data: URI (шрифты, фоны). */
async function inlineCssAssets(css: string, cssUrl: string, inliner: AssetInliner): Promise<string> {
  const targets = new Set<string>();
  const re = /url\((['"]?)([^'")]+)\1\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const raw = String(m[2]).trim();
    if (/^data:|^about:/i.test(raw)) continue;
    const a = abs(raw, cssUrl);
    if (a) targets.add(a);
  }
  const map = new Map<string, string>();
  for (const t of targets) {
    const d = await inliner.inline(t);
    if (d) map.set(t, d);
  }
  return css.replace(re, (full, _q, raw) => {
    const t = String(raw).trim();
    if (/^data:|^about:/i.test(t)) return full;
    const a = abs(t, cssUrl);
    if (!a) return full;
    return `url("${map.get(a) ?? a}")`;
  });
}

async function inlineImports(
  css: string,
  cssUrl: string,
  inliner: AssetInliner,
  depth = 0,
): Promise<string> {
  if (depth > 2) return css;
  const re = /@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?[^;]*;/gi;
  const parts: { full: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const a = abs(m[1], cssUrl);
    if (a) parts.push({ full: m[0], url: a });
  }
  let out = css;
  for (const p of parts) {
    try {
      const raw = await fetchText(p.url, 12_000, cssUrl);
      const nested = await inlineImports(raw, p.url, inliner, depth + 1);
      out = out.replace(p.full, await inlineCssAssets(nested, p.url, inliner));
    } catch {
      out = out.replace(p.full, "");
    }
  }
  return out;
}

function safeName(url: string, i: number, ext: string): string {
  const last = url.split("?")[0].split("/").pop() || `asset-${i}`;
  const clean = last.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `assets/${i}-${clean.endsWith(ext) ? clean : `${clean}${ext}`}`;
}

function attrOf(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)"|([^\\s>]+))`, "i");
  const m = re.exec(tag);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim() || null;
}

function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`(${name}\\s*=\\s*)(?:'[^']*'|"[^"]*"|[^\\s>]+)`, "i");
  if (re.test(tag)) return tag.replace(re, `$1"${value.replace(/"/g, "&quot;")}"`);
  return tag.replace(/\/?>$/, ` ${name}="${value.replace(/"/g, "&quot;")}">`);
}

/**
 * Клонирует страницу целиком: HTML + инлайн CSS/шрифтов/картинок/скриптов.
 */
export async function clonePage(pageUrl: string): Promise<ClonedFileMap> {
  const res = await fetchWithTimeout(pageUrl, 30_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const base = res.url || pageUrl;
  const html = await res.text();

  const files: ClonedFileMap = {};
  const inliner = new AssetInliner(base);
  let out = html;

  // 1. Внешние стили -> инлайн <style>
  let cssBudget = MAX_CSS_BYTES;
  let cssCount = 0;
  const linkTags = out.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const rel = (attrOf(tag, "rel") || "").toLowerCase();
    const href = attrOf(tag, "href");
    if (!href) continue;
    const url = abs(href, base);
    if (!url) continue;

    if (rel.includes("stylesheet") && cssCount < MAX_CSS_FILES) {
      try {
        const raw = await fetchText(url, 15_000, base);
        if (raw.length > cssBudget) continue;
        cssBudget -= raw.length;
        cssCount += 1;
        const withImports = await inlineImports(raw, url, inliner);
        const css = await inlineCssAssets(withImports, url, inliner);
        const name = safeName(url, cssCount, ".css");
        files[name] = textFile(css);
        out = out.replace(
          tag,
          `<style data-src="${url}">${css.replace(/<\/style/gi, "<\\/style")}</style>`,
        );
      } catch {
        /* стиль недоступен */
      }
      continue;
    }

    if (/icon|preload|apple-touch/.test(rel)) {
      const d = await inliner.inline(url);
      out = out.replace(tag, d ? setAttr(tag, "href", d) : setAttr(tag, "href", url));
    }
  }

  // 2. Скрипты -> инлайн исходного кода
  const scriptTags = out.match(/<script\b[^>]*>/gi) ?? [];
  for (const tag of scriptTags) {
    const src = attrOf(tag, "src");
    if (!src) continue;
    const url = abs(src, base);
    if (!url) continue;
    try {
      const code = await fetchText(url, 15_000, base);
      if (code.length > 1_500_000) throw new Error("too big");
      const cleaned = code.replace(/<\/script/gi, "<\\/script");
      out = out.replace(tag, `<script data-src="${url}">${cleaned}\n//`);
    } catch {
      out = out.replace(tag, setAttr(tag, "src", url));
    }
  }

  // 3. Картинки, srcset, video/source, inline style="...url(...)"
  const mediaTags = out.match(/<(?:img|source|video|audio|embed|iframe)\b[^>]*>/gi) ?? [];
  for (const tag of mediaTags) {
    let next = tag;
    for (const attr of ["src", "data-src", "poster"]) {
      const v = attrOf(tag, attr);
      if (!v || /^data:/i.test(v)) continue;
      const url = abs(v, base);
      if (!url) continue;
      const d = /^<iframe/i.test(tag) ? null : await inliner.inline(url);
      next = setAttr(next, attr, d ?? url);
    }
    for (const attr of ["srcset", "data-srcset"]) {
      const v = attrOf(tag, attr);
      if (!v) continue;
      const parts = await Promise.all(
        v.split(",").map(async (part) => {
          const seg = part.trim();
          if (!seg) return "";
          const [u, ...rest] = seg.split(/\s+/);
          if (/^data:/i.test(u)) return seg;
          const url = abs(u, base);
          if (!url) return seg;
          const d = await inliner.inline(url);
          return [d ?? url, ...rest].join(" ");
        }),
      );
      next = setAttr(next, attr, parts.filter(Boolean).join(", "));
    }
    if (next !== tag) out = out.replace(tag, next);
  }

  // inline style="background:url(...)"
  const styleAttrs = out.match(/style\s*=\s*"[^"]*url\([^"]*"/gi) ?? [];
  for (const raw of styleAttrs) {
    const replaced = await inlineCssAssets(raw, base, inliner);
    if (replaced !== raw) out = out.replace(raw, replaced);
  }

  // 4. Инлайн <style> блоки
  const styleBlocks = out.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? [];
  for (const block of styleBlocks) {
    if (/data-src=/.test(block)) continue;
    const inner = block.replace(/^<style\b[^>]*>/i, "").replace(/<\/style>$/i, "");
    if (!/url\(|@import/i.test(inner)) continue;
    const withImports = await inlineImports(inner, base, inliner);
    const css = await inlineCssAssets(withImports, base, inliner);
    out = out.replace(block, block.replace(inner, css));
  }

  // 5. Базовый URL для всего, что не удалось вшить (ссылки, аякс)
  out = out.replace(/<base\b[^>]*>/gi, "");
  const baseTag = `<base href="${base}">`;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, (_mm, attrs) => `<head${attrs}>${baseTag}`);
  } else {
    out = `${baseTag}${out}`;
  }

  files["index.html"] = textFile(out);
  files["clone.json"] = textFile(
    JSON.stringify(
      {
        source: pageUrl,
        finalUrl: base,
        engine: "builtin",
        clonedAt: new Date().toISOString(),
        stylesheets: cssCount,
        inlinedAssets: inliner.stats.count,
        inlinedBytes: inliner.stats.bytes,
      },
      null,
      2,
    ),
  );

  return files;
}
