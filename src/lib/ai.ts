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
  /** URL del proxy propio (Cloudflare Worker) para iPhone/PWA. Opcional. */
  proxy: string;
}

export async function getAiConfig(): Promise<AiConfig> {
  const [endpoint, key, model, proxy] = await Promise.all([
    getSetting("ai_endpoint"),
    getSetting("ai_key"),
    getSetting("ai_model"),
    getSetting("ai_proxy"),
  ]);
  return {
    endpoint: (endpoint ?? "").trim(),
    key: (key ?? "").trim(),
    model: (model ?? "").trim(),
    proxy: (proxy ?? "").trim().replace(/\/+$/, ""),
  };
}

export function isAiConfigured(cfg: AiConfig): boolean {
  return cfg.model.length > 0 && (cfg.endpoint.length > 0 || cfg.proxy.length > 0);
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
    throw new Error("Configura tu endpoint y modelo en Configuración → OpenCode Go / Zen");
  }
  // Vía proxy (iPhone/PWA): la URL ya incluye el secreto y el Worker pone
  // la clave. Directo (PC): endpoint + Authorization.
  const viaProxy = cfg.proxy.length > 0;
  const url = viaProxy
    ? cfg.proxy
    : `${normalizarEndpoint(cfg.endpoint)}/chat/completions`;
  let res: Response;
  try {
    res = await httpFetch(url, {
      method: "POST",
      headers: viaProxy
        ? {
            "Content-Type": "application/json",
            "x-opencode-session": SESION_IA,
          }
        : {
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
  } catch (e) {
    const detalle =
      e instanceof Error && e.message ? `: ${e.message.slice(0, 160)}` : "";
    throw new Error(
      `No se pudo contactar el endpoint. Revisa la URL y tu conexión${detalle}.`,
    );
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
  "Reglas: nunca inventes cifras — solo las del contexto que se te da. Montos en USD. Fechas absolutas yyyy-MM-dd. SÍ puedes crear pagos, deudas, abonos, avisos y contactos: emites la acción en JSON y la app pide confirmación al usuario antes de guardar. Solo di que algo está fuera de tu alcance si de verdad no existe esa acción.",
].join("\n");

/**
 * Prompt único de Aura: conversa con datos reales y, cuando el usuario pide
 * CREAR/REGISTRAR/MARCAR algo con datos completos, añade al final un bloque
 * ```json con UNA acción. Sin datos completos: solo texto preguntando.
 */
export function promptAuraSistema(args: {
  contexto: string;
  categorias: string[];
  pendientes: string[];
  deudas: string[];
}): string {
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  return [
    IDENTIDAD,
    "Cómo respondes: texto normal en español, breve y directo. Si el usuario pide crear, registrar o marcar algo y tienes TODOS los datos, añade al final un bloque ```json con UNA acción (con una frase corta antes). Si falta algún dato, responde SOLO texto preguntándolo, SIN json.",
    "Acciones disponibles:",
    '1. {"accion":"registrar_pago","params":{"tipo":"ingreso"|"gasto","monto":12.5,"fecha":"yyyy-MM-dd","categoria":"Comida"|null,"descripcion":"..."}}',
    '2. {"accion":"crear_deuda","params":{"direccion":"debo"|"me_deben","persona":"...","monto_total":200,"fecha_limite":"yyyy-MM-dd"|"","notas":""}} ("debo" = yo le debo a esa persona; "me_deben" = me deben a mí)',
    '3. {"accion":"abonar_deuda","params":{"id":7,"monto":50,"fecha":"yyyy-MM-dd"}} (el id SOLO de la lista de deudas abiertas)',
    '4. {"accion":"crear_recordatorio","params":{"titulo":"...","detalle":"","fecha_hora":"yyyy-MM-ddTHH:mm","repetir":"none"|"daily"|"weekly"|"monthly","sonido":true,"persistente":true}}',
    '5. {"accion":"marcar_pagado","params":{"id":123}} (el id SOLO de la lista de pagos pendientes)',
    '6. {"accion":"crear_contacto","params":{"nombre":"...","telefono":""|"...","nota":""}}',
    `Hoy: ${hoy}. Fechas relativas ("ayer", "el lunes", "el 15", "mañana a las 9am") → absolutas yyyy-MM-dd / yyyy-MM-ddTHH:mm.`,
    `Categorías: [${args.categorias.join(", ")}] (la más cercana o null).`,
    args.pendientes.length > 0
      ? `Pagos pendientes (para marcar_pagado usa SOLO estos ids):\n${args.pendientes.join("\n")}`
      : "No hay pagos pendientes.",
    args.deudas.length > 0
      ? `Deudas abiertas (para abonar_deuda usa SOLO estos ids):\n${args.deudas.join("\n")}`
      : "No hay deudas abiertas.",
    "Tus datos (única fuente de verdad):",
    args.contexto,
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

export interface DeudaExtraida {
  direccion: "debo" | "me_deben";
  persona: string;
  monto_total: number;
  fecha_limite: string;
  notas: string;
}

export interface AbonoExtraido {
  id: number;
  monto: number;
  fecha: string;
}

export interface ContactoExtraido {
  nombre: string;
  telefono: string;
  nota: string;
}

export type AccionIA =
  | { accion: "registrar_pago"; params: PagoExtraido }
  | { accion: "crear_deuda"; params: DeudaExtraida }
  | { accion: "abonar_deuda"; params: AbonoExtraido }
  | { accion: "crear_recordatorio"; params: RecordatorioExtraido }
  | { accion: "marcar_pagado"; params: { id: number } }
  | { accion: "crear_contacto"; params: ContactoExtraido };

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

function validarDeuda(o: Record<string, unknown>): DeudaExtraida {
  if (o["direccion"] !== "debo" && o["direccion"] !== "me_deben") {
    throw new Error("¿Tú le debes o te deben?");
  }
  const persona =
    typeof o["persona"] === "string" ? o["persona"].trim() : "";
  if (!persona) throw new Error("¿Con quién es la deuda?");
  const monto = o["monto_total"];
  if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0) {
    throw new Error("¿Por cuánto es la deuda?");
  }
  const fl = typeof o["fecha_limite"] === "string" ? o["fecha_limite"] : "";
  if (fl !== "" && fl.length !== 10) {
    throw new Error("¿Para cuándo es la fecha límite?");
  }
  return {
    direccion: o["direccion"],
    persona: persona.slice(0, 120),
    monto_total: monto,
    fecha_limite: fl,
    notas:
      typeof o["notas"] === "string" ? o["notas"].slice(0, 500) : "",
  };
}

function validarAbono(o: Record<string, unknown>): AbonoExtraido {
  const id = o["id"];
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    throw new Error("¿A cuál deuda le abono? Dime la persona.");
  }
  const monto = o["monto"];
  if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0) {
    throw new Error("¿Cuánto abonas?");
  }
  const fecha = o["fecha"];
  if (typeof fecha !== "string" || fecha.length !== 10) {
    throw new Error("¿Qué día fue el abono?");
  }
  return { id, monto, fecha };
}

function validarContacto(o: Record<string, unknown>): ContactoExtraido {
  const nombre =
    typeof o["nombre"] === "string" ? o["nombre"].trim() : "";
  if (!nombre) throw new Error("¿Cómo se llama el contacto?");
  return {
    nombre: nombre.slice(0, 120),
    telefono:
      typeof o["telefono"] === "string" ? o["telefono"].slice(0, 40) : "",
    nota: typeof o["nota"] === "string" ? o["nota"].slice(0, 500) : "",
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
  if (a === "crear_deuda") return { accion: a, params: validarDeuda(params) };
  if (a === "abonar_deuda") return { accion: a, params: validarAbono(params) };
  if (a === "crear_contacto") {
    return { accion: a, params: validarContacto(params) };
  }
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

/**
 * Separa la respuesta del modelo en texto visible + acción opcional.
 * El modelo puede devolver solo texto (conversar/preguntar) o texto
 * más un bloque ```json con la acción a confirmar.
 */
export function extraerAccionRespuesta(texto: string): {
  texto: string;
  accion: AccionIA | null;
} {
  const fence = texto.match(/```json\s*([\s\S]*?)```/i);
  const sinBloque = fence ? texto.replace(fence[0], "").trim() : texto;
  let o: Record<string, unknown> | null = null;
  try {
    o = extraerJSON(fence ? fence[1] : texto);
  } catch {
    return { texto, accion: null };
  }
  if (!o || typeof o["accion"] !== "string") {
    return { texto: sinBloque || texto, accion: null };
  }
  try {
    return { texto: sinBloque, accion: parseAccionJSON(JSON.stringify(o)) };
  } catch (e) {
    if (sinBloque) return { texto: sinBloque, accion: null };
    return {
      texto: e instanceof Error ? e.message : "No entendí.",
      accion: null,
    };
  }
}
