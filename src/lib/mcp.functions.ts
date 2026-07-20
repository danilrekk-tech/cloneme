import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type McpToolInfo = { name: string; description?: string; inputSchema?: any };
export type McpServerRow = {
  id: string;
  name: string;
  url: string;
  transport: string;
  auth_token: string | null;
  enabled: boolean;
  provider: string;
  tools: McpToolInfo[] | null;
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export const OMNIROUTE_URL = "https://api.omniroute.dev/mcp";

/** Minimal MCP Streamable HTTP client — server-side only. */
async function mcpRequest(
  url: string,
  token: string | null | undefined,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 20_000,
): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params,
      }),
      signal: ctrl.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${raw.slice(0, 300)}`);
    }
    let payload: any = null;
    if (contentType.includes("text/event-stream")) {
      const frames = raw.split("\n\n");
      for (const f of frames) {
        const m = f.match(/^data:\s*(.+)$/m);
        if (m) {
          try {
            payload = JSON.parse(m[1]);
            break;
          } catch {}
        }
      }
    } else {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(`MCP: невалидный JSON ответ: ${raw.slice(0, 200)}`);
      }
    }
    if (!payload) throw new Error("MCP: пустой ответ сервера");
    if (payload.error) {
      throw new Error(`MCP error ${payload.error.code}: ${payload.error.message}`);
    }
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

async function initAndListTools(
  url: string,
  token: string | null | undefined,
): Promise<McpToolInfo[]> {
  try {
    await mcpRequest(url, token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "clone-studio", version: "0.2.0" },
    });
  } catch {}
  const result = await mcpRequest(url, token, "tools/list", {});
  const tools = (result?.tools ?? []) as any[];
  return tools.map((t) => ({
    name: String(t.name ?? ""),
    description: typeof t.description === "string" ? t.description : undefined,
    inputSchema: t.inputSchema ?? undefined,
  }));
}

/** Server-only helper: run a single MCP tool. Returns the raw result or throws. */
export async function callMcpTool(
  url: string,
  token: string | null | undefined,
  name: string,
  args: Record<string, unknown> = {},
  timeoutMs = 25_000,
): Promise<any> {
  try {
    await mcpRequest(url, token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "clone-studio", version: "0.2.0" },
    }).catch(() => {});
    const res = await mcpRequest(
      url,
      token,
      "tools/call",
      { name, arguments: args },
      timeoutMs,
    );
    return res;
  } catch (e: any) {
    throw new Error(String(e?.message ?? e).slice(0, 400));
  }
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  url: z.string().url().max(1024),
  transport: z.enum(["http", "sse"]).default("http"),
  auth_token: z.string().max(4000).optional().nullable(),
  enabled: z.boolean().default(true),
  provider: z.enum(["custom", "omniroute"]).default("custom").optional(),
});

export const listMcpServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("mcp_servers")
      .select(
        "id, name, url, transport, auth_token, enabled, provider, tools, last_error, last_checked_at, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as McpServerRow[];
  });

export const saveMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => upsertSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      name: data.name.trim(),
      url: data.url.trim(),
      transport: data.transport,
      auth_token: data.auth_token?.trim() || null,
      enabled: data.enabled,
      provider: data.provider ?? "custom",
    };
    if (data.id) {
      const { data: row, error } = await (supabase as any)
        .from("mcp_servers")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as McpServerRow;
    }
    const { data: row, error } = await (supabase as any)
      .from("mcp_servers")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as McpServerRow;
  });

export const deleteMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("mcp_servers")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("mcp_servers")
      .select("id, url, auth_token")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Сервер не найден");
    const started = Date.now();
    try {
      const tools = await initAndListTools(row.url, row.auth_token);
      const { data: updated } = await (supabase as any)
        .from("mcp_servers")
        .update({
          tools,
          last_error: null,
          last_checked_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select()
        .single();
      return {
        ok: true,
        tools,
        row: updated,
        latencyMs: Date.now() - started,
      };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 400);
      await (supabase as any)
        .from("mcp_servers")
        .update({ last_error: msg, last_checked_at: new Date().toISOString() })
        .eq("id", row.id);
      throw new Error(msg);
    }
  });

/**
 * Set/refresh the Omniroute MCP server for the current user.
 * Uses the API key saved in user_settings (or passes the freshly saved one via `apiKey`).
 * Creates (or updates) a mcp_servers row with provider='omniroute'.
 */
export const activateOmniroute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ apiKey: z.string().min(4).max(4000).optional() }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let apiKey = data.apiKey?.trim();
    if (!apiKey) {
      const { data: s } = await (supabase as any)
        .from("user_settings")
        .select("omniroute_api_key")
        .eq("user_id", userId)
        .maybeSingle();
      apiKey = s?.omniroute_api_key ?? undefined;
    }
    if (!apiKey) throw new Error("Не указан API-ключ Omniroute. Добавьте его в настройках.");

    // Persist the key on user_settings.
    await (supabase as any)
      .from("user_settings")
      .upsert({ user_id: userId, omniroute_api_key: apiKey }, { onConflict: "user_id" });

    // Upsert an Omniroute mcp_servers row.
    const { data: existing } = await (supabase as any)
      .from("mcp_servers")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "omniroute")
      .maybeSingle();

    const base = {
      user_id: userId,
      name: "Omniroute",
      url: OMNIROUTE_URL,
      transport: "http",
      auth_token: apiKey,
      enabled: true,
      provider: "omniroute",
    };
    let row: any;
    if (existing?.id) {
      const { data: updated } = await (supabase as any)
        .from("mcp_servers")
        .update(base)
        .eq("id", existing.id)
        .select()
        .single();
      row = updated;
    } else {
      const { data: inserted } = await (supabase as any)
        .from("mcp_servers")
        .insert(base)
        .select()
        .single();
      row = inserted;
    }

    // Probe list of tools.
    try {
      const tools = await initAndListTools(OMNIROUTE_URL, apiKey);
      const { data: refreshed } = await (supabase as any)
        .from("mcp_servers")
        .update({ tools, last_error: null, last_checked_at: new Date().toISOString() })
        .eq("id", row.id)
        .select()
        .single();
      return { ok: true, row: refreshed, tools };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 400);
      await (supabase as any)
        .from("mcp_servers")
        .update({ last_error: msg, last_checked_at: new Date().toISOString() })
        .eq("id", row.id);
      throw new Error(msg);
    }
  });

/** Server-only: build a short catalog string of active MCP tools. */
export async function getActiveMcpContext(
  supabase: any,
  userId: string,
): Promise<{ summary: string; servers: number; tools: number }> {
  const { data } = await (supabase as any)
    .from("mcp_servers")
    .select("name, url, tools, enabled, provider")
    .eq("user_id", userId)
    .eq("enabled", true);
  const rows = (data ?? []) as Array<{
    name: string;
    url: string;
    provider: string;
    tools: McpToolInfo[] | null;
  }>;
  if (rows.length === 0) return { summary: "", servers: 0, tools: 0 };
  let toolCount = 0;
  const blocks: string[] = [];
  for (const s of rows) {
    const tools = (s.tools ?? []).slice(0, 12);
    toolCount += tools.length;
    const lines = tools
      .map((t) => `  - ${t.name}${t.description ? `: ${t.description.slice(0, 140)}` : ""}`)
      .join("\n");
    blocks.push(
      `• ${s.name} [${s.provider}] (${s.url})\n${lines || "  (список инструментов не загружен)"}`,
    );
  }
  return {
    summary: `Подключённые MCP-агенты пользователя (учитывай их доменные знания в аудите и решениях):\n${blocks.join("\n\n")}`,
    servers: rows.length,
    tools: toolCount,
  };
}

/** Server-only: fetch enabled servers with their tool listings, filtered by ids/tool names. */
export async function loadServersWithTools(
  supabase: any,
  userId: string,
): Promise<Array<{ id: string; name: string; url: string; auth_token: string | null; provider: string; tools: McpToolInfo[] }>> {
  const { data } = await (supabase as any)
    .from("mcp_servers")
    .select("id, name, url, auth_token, provider, tools, enabled")
    .eq("user_id", userId)
    .eq("enabled", true);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    auth_token: r.auth_token,
    provider: r.provider,
    tools: Array.isArray(r.tools) ? r.tools : [],
  }));
}
