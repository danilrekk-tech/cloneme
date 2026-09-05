/**
 * Скрипт-редактор, который внедряется внутрь клонированной страницы (iframe).
 * Общается с родительской страницей через postMessage.
 *
 * Формат правки: { sel: "3.1.0", kind: "text" | "img", value: string }
 * sel — путь по индексам дочерних элементов от <html>.
 */
export const CLONE_EDITOR_RUNTIME = String.raw`
(function () {
  if (window.__cloneEditorReady) return;
  window.__cloneEditorReady = true;

  var EDIT = false;

  function pathOf(el) {
    var parts = [];
    var node = el;
    while (node && node.parentElement) {
      var idx = Array.prototype.indexOf.call(node.parentElement.children, node);
      parts.unshift(idx);
      node = node.parentElement;
    }
    return parts.join(".");
  }

  function bySel(sel) {
    var parts = String(sel).split(".").map(Number);
    var node = document.documentElement;
    for (var i = 0; i < parts.length; i++) {
      if (!node) return null;
      node = node.children[parts[i]];
    }
    return node || null;
  }

  function isTextLeaf(el) {
    if (!el || !el.tagName) return false;
    if (/^(SCRIPT|STYLE|HTML|HEAD|BODY|NOSCRIPT|SVG|PATH|IFRAME)$/.test(el.tagName)) return false;
    var t = (el.textContent || "").trim();
    if (!t || t.length > 600) return false;
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (!/^(B|I|EM|STRONG|SPAN|BR|SMALL|U|A)$/.test(c.tagName)) return false;
    }
    return true;
  }

  function applyPatch(patch) {
    (patch || []).forEach(function (p) {
      var el = bySel(p.sel);
      if (!el) return;
      if (p.kind === "img") {
        if (el.tagName === "IMG") { el.setAttribute("src", p.value); el.removeAttribute("srcset"); }
        else el.style.backgroundImage = 'url("' + p.value + '")';
      } else {
        el.innerHTML = p.value;
      }
    });
  }

  function send(msg) {
    parent.postMessage(Object.assign({ __cloneEditor: true }, msg), "*");
  }

  function collectSlots(limit) {
    var out = [];
    var all = document.body ? document.body.querySelectorAll("*") : [];
    for (var i = 0; i < all.length && out.length < (limit || 120); i++) {
      var el = all[i];
      if (!isTextLeaf(el)) continue;
      var text = (el.textContent || "").trim();
      if (text.length < 2) continue;
      out.push({ sel: pathOf(el), tag: el.tagName.toLowerCase(), text: text.slice(0, 400) });
    }
    return out;
  }

  var STYLE_ID = "__clone-editor-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".__ce-hover{outline:2px dashed #22d3ee !important;outline-offset:2px;cursor:text !important}" +
      ".__ce-img{outline:2px dashed #f472b6 !important;outline-offset:2px;cursor:pointer !important}" +
      "[contenteditable=true]{outline:2px solid #22d3ee !important;background:rgba(34,211,238,.08)}";
    (document.head || document.documentElement).appendChild(s);
  }

  document.addEventListener(
    "mouseover",
    function (e) {
      if (!EDIT) return;
      var el = e.target;
      if (el && el.tagName === "IMG") el.classList.add("__ce-img");
      else if (isTextLeaf(el)) el.classList.add("__ce-hover");
    },
    true
  );
  document.addEventListener(
    "mouseout",
    function (e) {
      var el = e.target;
      if (el && el.classList) { el.classList.remove("__ce-hover"); el.classList.remove("__ce-img"); }
    },
    true
  );

  document.addEventListener(
    "click",
    function (e) {
      if (!EDIT) return;
      var el = e.target;
      if (!el || !el.tagName) return;
      if (el.tagName === "IMG") {
        e.preventDefault();
        e.stopPropagation();
        send({ type: "pick-image", sel: pathOf(el), current: el.getAttribute("src") || "" });
        return;
      }
      var host = isTextLeaf(el) ? el : (el.parentElement && isTextLeaf(el.parentElement) ? el.parentElement : null);
      if (!host) return;
      e.preventDefault();
      e.stopPropagation();
      host.setAttribute("contenteditable", "true");
      host.focus();
      var sel = pathOf(host);
      var finish = function () {
        host.removeAttribute("contenteditable");
        host.removeEventListener("blur", finish);
        send({ type: "patch", entry: { sel: sel, kind: "text", value: host.innerHTML } });
      };
      host.addEventListener("blur", finish);
    },
    true
  );

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (!d.__cloneEditorCmd) return;
    if (d.cmd === "mode") { EDIT = !!d.on; ensureStyle(); document.documentElement.style.cursor = EDIT ? "crosshair" : ""; }
    if (d.cmd === "apply") applyPatch(d.patch);
    if (d.cmd === "slots") send({ type: "slots", slots: collectSlots(d.limit) });
    if (d.cmd === "html") send({ type: "html", html: "<!doctype html>" + document.documentElement.outerHTML });
  });

  ensureStyle();
  if (window.__clonePatch) applyPatch(window.__clonePatch);
  send({ type: "ready" });
})();
`;

/** Скрипт, который применяет сохранённые правки при открытии/скачивании клона. */
export function patchBootstrapScript(patch: unknown): string {
  return `<script>window.__clonePatch=${JSON.stringify(patch ?? []).replace(/</g, "\\u003c")};</script>`;
}
