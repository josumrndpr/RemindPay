// RemindPay — backend simulado SOLO para vista previa web (sin runtime Tauri).
// Se usa únicamente cuando la app corre en navegador. Datos en memoria:
// se reinician al recargar. El backend real es SQLite en Rust (db.rs).
import { todayLocal } from "./format";
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
  Payment,
} from "./types";

const MES = todayLocal().slice(0, 7);

const cats: Category[] = [
  { id: 1, nombre: "Salario", color: "#10b981", tipo: "ingreso" },
  { id: 2, nombre: "Ventas", color: "#22c55e", tipo: "ingreso" },
  { id: 3, nombre: "Otros ingresos", color: "#2dd4bf", tipo: "ingreso" },
  { id: 4, nombre: "Comida", color: "#f59e0b", tipo: "gasto" },
  { id: 5, nombre: "Transporte", color: "#3b82f6", tipo: "gasto" },
  { id: 6, nombre: "Vivienda", color: "#8b5cf6", tipo: "gasto" },
  { id: 7, nombre: "Salud", color: "#ef4444", tipo: "gasto" },
  { id: 8, nombre: "Suscripción", color: "#f43f5e", tipo: "gasto" },
  { id: 9, nombre: "Entretenimiento", color: "#ec4899", tipo: "gasto" },
  { id: 10, nombre: "Otros gastos", color: "#6b7280", tipo: "gasto" },
];

let paySeq = 10;
const pays: Payment[] = [
  {
    id: 1,
    tipo: "ingreso",
    monto_cents: 250000,
    fecha: `${MES}-05`,
    categoria_id: 1,
    categoria: "Salario",
    descripcion: "Salario quincenal (ejemplo)",
    contacto_id: null,
    comprobante_path: "",
    recurrente: "none",
    created_at: `${MES}-05T10:00:00`,
  },
  {
    id: 2,
    tipo: "gasto",
    monto_cents: 4550,
    fecha: `${MES}-06`,
    categoria_id: 4,
    categoria: "Comida",
    descripcion: "Compra supermercado (ejemplo)",
    contacto_id: null,
    comprobante_path: "",
    recurrente: "none",
    created_at: `${MES}-06T12:00:00`,
  },
  {
    id: 3,
    tipo: "gasto",
    monto_cents: 1200,
    fecha: `${MES}-07`,
    categoria_id: 5,
    categoria: "Transporte",
    descripcion: "Gasolina (ejemplo)",
    contacto_id: null,
    comprobante_path: "",
    recurrente: "none",
    created_at: `${MES}-07T09:00:00`,
  },
];

let contactSeq = 10;
const contacts: Contact[] = [
  {
    id: 1,
    nombre: "Juan Pérez",
    telefono: "787-555-0100",
    nota: "",
    created_at: `${MES}-01T10:00:00`,
  },
];

let debtSeq = 10;
const debts: Debt[] = [
  {
    id: 1,
    direccion: "debo",
    persona: "Colmado (ejemplo)",
    contacto_id: null,
    contacto: null,
    monto_total_cents: 5000,
    saldo_cents: 5000,
    fecha_limite: `${MES}-20`,
    estado: "activa",
    notas: "",
    created_at: `${MES}-02T10:00:00`,
  },
  {
    id: 2,
    direccion: "me_deben",
    persona: "Juan Pérez (ejemplo)",
    contacto_id: 1,
    contacto: "Juan Pérez",
    monto_total_cents: 20000,
    saldo_cents: 12000,
    fecha_limite: `${MES}-25`,
    estado: "activa",
    notas: "",
    created_at: `${MES}-03T10:00:00`,
  },
];

let dpSeq = 10;
const dpays: DebtPayment[] = [
  {
    id: 1,
    debt_id: 2,
    monto_cents: 8000,
    fecha: `${MES}-08`,
    nota: "Abono inicial (ejemplo)",
  },
];

function validarMonto(monto: number): number {
  if (!Number.isFinite(monto) || monto <= 0)
    throw new Error("el monto debe ser mayor a 0");
  return Math.round(monto * 100);
}

function validarPago(input: NewPaymentInput): number {
  if (input.tipo !== "ingreso" && input.tipo !== "gasto")
    throw new Error("tipo inválido");
  const cents = validarMonto(input.monto);
  if (input.fecha.length !== 10) throw new Error("fecha inválida (yyyy-MM-dd)");
  if (input.descripcion.trim().length > 280)
    throw new Error("descripción muy larga (máx 280)");
  return cents;
}

function catNombre(id: number | null): string | null {
  return cats.find((c) => c.id === id)?.nombre ?? null;
}

function derivar(d: Debt, hoy: string): Debt {
  if (d.estado === "activa" && d.fecha_limite && d.fecha_limite < hoy)
    return { ...d, estado: "vencida" };
  return { ...d };
}

// ── Pagos ──

export async function listPayments(f: {
  tipo?: string;
  mes?: string;
  buscar?: string;
  limite?: number;
}): Promise<Payment[]> {
  let out = [...pays].sort((a, b) =>
    a.fecha === b.fecha ? b.id - a.id : b.fecha.localeCompare(a.fecha),
  );
  if (f.tipo === "ingreso" || f.tipo === "gasto")
    out = out.filter((p) => p.tipo === f.tipo);
  if (f.mes && f.mes.length === 7)
    out = out.filter((p) => p.fecha.slice(0, 7) === f.mes);
  const q = (f.buscar ?? "").trim().toLowerCase();
  if (q)
    out = out.filter(
      (p) =>
        p.descripcion.toLowerCase().includes(q) ||
        (p.categoria ?? "").toLowerCase().includes(q),
    );
  return out.slice(0, Math.min(Math.max(f.limite ?? 200, 1), 2000));
}

export async function createPayment(input: NewPaymentInput): Promise<Payment> {
  const cents = validarPago(input);
  const p: Payment = {
    id: paySeq++,
    tipo: input.tipo,
    monto_cents: cents,
    fecha: input.fecha,
    categoria_id: input.categoria_id,
    categoria: catNombre(input.categoria_id),
    descripcion: input.descripcion.trim(),
    contacto_id: input.contacto_id,
    comprobante_path: "",
    recurrente: "none",
    created_at: new Date().toISOString(),
  };
  pays.push(p);
  return p;
}

export async function updatePayment(
  id: number,
  input: NewPaymentInput,
): Promise<Payment> {
  const cents = validarPago(input);
  const p = pays.find((x) => x.id === id);
  if (!p) throw new Error("pago no encontrado");
  p.tipo = input.tipo;
  p.monto_cents = cents;
  p.fecha = input.fecha;
  p.categoria_id = input.categoria_id;
  p.categoria = catNombre(input.categoria_id);
  p.contacto_id = input.contacto_id;
  p.descripcion = input.descripcion.trim();
  return p;
}

export async function deletePayment(id: number): Promise<void> {
  const i = pays.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("pago no encontrado");
  pays.splice(i, 1);
}

export async function paymentsSummary(mes: string): Promise<MonthSummary> {
  const items = pays.filter((p) => p.fecha.slice(0, 7) === mes);
  const ingresos = items
    .filter((p) => p.tipo === "ingreso")
    .reduce((a, p) => a + p.monto_cents, 0);
  const gastos = items
    .filter((p) => p.tipo === "gasto")
    .reduce((a, p) => a + p.monto_cents, 0);
  return {
    mes,
    ingresos_cents: ingresos,
    gastos_cents: gastos,
    balance_cents: ingresos - gastos,
    count: items.length,
  };
}

export async function listCategories(): Promise<Category[]> {
  return [...cats].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── Deudas ──

function validarDeuda(
  persona: string,
  total: number,
  fechaLimite: string,
  notas: string,
): { persona: string; cents: number } {
  const p = persona.trim();
  if (!p) throw new Error("falta la persona");
  if (p.length > 120) throw new Error("persona muy larga (máx 120)");
  const cents = validarMonto(total);
  if (fechaLimite && fechaLimite.length !== 10)
    throw new Error("fecha límite inválida");
  if (notas.trim().length > 500) throw new Error("notas muy largas (máx 500)");
  return { persona: p, cents };
}

function contactoNombre(id: number | null): string | null {
  return contacts.find((c) => c.id === id)?.nombre ?? null;
}

export async function listDebts(f: {
  direccion?: string;
  estado?: string;
  buscar?: string;
  limite?: number;
  hoy: string;
}): Promise<Debt[]> {
  let out = debts.map((d) => derivar(d, f.hoy));
  if (f.direccion === "debo" || f.direccion === "me_deben")
    out = out.filter((d) => d.direccion === f.direccion);
  const q = (f.buscar ?? "").trim().toLowerCase();
  if (q)
    out = out.filter(
      (d) =>
        d.persona.toLowerCase().includes(q) ||
        d.notas.toLowerCase().includes(q),
    );
  if (f.estado === "activa" || f.estado === "vencida" || f.estado === "saldada")
    out = out.filter((d) => d.estado === f.estado);
  out.sort((a, b) => {
    const ra = a.estado === "saldada" ? 1 : 0;
    const rb = b.estado === "saldada" ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (a.fecha_limite !== b.fecha_limite)
      return a.fecha_limite.localeCompare(b.fecha_limite);
    return a.id - b.id;
  });
  return out.slice(0, Math.min(Math.max(f.limite ?? 200, 1), 2000));
}

export async function createDebt(input: NewDebtInput, hoy: string): Promise<Debt> {
  if (input.direccion !== "debo" && input.direccion !== "me_deben")
    throw new Error("dirección inválida");
  const { persona, cents } = validarDeuda(
    input.persona,
    input.monto_total,
    input.fecha_limite,
    input.notas,
  );
  const d: Debt = {
    id: debtSeq++,
    direccion: input.direccion,
    persona,
    contacto_id: input.contacto_id,
    contacto: contactoNombre(input.contacto_id),
    monto_total_cents: cents,
    saldo_cents: cents,
    fecha_limite: input.fecha_limite,
    estado: "activa",
    notas: input.notas.trim(),
    created_at: new Date().toISOString(),
  };
  debts.push(d);
  return derivar(d, hoy);
}

export async function updateDebt(
  id: number,
  input: EditDebtInput,
  hoy: string,
): Promise<Debt> {
  const { persona, cents } = validarDeuda(
    input.persona,
    input.monto_total,
    input.fecha_limite,
    input.notas,
  );
  const d = debts.find((x) => x.id === id);
  if (!d) throw new Error("deuda no encontrada");
  if (d.estado === "saldada" && cents !== d.monto_total_cents)
    throw new Error("no se puede cambiar el total de una deuda saldada");
  d.persona = persona;
  d.contacto_id = input.contacto_id;
  d.contacto = contactoNombre(input.contacto_id);
  d.saldo_cents = Math.max(0, d.saldo_cents + (cents - d.monto_total_cents));
  d.monto_total_cents = cents;
  d.fecha_limite = input.fecha_limite;
  d.notas = input.notas.trim();
  return derivar(d, hoy);
}

export async function deleteDebt(id: number): Promise<void> {
  const i = debts.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("deuda no encontrada");
  debts.splice(i, 1);
  for (let j = dpays.length - 1; j >= 0; j--)
    if (dpays[j].debt_id === id) dpays.splice(j, 1);
}

export async function addDebtPayment(
  debtId: number,
  input: NewDebtPaymentInput,
  hoy: string,
): Promise<Debt> {
  const cents = validarMonto(input.monto);
  if (input.fecha.length !== 10) throw new Error("fecha inválida (yyyy-MM-dd)");
  if (input.nota.trim().length > 280)
    throw new Error("nota muy larga (máx 280)");
  const d = debts.find((x) => x.id === debtId);
  if (!d) throw new Error("deuda no encontrada");
  if (d.estado === "saldada" || d.saldo_cents <= 0)
    throw new Error("la deuda ya está saldada");
  const aplicado = Math.min(cents, d.saldo_cents);
  dpays.push({
    id: dpSeq++,
    debt_id: debtId,
    monto_cents: aplicado,
    fecha: input.fecha,
    nota: input.nota.trim(),
  });
  d.saldo_cents -= aplicado;
  if (d.saldo_cents === 0) d.estado = "saldada";
  return derivar(d, hoy);
}

export async function listDebtPayments(debtId: number): Promise<DebtPayment[]> {
  return dpays
    .filter((p) => p.debt_id === debtId)
    .sort((a, b) =>
      a.fecha === b.fecha ? b.id - a.id : b.fecha.localeCompare(a.fecha),
    );
}

export async function debtsSummary(): Promise<DebtsSummary> {
  const vivas = debts.filter((d) => d.estado !== "saldada");
  return {
    por_pagar_cents: vivas
      .filter((d) => d.direccion === "debo")
      .reduce((a, d) => a + d.saldo_cents, 0),
    por_cobrar_cents: vivas
      .filter((d) => d.direccion === "me_deben")
      .reduce((a, d) => a + d.saldo_cents, 0),
    activas: vivas.length,
  };
}

// ── Contactos ──

function validarContacto(input: NewContactInput): string {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("falta el nombre");
  if (nombre.length > 120) throw new Error("nombre muy largo (máx 120)");
  if (input.telefono.trim().length > 40)
    throw new Error("teléfono muy largo (máx 40)");
  if (input.nota.trim().length > 500)
    throw new Error("nota muy larga (máx 500)");
  return nombre;
}

export async function listContacts(buscar?: string): Promise<Contact[]> {
  const q = (buscar ?? "").trim().toLowerCase();
  return contacts
    .filter(
      (c) =>
        !q ||
        c.nombre.toLowerCase().includes(q) ||
        c.telefono.toLowerCase().includes(q),
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function createContact(input: NewContactInput): Promise<Contact> {
  const c: Contact = {
    id: contactSeq++,
    nombre: validarContacto(input),
    telefono: input.telefono.trim(),
    nota: input.nota.trim(),
    created_at: new Date().toISOString(),
  };
  contacts.push(c);
  return c;
}

export async function updateContact(
  id: number,
  input: NewContactInput,
): Promise<Contact> {
  const c = contacts.find((x) => x.id === id);
  if (!c) throw new Error("contacto no encontrado");
  c.nombre = validarContacto(input);
  c.telefono = input.telefono.trim();
  c.nota = input.nota.trim();
  for (const d of debts)
    if (d.contacto_id === id) d.contacto = c.nombre;
  return c;
}

export async function deleteContact(id: number): Promise<void> {
  const i = contacts.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("contacto no encontrado");
  contacts.splice(i, 1);
  for (const p of pays) if (p.contacto_id === id) p.contacto_id = null;
  for (const d of debts)
    if (d.contacto_id === id) {
      d.contacto_id = null;
      d.contacto = null;
    }
}
