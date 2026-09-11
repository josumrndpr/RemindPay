// RemindPay — monitoreo con IA: construye una foto de tus finanzas,
// pide alertas accionables al modelo y cachea el último chequeo.
// Corre 1 vez por sesión al desbloquear + manual desde Asistente.
import {
  debtsSummary,
  listBudgets,
  listDebts,
  listPayments,
  listReminders,
  paymentsSummary,
} from "./api";
import {
  chatCompletion,
  promptMonitorSistema,
  type AiConfig,
} from "./ai";
import { fmtUSD, monthLocal } from "./format";

export interface Alerta {
  nivel: "urgente" | "aviso" | "info";
  texto: string;
}

let cache: { fecha: string; alertas: Alerta[] } | null = null;

export function getChequeo(): { fecha: string; alertas: Alerta[] } | null {
  return cache;
}

export function setChequeo(alertas: Alerta[]): void {
  cache = { fecha: new Date().toISOString(), alertas };
}

export async function buildSnapshot(): Promise<string> {
  const mes = monthLocal();
  const [s, d, pends, budgets, debts, rems] = await Promise.all([
    paymentsSummary(mes),
    debtsSummary(),
    listPayments({ estado: "pendiente", limite: 100 }),
    listBudgets(mes),
    listDebts({ limite: 100 }),
    listReminders({ solo_pendientes: true, limite: 100 }),
  ]);
  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  const max = new Date(hoy);
  max.setDate(max.getDate() + 7);
  const pad = (n: number) => String(n).padStart(2, "0");
  const tope = `${max.getFullYear()}-${pad(max.getMonth() + 1)}-${pad(max.getDate())}T23:59`;
  const vencidos = pends.filter((p) => p.fecha < hoyStr);
  const semana = pends.filter((p) => p.fecha >= hoyStr && p.fecha <= tope.slice(0, 10));
  const deudasVenc = debts.filter((x) => x.estado === "vencida");
  const remsVenc = rems.filter(
    (r) => r.fecha_hora <= `${hoyStr}T23:59`,
  );
  const pres = budgets
    .map(
      (b) =>
        `${b.categoria} ${b.pct}% (${fmtUSD(b.gastado_cents)}/${fmtUSD(b.monto_cents)})`,
    )
    .join(" · ");
  return [
    `Mes ${mes}: ingresos cobrados ${fmtUSD(s.ingresos_cents)}, gastos pagados ${fmtUSD(s.gastos_cents)}, balance ${fmtUSD(s.balance_cents)}.`,
    `Presupuestos: ${pres || "ninguno"}.`,
    `Pagos pendientes vencidos: ${vencidos.length} (${fmtUSD(vencidos.reduce((a, p) => a + (p.tipo === "gasto" ? p.monto_cents : -p.monto_cents), 0))}). Vencen en 7 días: ${semana.length}.`,
    `Deudas: ${d.activas} vivas, por cobrar ${fmtUSD(d.por_cobrar_cents)}, por pagar ${fmtUSD(d.por_pagar_cents)}, vencidas ${deudasVenc.length}.`,
    `Recordatorios vencidos sin hacer: ${remsVenc.length}.`,
  ].join("\n");
}

function validarAlertas(data: unknown): Alerta[] {
  if (typeof data !== "object" || data === null) return [];
  const arr = (data as Record<string, unknown>)["alertas"];
  if (!Array.isArray(arr)) return [];
  const out: Alerta[] = [];
  for (const a of arr.slice(0, 4)) {
    if (typeof a !== "object" || a === null) continue;
    const r = a as Record<string, unknown>;
    const nivel = r["nivel"];
    const texto = r["texto"];
    if (
      (nivel === "urgente" || nivel === "aviso" || nivel === "info") &&
      typeof texto === "string" &&
      texto.trim().length > 0
    ) {
      out.push({ nivel, texto: texto.trim().slice(0, 280) });
    }
  }
  return out;
}

/** Pasa el chequeo: snapshot → modelo → alertas (y las cachea). */
export async function pasarChequeo(cfg: AiConfig): Promise<Alerta[]> {
  const snap = await buildSnapshot();
  const r = await chatCompletion(
    cfg,
    [
      { role: "system", content: promptMonitorSistema() },
      { role: "user", content: snap },
    ],
    { maxTokens: 400, temperature: 0.2 },
  );
  const limpio = r.text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  let alertas: Alerta[] = [];
  if (ini >= 0 && fin > ini) {
    try {
      alertas = validarAlertas(JSON.parse(limpio.slice(ini, fin + 1)));
    } catch {
      alertas = [];
    }
  }
  setChequeo(alertas);
  return alertas;
}
