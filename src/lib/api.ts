// RemindPay — wrappers tipados de comandos Tauri (Rust).
// En navegador (sin runtime Tauri) usan el mock local para vista previa.
import { invoke } from "@tauri-apps/api/core";
import { todayLocal } from "./format";
import * as mock from "./mock";
import type {
  Category,
  Contact,
  Debt,
  DebtPayment,
  DebtsSummary,
  EditDebtInput,
  MonthSummary,
  NewContactInput,
  NewDebtInput,
  NewDebtPaymentInput,
  NewPaymentInput,
  NewReminderInput,
  Payment,
  Reminder,
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

// ── Pagos ──

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

// ── Deudas ──

export function listDebts(f: {
  direccion?: string;
  estado?: string;
  buscar?: string;
  limite?: number;
}): Promise<Debt[]> {
  const hoy = todayLocal();
  if (isPreview()) return mock.listDebts({ ...f, hoy });
  return invoke<Debt[]>("list_debts", {
    direccion: f.direccion ?? null,
    estado: f.estado ?? null,
    buscar: f.buscar ?? null,
    limite: f.limite ?? null,
    hoy,
  });
}

export function createDebt(input: NewDebtInput): Promise<Debt> {
  const hoy = todayLocal();
  if (isPreview()) return mock.createDebt(input, hoy);
  return invoke<Debt>("create_debt", { input, hoy });
}

export function updateDebt(id: number, input: EditDebtInput): Promise<Debt> {
  const hoy = todayLocal();
  if (isPreview()) return mock.updateDebt(id, input, hoy);
  return invoke<Debt>("update_debt", { id, input, hoy });
}

export function deleteDebt(id: number): Promise<void> {
  if (isPreview()) return mock.deleteDebt(id);
  return invoke<void>("delete_debt", { id });
}

export function addDebtPayment(
  debtId: number,
  input: NewDebtPaymentInput,
): Promise<Debt> {
  const hoy = todayLocal();
  if (isPreview()) return mock.addDebtPayment(debtId, input, hoy);
  return invoke<Debt>("add_debt_payment", { debt_id: debtId, input, hoy });
}

export function listDebtPayments(debtId: number): Promise<DebtPayment[]> {
  if (isPreview()) return mock.listDebtPayments(debtId);
  return invoke<DebtPayment[]>("list_debt_payments", { debt_id: debtId });
}

export function debtsSummary(): Promise<DebtsSummary> {
  if (isPreview()) return mock.debtsSummary();
  return invoke<DebtsSummary>("debts_summary");
}

// ── Contactos ──

export function listContacts(buscar?: string): Promise<Contact[]> {
  if (isPreview()) return mock.listContacts(buscar);
  return invoke<Contact[]>("list_contacts", { buscar: buscar ?? null });
}

export function createContact(input: NewContactInput): Promise<Contact> {
  if (isPreview()) return mock.createContact(input);
  return invoke<Contact>("create_contact", { input });
}

export function updateContact(
  id: number,
  input: NewContactInput,
): Promise<Contact> {
  if (isPreview()) return mock.updateContact(id, input);
  return invoke<Contact>("update_contact", { id, input });
}

export function deleteContact(id: number): Promise<void> {
  if (isPreview()) return mock.deleteContact(id);
  return invoke<void>("delete_contact", { id });
}

// ── Recordatorios ──

export function listReminders(f: {
  desde?: string;
  hasta?: string;
  solo_pendientes?: boolean;
  buscar?: string;
  limite?: number;
}): Promise<Reminder[]> {
  if (isPreview()) return mock.listReminders(f);
  return invoke<Reminder[]>("list_reminders", {
    desde: f.desde ?? null,
    hasta: f.hasta ?? null,
    solo_pendientes: f.solo_pendientes ?? null,
    buscar: f.buscar ?? null,
    limite: f.limite ?? null,
  });
}

export function createReminder(input: NewReminderInput): Promise<Reminder> {
  if (isPreview()) return mock.createReminder(input);
  return invoke<Reminder>("create_reminder", { input });
}

export function updateReminder(
  id: number,
  input: NewReminderInput,
): Promise<Reminder> {
  if (isPreview()) return mock.updateReminder(id, input);
  return invoke<Reminder>("update_reminder", { id, input });
}

export function deleteReminder(id: number): Promise<void> {
  if (isPreview()) return mock.deleteReminder(id);
  return invoke<void>("delete_reminder", { id });
}

export function setReminderDone(id: number, hecho: boolean): Promise<Reminder> {
  if (isPreview()) return mock.setReminderDone(id, hecho);
  return invoke<Reminder>("set_reminder_done", { id, hecho });
}

export function dueReminders(ahora: string): Promise<Reminder[]> {
  if (isPreview()) return mock.dueReminders(ahora);
  return invoke<Reminder[]>("due_reminders", { ahora });
}

// ── Sistema ──

export function getDataDir(): Promise<string> {
  if (isPreview()) return Promise.resolve("Memoria (vista previa web)");
  return invoke<string>("data_dir");
}

export function isAutostart(): Promise<boolean> {
  if (isPreview()) return mock.isAutostart();
  return invoke<boolean>("is_autostart");
}

export function setAutostart(enable: boolean): Promise<void> {
  if (isPreview()) return mock.setAutostart(enable);
  return invoke<void>("set_autostart", { enable });
}
