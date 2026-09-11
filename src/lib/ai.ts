// RemindPay — cliente LLM OpenAI-compatible (genérico: OpenAI, OpenRouter,
// Ollama/LM Studio local, o cualquier endpoint estilo Zen con /chat/completions).
// Solo se usa si el usuario configura endpoint en Configuración. Sin eso,
// la app sigue 100% local.
import { getSetting } from "./api";
import { isPreview } from "./api";

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
    endpoint: normalizarEndpoint(endpoint ?? ""),
    key: (key ?? "").trim(),
    model: (model ?? "").trim(),
  };
}

export function isAiConfigured(cfg: AiConfig): boolean {
  return cfg.endpoint.length > 0 && cfg.model.length > 0;
}

/** Acepta base URL o URL completa: recorta /chat/completions y slashes. */
export function normalizarEndpoint(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "")
    .replace(/\/+$/, "");
}

/**
 * fetch sin CORS en la app instalada (plugin HTTP → Rust) y fetch normal
 * en vista previa web.
 */
async function httpFetch(input: string, init: RequestInit): Promise<Response> {
  if (!isPreview()) {
    try {
      const { fetch: tFetch } = await import("@tauri-apps/plugin-http");
      return (await tFetch(input, init)) as Response;
    } catch {
      /* cae al fetch del webview */
    }
  }
  return fetch(input, init);
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

// Sesión estable (OpenCode Go la pide para enrutar y cachear).
const SESION_IA =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sesion-${Date.now()}`;

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
    res = await httpFetch(`${cfg.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "RemindPay",
        "x-opencode-session": SESION_IA,
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
    let detalle = "";
    try {
      detalle = (await res.text()).slice(0, 200);
    } catch {
      /* sin cuerpo */
    }
    let msg = "";
    try {
      const j = JSON.parse(detalle) as {
        error?: { message?: unknown };
        message?: unknown;
      };
      const m = j?.error?.message ?? j?.message;
      if (typeof m === "string" && m.trim()) msg = m.trim();
    } catch {
      /* no es JSON */
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Clave inválida o sin permiso (${res.status})${msg ? `: ${msg}` : ". Revísala en Configuración."}`,
      );
    }
    if (res.status === 404) {
      throw new Error(
        `Endpoint o modelo no encontrado (404)${msg ? `: ${msg}` : "."}`,
      );
    }
    throw new Error(
      `El endpoint devolvió error ${res.status}${msg ? `: ${msg}` : "."}`,
    );
  }
  const data = (await res
    .json()
    .catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: ChatUsage;
  } | null;
  const choice = data?.choices?.[0]?.message as
    | {
        content?: unknown;
        reasoning_details?: { text?: unknown }[];
        reasoning?: unknown;
      }
    | undefined;
  let texto = typeof choice?.content === "string" ? choice.content : "";
  if (!texto.trim() && Array.isArray(choice?.reasoning_details)) {
    const r = choice.reasoning_details.find((d) => typeof d?.text === "string");
    if (r && typeof r.text === "string") texto = r.text;
  }
  if (!texto.trim() && typeof choice?.reasoning === "string") {
    texto = choice.reasoning;
  }
  if (!texto.trim()) {
    throw new Error("El modelo devolvió una respuesta vacía.");
  }
  return { text: texto.trim(), usage: data?.usage };
}

export async function testConnection(cfg: AiConfig): Promise<string> {
  const base = normalizarEndpoint(cfg.endpoint);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await chatCompletion(
      { ...cfg, endpoint: base },
      [{ role: "user", content: "Responde con solo: ok" }],
      { maxTokens: 100, temperature: 0, signal: ctrl.signal },
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

// ── Identidad y prompts ──────────────────────────────────────────────

export const IDENTIDAD = [
  "Eres Aura, la asistente financiera de RemindPay (app de escritorio 100% local, USD).",
  "Tu responsabilidad: ayudar al usuario a controlar su dinero con datos reales: registrar pagos, recordar vencimientos, planificar quincenas y alertar riesgos.",
  "Hablas español, breve y directa, sin adornos ni emojis.",
  "Conoces la app: Dashboard (balance, próximos pagos, presupuestos, gráfico), Pagos (pagados/pendientes, recurrentes, comprobantes), Deudas (abonos), Planificador (simula la quincena), Recordatorios (avisos con sonido), Contactos, Configuración.",
  "Reglas: nunca inventes cifras — solo las del contexto que se te da. Montos en USD. Fechas absolutas yyyy-MM-dd. Nada se guarda sin confirmación del usuario (la app la gestiona). Si algo está fuera de tu alcance, dilo en una frase y sugiere la alternativa más cercana.",
].join("\n");

export function promptChatSistema(contexto: string): string {
  return `${IDENTIDAD}\nHablas con los datos de abajo como única fuente de verdad.\n${contexto}`;
}

export function promptAccionesSistema(
  categorias: string[],
  pendientes: string[],
): string {
  return [
    IDENTIDAD,
    "Modo acciones: conviertes el pedido del usuario en UNA acción JSON. Acciones disponibles:",
    '1. {"accion":"registrar_pago","params":{"tipo":"ingreso"|"gasto","monto":12.5,"fecha":"2026-09-11","categoria":"Comida"|null,"descripcion":"..."}}',
    '2. {"accion":"crear_recordatorio","params":{"titulo":"...","detalle":"","fecha_hora":"2026-09-12T09:00","repetir":"none"|"daily"|"weekly"|"monthly","sonido":true,"persistente":true}}',
    '3. {"accion":"marcar_pagado","params":{"id":123}}',
    `Hoy: ${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}. Fechas relativas ("ayer", "el lunes", "el 15") → absolutas yyyy-MM-dd / yyyy-MM-ddTHH:mm.`,
    `Categorías: [${categorias.join(", ")}] (la más cercana o null).`,
    pendientes.length > 0
      ? `Pagos pendientes (para marcar_pagado usa SOLO estos ids):\n${pendientes.join("\n")}`
      : "No hay pagos pendientes.",
    'Responde SOLO el JSON, sin markdown. Si falta info o hay ambigüedad: {"error":"pregunta corta"}.',
  ].join("\n");
}

export function promptMonitorSistema(): string {
  return [
    IDENTIDAD,
    "Rol ahora: monitor silencioso. Con los datos de abajo devuelve SOLO JSON válido, sin markdown:",
    '{"alertas":[{"nivel":"urgente"|"aviso"|"info","texto":"..."}]}',
    "Máximo 4 alertas, solo accionables con cifras concretas del contexto (vencimientos, presupuestos al límite, sobregiros, patrones raros). Nada genérico ni motivacional. Si todo está bien: {\"alertas\":[]}.",
  ].join("\n");
}

// ── Acciones ─────────────────────────────────────────────────────────

export interface PagoExtraido {
  tipo: "ingreso" | "gasto";
  monto: number;
  fecha: string;
  categoria: string | null;
  descripcion: string;
}

export interface RecordatorioExtraido {
  titulo: string;
  detalle: string;
  fecha_hora: string;
  repetir: string;
  sonido: boolean;
  persistente: boolean;
}

export type AccionIA =
  | { accion: "registrar_pago"; params: PagoExtraido }
  | { accion: "crear_recordatorio"; params: RecordatorioExtraido }
  | { accion: "marcar_pagado"; params: { id: number } };

function extraerJSON(texto: string): Record<string, unknown> {
  const limpio = texto
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin <= ini) throw new Error("no-json");
  try {
    const obj: unknown = JSON.parse(limpio.slice(ini, fin + 1));
    if (typeof obj !== "object" || obj === null) throw new Error("no-json");
    return obj as Record<string, unknown>;
  } catch {
    throw new Error("no-json");
  }
}

function validarPago(o: Record<string, unknown>): PagoExtraido {
  if (o["tipo"] !== "ingreso" && o["tipo"] !== "gasto") {
    throw new Error("¿Es ingreso o gasto?");
  }
  const monto = o["monto"];
  if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0) {
    throw new Error("¿Por cuánto fue?");
  }
  const fecha = o["fecha"];
  if (typeof fecha !== "string" || fecha.length !== 10) {
    throw new Error("¿Qué día fue?");
  }
  return {
    tipo: o["tipo"],
    monto,
    fecha,
    categoria: typeof o["categoria"] === "string" ? o["categoria"] : null,
    descripcion: typeof o["descripcion"] === "string" ? o["descripcion"] : "",
  };
}

function validarRecordatorio(o: Record<string, unknown>): RecordatorioExtraido {
  const titulo =
    typeof o["titulo"] === "string" ? o["titulo"].trim() : "";
  if (!titulo) throw new Error("¿Qué te recuerdo?");
  const fh = o["fecha_hora"];
  if (typeof fh !== "string" || fh.length !== 16) {
    throw new Error("¿Para qué día y hora?");
  }
  const rep = typeof o["repetir"] === "string" ? o["repetir"] : "none";
  if (!["none", "daily", "weekly", "monthly"].includes(rep)) {
    throw new Error("Repetición no válida.");
  }
  return {
    titulo: titulo.slice(0, 140),
    detalle: typeof o["detalle"] === "string" ? o["detalle"].slice(0, 500) : "",
    fecha_hora: fh,
    repetir: rep,
    sonido: o["sonido"] !== false,
    persistente: o["persistente"] !== false,
  };
}

/** Interpreta la respuesta del modelo como acción (o pregunta si falta info). */
export function parseAccionJSON(texto: string): AccionIA {
  let o: Record<string, unknown>;
  try {
    o = extraerJSON(texto);
  } catch {
    throw new Error("No entendí. Dime qué quieres hacer.");
  }
  if (o["error"] != null && o["accion"] == null) {
    throw new Error(
      typeof o["error"] === "string" ? o["error"] : "Falta información.",
    );
  }
  const a = o["accion"];
  const p = o["params"];
  if (typeof p !== "object" || p === null) {
    throw new Error("No entendí. Dime qué quieres hacer.");
  }
  const params = p as Record<string, unknown>;
  if (a === "registrar_pago") return { accion: a, params: validarPago(params) };
  if (a === "crear_recordatorio") {
    return { accion: a, params: validarRecordatorio(params) };
  }
  if (a === "marcar_pagado") {
    const id = params["id"];
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      throw new Error("¿Cuál pago? Dime la descripción.");
    }
    return { accion: a, params: { id } };
  }
  throw new Error("No entendí. Dime qué quieres hacer.");
}
