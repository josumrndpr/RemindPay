// RemindPay — cliente LLM OpenAI-compatible (genérico: OpenAI, OpenRouter,
// Ollama/LM Studio local, o cualquier endpoint estilo Zen con /chat/completions).
// Solo se usa si el usuario configura endpoint en Configuración. Sin eso,
// la app sigue 100% local.
import { getSetting } from "./api";

export interface AiConfig {
  endpoint: string;
  key: string;
  model: string;
}

export async function getAiConfig(): Promise<AiConfig> {
  const [endpoint, key, model] = await Promise.all([
    getSetting("ai_endpoint"),
    getSetting("ai_key"),
    getSetting("ai_model"),
  ]);
  return {
    endpoint: (endpoint ?? "").trim().replace(/\/+$/, ""),
    key: (key ?? "").trim(),
    model: (model ?? "").trim(),
  };
}

export function isAiConfigured(cfg: AiConfig): boolean {
  return cfg.endpoint.length > 0 && cfg.model.length > 0;
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export async function chatCompletion(
  cfg: AiConfig,
  messages: ChatMsg[],
  opts?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
): Promise<{ text: string; usage?: ChatUsage }> {
  if (!isAiConfigured(cfg)) {
    throw new Error("Configura tu endpoint y modelo en Configuración → Asistente IA");
  }
  let res: Response;
  try {
    res = await fetch(`${cfg.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 800,
      }),
      signal: opts?.signal,
    });
  } catch {
    throw new Error("No se pudo contactar el endpoint. Revisa la URL y tu conexión.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Clave inválida (401/403). Revísala en Configuración.");
    }
    if (res.status === 404) {
      throw new Error("Endpoint o modelo no encontrado (404).");
    }
    throw new Error(`El endpoint devolvió error ${res.status}.`);
  }
  const data = (await res
    .json()
    .catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: ChatUsage;
  } | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("El modelo devolvió una respuesta vacía.");
  }
  return { text: text.trim(), usage: data?.usage };
}

export async function testConnection(cfg: AiConfig): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await chatCompletion(
      cfg,
      [{ role: "user", content: "Responde con solo: ok" }],
      { maxTokens: 5, temperature: 0, signal: ctrl.signal },
    );
    return `Conexión OK · respondió: ${r.text.slice(0, 40)}`;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Tiempo agotado (30s). Revisa la URL.");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export interface PagoExtraido {
  tipo: "ingreso" | "gasto";
  monto: number;
  fecha: string;
  categoria: string | null;
  descripcion: string;
}

/** Extrae el JSON de un pago de la respuesta del modelo (tolera fences). */
export function parsePagoJSON(texto: string): PagoExtraido {
  const limpio = texto
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin <= ini) throw new Error("No entendí el pago. Dime monto y fecha.");
  let obj: unknown;
  try {
    obj = JSON.parse(limpio.slice(ini, fin + 1));
  } catch {
    throw new Error("No entendí el pago. Dime monto y fecha.");
  }
  if (typeof obj !== "object" || obj === null) {
    throw new Error("No entendí el pago. Dime monto y fecha.");
  }
  const o = obj as Record<string, unknown>;
  if (o["error"] != null && o["tipo"] == null) {
    throw new Error(typeof o["error"] === "string" ? o["error"] : "Faltan datos del pago.");
  }
  const tipo = o["tipo"];
  const monto = o["monto"];
  const fecha = o["fecha"];
  if (tipo !== "ingreso" && tipo !== "gasto") throw new Error("Tipo no claro (¿ingreso o gasto?).");
  if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0) {
    throw new Error("Monto no claro. ¿Cuánto fue?");
  }
  if (typeof fecha !== "string" || fecha.length !== 10) {
    throw new Error("Fecha no clara. ¿Qué día fue?");
  }
  const categoria = typeof o["categoria"] === "string" ? o["categoria"] : null;
  const descripcion = typeof o["descripcion"] === "string" ? o["descripcion"] : "";
  return { tipo, monto, fecha, categoria, descripcion };
}
