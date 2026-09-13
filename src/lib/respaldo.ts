// RemindPay — respaldo portable M3 (exportar/importar PC↔iPhone).
// Un solo JSON con todo (sin clave IA ni PIN: cada dispositivo guarda los suyos).
import type {
  Category,
  Contact,
  Debt,
  DebtPayment,
  Payment,
  Reminder,
} from "./types";

export interface AjusteRespaldo {
  clave: string;
  valor: string;
}

export interface PresupuestoFila {
  id: number;
  categoria_id: number;
  monto_cents: number;
}

export interface RespaldoJSON {
  app: string;
  v: number;
  stamp: string;
  categories: Category[];
  payments: Payment[];
  debts: Debt[];
  debt_payments: DebtPayment[];
  contacts: Contact[];
  reminders: Reminder[];
  budgets: PresupuestoFila[];
  settings?: AjusteRespaldo[];
}

/** Valida que el texto sea un respaldo RemindPay. Lanza error claro si no. */
export function validarRespaldo(texto: string): RespaldoJSON {
  let o: unknown;
  try {
    o = JSON.parse(texto);
  } catch {
    throw new Error("respaldo inválido: no es JSON");
  }
  const d = o as Record<string, unknown>;
  if (!d || d["app"] !== "remindpay") {
    throw new Error("respaldo inválido: no es de RemindPay");
  }
  for (const k of [
    "categories",
    "payments",
    "debts",
    "debt_payments",
    "contacts",
    "reminders",
    "budgets",
  ]) {
    if (!Array.isArray(d[k])) {
      throw new Error(`respaldo inválido: falta ${k}`);
    }
  }
  return d as unknown as RespaldoJSON;
}

/** Descarga el JSON (web/PWA: iPhone lo comparte por AirDrop, archivos, etc.). */
export function descargarRespaldo(nombre: string, json: string): void {
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function resumenRespaldo(d: RespaldoJSON): string {
  return `${d.payments.length} pagos, ${d.debts.length} deudas, ${d.reminders.length} avisos`;
}
