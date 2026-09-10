// RemindPay — backend simulado SOLO para vista previa web (sin runtime Tauri).
// Se usa únicamente cuando la app corre en navegador. Datos en memoria:
// se reinician al recargar. El backend real es SQLite en Rust (db.rs).
import { todayLocal } from "./format";
import type {
  Category,
  MonthSummary,
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
  { id: 8, nombre: "Entretenimiento", color: "#ec4899", tipo: "gasto" },
  { id: 9, nombre: "Otros gastos", color: "#6b7280", tipo: "gasto" },
];

let nextId = 10;
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

function validar(input: NewPaymentInput): number {
  if (input.tipo !== "ingreso" && input.tipo !== "gasto")
    throw new Error("tipo inválido");
  if (!Number.isFinite(input.monto) || input.monto <= 0)
    throw new Error("el monto debe ser mayor a 0");
  const cents = Math.round(input.monto * 100);
  if (cents <= 0) throw new Error("el monto debe ser mayor a 0");
  if (input.fecha.length !== 10) throw new Error("fecha inválida (yyyy-MM-dd)");
  if (input.descripcion.trim().length > 280)
    throw new Error("descripción muy larga (máx 280)");
  return cents;
}

function catNombre(id: number | null): string | null {
  return cats.find((c) => c.id === id)?.nombre ?? null;
}

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
  const cents = validar(input);
  const p: Payment = {
    id: nextId++,
    tipo: input.tipo,
    monto_cents: cents,
    fecha: input.fecha,
    categoria_id: input.categoria_id,
    categoria: catNombre(input.categoria_id),
    descripcion: input.descripcion.trim(),
    contacto_id: null,
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
  const cents = validar(input);
  const p = pays.find((x) => x.id === id);
  if (!p) throw new Error("pago no encontrado");
  p.tipo = input.tipo;
  p.monto_cents = cents;
  p.fecha = input.fecha;
  p.categoria_id = input.categoria_id;
  p.categoria = catNombre(input.categoria_id);
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
