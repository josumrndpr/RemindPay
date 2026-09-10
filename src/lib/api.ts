// RemindPay — wrappers tipados de comandos Tauri (Rust).
// En navegador (sin runtime Tauri) usan el mock local para vista previa.
import { invoke } from "@tauri-apps/api/core";
import * as mock from "./mock";
import type {
  Category,
  MonthSummary,
  NewPaymentInput,
  Payment,
} from "./types";

/** true cuando corre en navegador sin backend Rust (vista previa). */
export function isPreview(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

/** Prueba del puente JS → Rust. */
export function ping(msg: string): Promise<string> {
  if (isPreview()) return Promise.resolve(`pong (vista previa): ${msg}`);
  return invoke<string>("ping", { msg });
}

export function listPayments(f: {
  tipo?: string;
  mes?: string;
  buscar?: string;
  limite?: number;
}): Promise<Payment[]> {
  if (isPreview()) return mock.listPayments(f);
  return invoke<Payment[]>("list_payments", {
    tipo: f.tipo ?? null,
    mes: f.mes ?? null,
    buscar: f.buscar ?? null,
    limite: f.limite ?? null,
  });
}

export function createPayment(input: NewPaymentInput): Promise<Payment> {
  if (isPreview()) return mock.createPayment(input);
  return invoke<Payment>("create_payment", { input });
}

export function updatePayment(
  id: number,
  input: NewPaymentInput,
): Promise<Payment> {
  if (isPreview()) return mock.updatePayment(id, input);
  return invoke<Payment>("update_payment", { id, input });
}

export function deletePayment(id: number): Promise<void> {
  if (isPreview()) return mock.deletePayment(id);
  return invoke<void>("delete_payment", { id });
}

export function paymentsSummary(mes: string): Promise<MonthSummary> {
  if (isPreview()) return mock.paymentsSummary(mes);
  return invoke<MonthSummary>("payments_summary", { mes });
}

export function listCategories(): Promise<Category[]> {
  if (isPreview()) return mock.listCategories();
  return invoke<Category[]>("list_categories");
}
