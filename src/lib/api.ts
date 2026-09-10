// RemindPay — wrappers tipados de comandos Tauri (Rust)
import { invoke } from "@tauri-apps/api/core";
import type {
  Category,
  MonthSummary,
  NewPaymentInput,
  Payment,
} from "./types";

/** Prueba del puente JS → Rust. */
export function ping(msg: string): Promise<string> {
  return invoke<string>("ping", { msg });
}

export function listPayments(f: {
  tipo?: string;
  mes?: string;
  buscar?: string;
  limite?: number;
}): Promise<Payment[]> {
  return invoke<Payment[]>("list_payments", {
    tipo: f.tipo ?? null,
    mes: f.mes ?? null,
    buscar: f.buscar ?? null,
    limite: f.limite ?? null,
  });
}

export function createPayment(input: NewPaymentInput): Promise<Payment> {
  return invoke<Payment>("create_payment", { input });
}

export function updatePayment(
  id: number,
  input: NewPaymentInput,
): Promise<Payment> {
  return invoke<Payment>("update_payment", { id, input });
}

export function deletePayment(id: number): Promise<void> {
  return invoke<void>("delete_payment", { id });
}

export function paymentsSummary(mes: string): Promise<MonthSummary> {
  return invoke<MonthSummary>("payments_summary", { mes });
}

export function listCategories(): Promise<Category[]> {
  return invoke<Category[]>("list_categories");
}
