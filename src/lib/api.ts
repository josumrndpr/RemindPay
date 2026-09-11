// RemindPay — wrappers tipados de comandos Tauri (Rust).
// En navegador (sin runtime Tauri) usan el mock local para vista previa.
import { invoke } from "@tauri-apps/api/core";
import { todayLocal } from "./format";
import * as mock from "./mock";
import type {
  BackupInfo,
  BudgetView,
  Category,
  Contact,
  Debt,
  DebtPayment,
  DebtsSummary,
  EditDebtInput,
  MonthPoint,
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
  estado?: string;
  limite?: number;
}): Promise<Payment[]> {
  if (isPreview()) return mock.listPayments(f);
  return invoke<Payment[]>("list_payments", {
    tipo: f.tipo ?? null,
    mes: f.mes ?? null,
    buscar: f.buscar ?? null,
    estado: f.estado ?? null,
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

export function marcarPago(id: number, estado: string): Promise<Payment> {
  if (isPreview()) return mock.marcarPago(id, estado);
  return invoke<Payment>("marcar_pago", { id, estado });
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

// ── Ajustes, PIN, respaldos ──

export function getSetting(clave: string): Promise<string | null> {
  if (isPreview()) return mock.getSetting(clave);
  return invoke<string | null>("get_setting", { clave });
}

export function setSetting(clave: string, valor: string): Promise<void> {
  if (isPreview()) return mock.setSetting(clave, valor);
  return invoke<void>("set_setting", { clave, valor });
}

export function isPinSet(): Promise<boolean> {
  if (isPreview()) return mock.isPinSet();
  return invoke<boolean>("is_pin_set");
}

export function setPin(pin: string): Promise<void> {
  if (isPreview()) return mock.setPin(pin);
  return invoke<void>("set_pin", { pin });
}

export function verifyPin(pin: string): Promise<boolean> {
  if (isPreview()) return mock.verifyPin(pin);
  return invoke<boolean>("verify_pin", { pin });
}

export function listBackups(): Promise<BackupInfo[]> {
  if (isPreview()) return mock.listBackups();
  return invoke<BackupInfo[]>("list_backups");
}

export function createBackup(stamp: string): Promise<BackupInfo> {
  if (isPreview()) return mock.createBackup(stamp);
  return invoke<BackupInfo>("create_backup", { stamp });
}

/** Solo app instalada (en vista previa export.ts descarga directo). */
export function writeTextFile(path: string, content: string): Promise<void> {
  return invoke<void>("write_text_file", { path, content });
}

// ── Comprobantes, recurrentes, presupuestos ──

export function guardarComprobante(
  origen: string,
  stamp: string,
): Promise<string> {
  if (isPreview())
    return Promise.reject(new Error("solo en la app instalada"));
  return invoke<string>("guardar_comprobante", { origen, stamp });
}

export function rutaComprobante(nombre: string): Promise<string> {
  return invoke<string>("ruta_comprobante", { nombre });
}

export async function abrirComprobante(nombre: string): Promise<void> {
  if (isPreview()) return mock.abrirComprobantePreview(nombre);
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(await rutaComprobante(nombre));
}

export function generarRecurrentes(hoy: string): Promise<number> {
  if (isPreview()) return mock.generarRecurrentes(hoy);
  return invoke<number>("generar_recurrentes", { hoy });
}

export function listBudgets(mes: string): Promise<BudgetView[]> {
  if (isPreview()) return mock.listBudgets(mes);
  return invoke<BudgetView[]>("list_budgets", { mes });
}

export function setBudget(
  categoriaId: number,
  monto: number,
): Promise<void> {
  if (isPreview()) return mock.setBudget(categoriaId, monto);
  return invoke<void>("set_budget", { categoria_id: categoriaId, monto });
}

export function deleteBudget(id: number): Promise<void> {
  if (isPreview()) return mock.deleteBudget(id);
  return invoke<void>("delete_budget", { id });
}

export function resumenMensual(meses: string[]): Promise<MonthPoint[]> {
  if (isPreview()) return mock.resumenMensual(meses);
  return invoke<MonthPoint[]>("resumen_mensual", { meses });
}
