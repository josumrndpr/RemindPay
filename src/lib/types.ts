// RemindPay — tipos compartidos (montos en centavos USD: 1999 = $19.99)

export type Money = number;

export type PaymentType = "ingreso" | "gasto";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface Category {
  id: number;
  nombre: string;
  color: string;
  tipo: PaymentType | "ambos";
}

export interface Contact {
  id: number;
  nombre: string;
  telefono: string;
  nota: string;
  created_at: string;
}

export interface NewContactInput {
  nombre: string;
  telefono: string;
  nota: string;
}

export interface Payment {
  id: number;
  tipo: PaymentType;
  monto_cents: Money;
  fecha: string; // yyyy-MM-dd
  categoria_id: number | null;
  categoria: string | null;
  descripcion: string;
  contacto_id: number | null;
  comprobante_path: string;
  recurrente: Recurrence;
  serie_id?: number | null;
  estado: "pagado" | "pendiente";
  created_at: string;
}

/** Lo que envía el frontend al crear/editar: monto en dólares. */
export interface NewPaymentInput {
  tipo: PaymentType;
  monto: number;
  fecha: string;
  categoria_id: number | null;
  contacto_id: number | null;
  descripcion: string;
  recurrente: Recurrence;
  comprobante_path: string;
  estado: "pagado" | "pendiente";
}

export interface MonthSummary {
  mes: string;
  ingresos_cents: Money;
  gastos_cents: Money;
  balance_cents: Money;
  count: number;
}

export type DebtDirection = "debo" | "me_deben";
export type DebtStatus = "activa" | "vencida" | "saldada";

export interface Debt {
  id: number;
  direccion: DebtDirection;
  persona: string;
  contacto_id: number | null;
  contacto: string | null;
  monto_total_cents: Money;
  saldo_cents: Money;
  fecha_limite: string; // yyyy-MM-dd o ""
  estado: DebtStatus;
  notas: string;
  created_at: string;
}

export interface NewDebtInput {
  direccion: DebtDirection;
  persona: string;
  contacto_id: number | null;
  monto_total: number; // dólares
  fecha_limite: string;
  notas: string;
}

export interface EditDebtInput {
  persona: string;
  contacto_id: number | null;
  monto_total: number;
  fecha_limite: string;
  notas: string;
}

export interface DebtPayment {
  id: number;
  debt_id: number;
  monto_cents: Money;
  fecha: string;
  nota: string;
}

export interface NewDebtPaymentInput {
  monto: number; // dólares
  fecha: string;
  nota: string;
}

export interface DebtsSummary {
  por_pagar_cents: Money;
  por_cobrar_cents: Money;
  activas: number;
}

export interface BackupInfo {
  nombre: string;
  bytes: number;
  creado_secs: number;
}

export interface BudgetView {
  id: number;
  categoria_id: number;
  categoria: string;
  color: string;
  monto_cents: number;
  gastado_cents: number;
  pct: number;
}

export interface MonthPoint {
  mes: string;
  ingresos_cents: number;
  gastos_cents: number;
}

export interface Reminder {
  id: number;
  titulo: string;
  detalle: string;
  fecha_hora: string; // yyyy-MM-ddTHH:mm
  repetir: Recurrence;
  payment_id: number | null;
  debt_id: number | null;
  sonido: boolean;
  persistente: boolean;
  hecho: boolean;
  created_at: string;
}

export interface NewReminderInput {
  titulo: string;
  detalle: string;
  fecha_hora: string;
  repetir: Recurrence;
  payment_id: number | null;
  debt_id: number | null;
  sonido: boolean;
  persistente: boolean;
}

export type Section =
  | "dashboard"
  | "pagos"
  | "deudas"
  | "planificador"
  | "recordatorios"
  | "contactos"
  | "config";
