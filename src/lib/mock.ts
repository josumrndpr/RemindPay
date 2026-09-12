// RemindPay — backend web/PWA (navegador, iPhone) con IndexedDB persistente.
// Misma superficie que api.ts espera del backend Rust (db.rs): mismas
// validaciones, filtros, ordenamientos y reglas (centavos, pagado/pendiente,
// abonos con tope, vencidas derivadas, recurrentes por serie).
import { all, del, idb, kvGet, kvSet, put } from "./idb";
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
  Recurrence,
  Reminder,
} from "./types";

const SEED_CATEGORIES: [string, string, string][] = [
  ["Salario", "#10b981", "ingreso"],
  ["Ventas", "#22c55e", "ingreso"],
  ["Otros ingresos", "#2dd4bf", "ingreso"],
  ["Comida", "#f59e0b", "gasto"],
  ["Transporte", "#3b82f6", "gasto"],
  ["Vivienda", "#8b5cf6", "gasto"],
  ["Salud", "#ef4444", "gasto"],
  ["Suscripción", "#f43f5e", "gasto"],
  ["Entretenimiento", "#ec4899", "gasto"],
  ["Otros gastos", "#6b7280", "gasto"],
];

async function seed(): Promise<void> {
  await idb();
  if (await kvGet("seeded")) return;
  // Las categorías viven en kv (no hay tienda propia).
  const raw = await kvGet("categories");
  if (!raw) {
    const lista = SEED_CATEGORIES.map(([nombre, color, tipo], i) => ({
      id: i + 1,
      nombre,
      color,
      tipo,
    }));
    await kvSet("categories", JSON.stringify(lista));
  }
  await kvSet("seeded", "1");
}

async function getCats(): Promise<Category[]> {
  await seed();
  try {
    const raw = await kvGet("categories");
    if (raw) return JSON.parse(raw) as Category[];
  } catch {
    /* reseed abajo */
  }
  return [];
}

function catNombre(cats: Category[], id: number | null): string | null {
  if (id == null) return null;
  return cats.find((c) => c.id === id)?.nombre ?? null;
}

function toCents(monto: number): number {
  const cents = Math.round(monto * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("el monto debe ser mayor a 0");
  }
  return cents;
}

function fechaValida(f: string): boolean {
  return f.length === 10 && f[4] === "-";
}

function ahoraISO(): string {
  return new Date().toISOString();
}

// ── Pagos ──

function validarPago(p: NewPaymentInput): {
  cents: number;
  rec: Recurrence;
  estado: "pagado" | "pendiente";
} {
  if (p.tipo !== "ingreso" && p.tipo !== "gasto") throw new Error("tipo inválido");
  const cents = toCents(p.monto);
  if (!fechaValida(p.fecha)) throw new Error("fecha inválida (yyyy-MM-dd)");
  if (p.descripcion.trim().length > 280)
    throw new Error("descripción muy larga (máx 280)");
  const recStr = p.recurrente as string;
  const rec: Recurrence =
    recStr === "" || recStr === "none" ? "none" : (recStr as Recurrence);
  if (rec !== "none" && rec !== "daily" && rec !== "weekly" && rec !== "monthly")
    throw new Error("repetición inválida");
  if (p.comprobante_path.length > 120) throw new Error("comprobante inválido");
  if (p.estado !== "pagado" && p.estado !== "pendiente")
    throw new Error("estado inválido");
  return { cents, rec, estado: p.estado };
}

function hidratarPago(cats: Category[], r: Payment): Payment {
  return {
    ...r,
    categoria: catNombre(cats, r.categoria_id),
    contacto_id: r.contacto_id ?? null,
  };
}

export async function listPayments(f: {
  tipo?: string;
  mes?: string;
  buscar?: string;
  estado?: string;
  limite?: number;
}): Promise<Payment[]> {
  const [cats, rows] = await Promise.all([
    getCats(),
    all<Payment>("payments"),
  ]);
  const q = (f.buscar ?? "").trim().toLowerCase();
  let out = rows.filter((p) => {
    if ((f.tipo === "ingreso" || f.tipo === "gasto") && p.tipo !== f.tipo)
      return false;
    if (
      (f.estado === "pagado" || f.estado === "pendiente") &&
      p.estado !== f.estado
    )
      return false;
    if (f.mes && f.mes.length === 7 && p.fecha.slice(0, 7) !== f.mes)
      return false;
    if (q) {
      const cat = (catNombre(cats, p.categoria_id) ?? "").toLowerCase();
      if (
        !p.descripcion.toLowerCase().includes(q) &&
        !cat.includes(q)
      )
        return false;
    }
    return true;
  });
  out.sort((a, b) =>
    a.fecha === b.fecha ? b.id - a.id : b.fecha.localeCompare(a.fecha),
  );
  const lim = Math.min(Math.max(f.limite ?? 500, 1), 2000);
  out = out.slice(0, lim);
  return out.map((r) => hidratarPago(cats, r));
}

async function getPayment(id: number): Promise<Payment> {
  const [cats, rows] = await Promise.all([
    getCats(),
    all<Payment>("payments"),
  ]);
  const r = rows.find((p) => p.id === id);
  if (!r) throw new Error("pago no encontrado");
  return hidratarPago(cats, r);
}

export async function createPayment(input: NewPaymentInput): Promise<Payment> {
  const { cents, rec, estado } = validarPago(input);
  const id = await put<Omit<Payment, "id">>("payments", {
    tipo: input.tipo,
    monto_cents: cents,
    fecha: input.fecha,
    categoria_id: input.categoria_id,
    categoria: null,
    descripcion: input.descripcion.trim(),
    contacto_id: input.contacto_id,
    comprobante_path: input.comprobante_path.trim(),
    recurrente: rec,
    serie_id: null,
    estado,
    created_at: ahoraISO(),
  });
  return getPayment(id);
}

export async function updatePayment(
  id: number,
  input: NewPaymentInput,
): Promise<Payment> {
  const { cents, rec, estado } = validarPago(input);
  const rows = await all<Payment>("payments");
  const cur = rows.find((p) => p.id === id);
  if (!cur) throw new Error("pago no encontrado");
  await put<Payment>("payments", {
    ...cur,
    tipo: input.tipo,
    monto_cents: cents,
    fecha: input.fecha,
    categoria_id: input.categoria_id,
    contacto_id: input.contacto_id,
    descripcion: input.descripcion.trim(),
    recurrente: rec,
    comprobante_path: input.comprobante_path.trim(),
    estado,
  });
  return getPayment(id);
}

export async function deletePayment(id: number): Promise<void> {
  const rows = await all<Payment>("payments");
  if (!rows.some((p) => p.id === id)) throw new Error("pago no encontrado");
  await del("payments", id);
}

export async function marcarPago(id: number, estado: string): Promise<Payment> {
  if (estado !== "pagado" && estado !== "pendiente")
    throw new Error("estado inválido");
  const rows = await all<Payment>("payments");
  const cur = rows.find((p) => p.id === id);
  if (!cur) throw new Error("pago no encontrado");
  await put<Payment>("payments", {
    ...cur,
    estado: estado as "pagado" | "pendiente",
  });
  return getPayment(id);
}

export async function paymentsSummary(mes: string): Promise<MonthSummary> {
  if (mes.length !== 7) throw new Error("mes inválido (yyyy-MM)");
  const rows = await all<Payment>("payments");
  const items = rows.filter(
    (p) => p.fecha.slice(0, 7) === mes && p.estado === "pagado",
  );
  const ing = items
    .filter((p) => p.tipo === "ingreso")
    .reduce((a, p) => a + p.monto_cents, 0);
  const gas = items
    .filter((p) => p.tipo === "gasto")
    .reduce((a, p) => a + p.monto_cents, 0);
  return {
    mes,
    ingresos_cents: ing,
    gastos_cents: gas,
    balance_cents: ing - gas,
    count: items.length,
  };
}

export async function listCategories(): Promise<Category[]> {
  const cats = await getCats();
  return [...cats].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── Deudas ──

function derivar(d: Debt, hoy: string): Debt {
  if (
    d.estado === "activa" &&
    d.fecha_limite !== "" &&
    d.fecha_limite < hoy
  ) {
    return { ...d, estado: "vencida" };
  }
  return d;
}

function validarDeudaCuerpo(
  persona: string,
  total: number,
  fechaLimite: string,
  notas: string,
): { persona: string; cents: number } {
  const p = persona.trim();
  if (!p) throw new Error("falta la persona");
  if (p.length > 120) throw new Error("persona muy larga (máx 120)");
  const cents = toCents(total);
  if (fechaLimite !== "" && !fechaValida(fechaLimite))
    throw new Error("fecha límite inválida");
  if (notas.trim().length > 500) throw new Error("notas muy largas (máx 500)");
  return { persona: p, cents };
}

async function hidratarDeudas(
  rows: Debt[],
  hoy: string,
): Promise<Debt[]> {
  const contacts = await all<Contact>("contacts");
  const nombre = (id: number | null) =>
    id == null ? null : (contacts.find((c) => c.id === id)?.nombre ?? null);
  return rows.map((d) =>
    derivar({ ...d, contacto: nombre(d.contacto_id) }, hoy),
  );
}

export async function listDebts(f: {
  direccion?: string;
  estado?: string;
  buscar?: string;
  limite?: number;
  hoy?: string;
}): Promise<Debt[]> {
  const hoy =
    f.hoy && f.hoy.length === 10
      ? f.hoy
      : new Date().toISOString().slice(0, 10);
  const rows = await all<Debt>("debts");
  const q = (f.buscar ?? "").trim().toLowerCase();
  let out = rows.filter((d) => {
    if (
      (f.direccion === "debo" || f.direccion === "me_deben") &&
      d.direccion !== f.direccion
    )
      return false;
    if (q) {
      if (
        !d.persona.toLowerCase().includes(q) &&
        !d.notas.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });
  let list = await hidratarDeudas(out, hoy);
  if (f.estado === "activa" || f.estado === "vencida" || f.estado === "saldada") {
    list = list.filter((d) => d.estado === f.estado);
  }
  list.sort((a, b) => {
    const ra = a.estado === "saldada" ? 1 : 0;
    const rb = b.estado === "saldada" ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (a.fecha_limite !== b.fecha_limite)
      return a.fecha_limite.localeCompare(b.fecha_limite);
    return a.id - b.id;
  });
  return list.slice(0, Math.min(Math.max(f.limite ?? 500, 1), 2000));
}

async function getDebt(id: number, hoy: string): Promise<Debt> {
  const rows = await all<Debt>("debts");
  const d = rows.find((x) => x.id === id);
  if (!d) throw new Error("deuda no encontrada");
  return (await hidratarDeudas([d], hoy))[0];
}

export async function createDebt(
  input: NewDebtInput,
  hoy: string,
): Promise<Debt> {
  if (input.direccion !== "debo" && input.direccion !== "me_deben")
    throw new Error("dirección inválida");
  const { persona, cents } = validarDeudaCuerpo(
    input.persona,
    input.monto_total,
    input.fecha_limite,
    input.notas,
  );
  const id = await put<Omit<Debt, "id">>("debts", {
    direccion: input.direccion,
    persona,
    contacto_id: input.contacto_id,
    contacto: null,
    monto_total_cents: cents,
    saldo_cents: cents,
    fecha_limite: input.fecha_limite,
    estado: "activa",
    notas: input.notas.trim(),
    created_at: ahoraISO(),
  });
  return getDebt(id, hoy);
}

export async function updateDebt(
  id: number,
  input: EditDebtInput,
  hoy: string,
): Promise<Debt> {
  const { persona, cents } = validarDeudaCuerpo(
    input.persona,
    input.monto_total,
    input.fecha_limite,
    input.notas,
  );
  const rows = await all<Debt>("debts");
  const cur = rows.find((x) => x.id === id);
  if (!cur) throw new Error("deuda no encontrada");
  if (cur.estado === "saldada" && cents !== cur.monto_total_cents)
    throw new Error("no se puede cambiar el total de una deuda saldada");
  const saldo = Math.max(0, cur.saldo_cents + (cents - cur.monto_total_cents));
  await put<Debt>("debts", {
    ...cur,
    persona,
    contacto_id: input.contacto_id,
    monto_total_cents: cents,
    saldo_cents: saldo,
    fecha_limite: input.fecha_limite,
    notas: input.notas.trim(),
  });
  return getDebt(id, hoy);
}

export async function deleteDebt(id: number): Promise<void> {
  const rows = await all<Debt>("debts");
  if (!rows.some((x) => x.id === id)) throw new Error("deuda no encontrada");
  await del("debts", id);
}

export async function addDebtPayment(
  debtId: number,
  input: NewDebtPaymentInput,
  hoy: string,
): Promise<Debt> {
  const cents = toCents(input.monto);
  if (!fechaValida(input.fecha)) throw new Error("fecha inválida (yyyy-MM-dd)");
  if (input.nota.trim().length > 280)
    throw new Error("nota muy larga (máx 280)");
  const rows = await all<Debt>("debts");
  const cur = rows.find((x) => x.id === debtId);
  if (!cur) throw new Error("deuda no encontrada");
  if (cur.estado === "saldada" || cur.saldo_cents <= 0)
    throw new Error("la deuda ya está saldada");
  const aplicado = Math.min(cents, cur.saldo_cents);
  await put<Omit<DebtPayment, "id">>("debt_payments", {
    debt_id: debtId,
    monto_cents: aplicado,
    fecha: input.fecha,
    nota: input.nota.trim(),
  });
  const saldo = cur.saldo_cents - aplicado;
  await put<Debt>("debts", {
    ...cur,
    saldo_cents: saldo,
    estado: saldo === 0 ? "saldada" : cur.estado,
  });
  return getDebt(debtId, hoy);
}

export async function listDebtPayments(
  debtId: number,
): Promise<DebtPayment[]> {
  const rows = await all<DebtPayment>("debt_payments");
  return rows
    .filter((r) => r.debt_id === debtId)
    .sort((a, b) =>
      a.fecha === b.fecha ? b.id - a.id : b.fecha.localeCompare(a.fecha),
    );
}

export async function debtsSummary(): Promise<DebtsSummary> {
  const rows = await all<Debt>("debts");
  const vivas = rows.filter((d) => d.estado !== "saldada");
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

function validarContacto(c: NewContactInput): string {
  const nombre = c.nombre.trim();
  if (!nombre) throw new Error("falta el nombre");
  if (nombre.length > 120) throw new Error("nombre muy largo (máx 120)");
  if (c.telefono.trim().length > 40)
    throw new Error("teléfono muy largo (máx 40)");
  if (c.nota.trim().length > 500) throw new Error("nota muy larga (máx 500)");
  return nombre;
}

export async function listContacts(buscar?: string): Promise<Contact[]> {
  const rows = await all<Contact>("contacts");
  const q = (buscar ?? "").trim().toLowerCase();
  return rows
    .filter(
      (c) =>
        !q ||
        c.nombre.toLowerCase().includes(q) ||
        c.telefono.toLowerCase().includes(q),
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .slice(0, 500);
}

export async function createContact(
  input: NewContactInput,
): Promise<Contact> {
  const nombre = validarContacto(input);
  const id = await put<Omit<Contact, "id">>("contacts", {
    nombre,
    telefono: input.telefono.trim(),
    nota: input.nota.trim(),
    created_at: ahoraISO(),
  });
  const rows = await all<Contact>("contacts");
  const c = rows.find((x) => x.id === id);
  if (!c) throw new Error("contacto no encontrado");
  return c;
}

export async function updateContact(
  id: number,
  input: NewContactInput,
): Promise<Contact> {
  const nombre = validarContacto(input);
  const rows = await all<Contact>("contacts");
  const cur = rows.find((x) => x.id === id);
  if (!cur) throw new Error("contacto no encontrado");
  await put<Contact>("contacts", {
    ...cur,
    nombre,
    telefono: input.telefono.trim(),
    nota: input.nota.trim(),
  });
  return (await all<Contact>("contacts")).find((x) => x.id === id) as Contact;
}

export async function deleteContact(id: number): Promise<void> {
  const rows = await all<Contact>("contacts");
  if (!rows.some((x) => x.id === id)) throw new Error("contacto no encontrado");
  await del("contacts", id);
  // Desvincula pagos y deudas (FK SET NULL del backend real).
  const [pays, debts] = await Promise.all([
    all<Payment>("payments"),
    all<Debt>("debts"),
  ]);
  await Promise.all([
    ...pays
      .filter((p) => p.contacto_id === id)
      .map((p) => put<Payment>("payments", { ...p, contacto_id: null })),
    ...debts
      .filter((d) => d.contacto_id === id)
      .map((d) => put<Debt>("debts", { ...d, contacto_id: null })),
  ]);
}

// ── Recordatorios ──

function validarReminder(r: NewReminderInput): void {
  const t = r.titulo.trim();
  if (!t) throw new Error("falta el título");
  if (t.length > 140) throw new Error("título muy largo (máx 140)");
  if (!(r.fecha_hora.length === 16 && r.fecha_hora[4] === "-" && r.fecha_hora[10] === "T"))
    throw new Error("fecha/hora inválida");
  if (!["none", "daily", "weekly", "monthly"].includes(r.repetir))
    throw new Error("repetición inválida");
  if (r.detalle.trim().length > 500)
    throw new Error("detalle muy largo (máx 500)");
}

export async function listReminders(f: {
  desde?: string;
  hasta?: string;
  solo_pendientes?: boolean;
  buscar?: string;
  limite?: number;
}): Promise<Reminder[]> {
  const rows = await all<Reminder>("reminders");
  const q = (f.buscar ?? "").trim().toLowerCase();
  let out = rows.filter((r) => {
    if (f.solo_pendientes === true && r.hecho) return false;
    if (f.desde && f.desde.length >= 10 && r.fecha_hora < f.desde) return false;
    if (f.hasta && f.hasta.length >= 10 && r.fecha_hora > f.hasta) return false;
    if (
      q &&
      !r.titulo.toLowerCase().includes(q) &&
      !r.detalle.toLowerCase().includes(q)
    )
      return false;
    return true;
  });
  out.sort((a, b) => {
    if (a.hecho !== b.hecho) return a.hecho ? 1 : -1;
    if (a.fecha_hora !== b.fecha_hora)
      return a.fecha_hora.localeCompare(b.fecha_hora);
    return b.id - a.id;
  });
  return out.slice(0, Math.min(Math.max(f.limite ?? 500, 1), 2000));
}

async function getReminder(id: number): Promise<Reminder> {
  const rows = await all<Reminder>("reminders");
  const r = rows.find((x) => x.id === id);
  if (!r) throw new Error("recordatorio no encontrado");
  return r;
}

export async function createReminder(
  input: NewReminderInput,
): Promise<Reminder> {
  validarReminder(input);
  const id = await put<Omit<Reminder, "id">>("reminders", {
    titulo: input.titulo.trim(),
    detalle: input.detalle.trim(),
    fecha_hora: input.fecha_hora,
    repetir: input.repetir,
    payment_id: input.payment_id,
    debt_id: input.debt_id,
    sonido: input.sonido,
    persistente: input.persistente,
    hecho: false,
    created_at: ahoraISO(),
  });
  return getReminder(id);
}

export async function updateReminder(
  id: number,
  input: NewReminderInput,
): Promise<Reminder> {
  validarReminder(input);
  const cur = await getReminder(id);
  await put<Reminder>("reminders", {
    ...cur,
    titulo: input.titulo.trim(),
    detalle: input.detalle.trim(),
    fecha_hora: input.fecha_hora,
    repetir: input.repetir,
    payment_id: input.payment_id,
    debt_id: input.debt_id,
    sonido: input.sonido,
    persistente: input.persistente,
  });
  return getReminder(id);
}

export async function deleteReminder(id: number): Promise<void> {
  await getReminder(id);
  await del("reminders", id);
}

export async function setReminderDone(
  id: number,
  hecho: boolean,
): Promise<Reminder> {
  const cur = await getReminder(id);
  await put<Reminder>("reminders", { ...cur, hecho });
  return getReminder(id);
}

export async function dueReminders(ahora: string): Promise<Reminder[]> {
  const rows = await all<Reminder>("reminders");
  return rows
    .filter((r) => !r.hecho && r.fecha_hora <= ahora)
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
    .slice(0, 50);
}

// ── Ajustes, PIN, respaldos (web: todo en IndexedDB) ──

let mockAutostart = false;

export async function isAutostart(): Promise<boolean> {
  return mockAutostart;
}

export async function setAutostart(enable: boolean): Promise<void> {
  mockAutostart = enable;
}

export async function getSetting(clave: string): Promise<string | null> {
  await idb();
  return kvGet(`s:${clave}`);
}

export async function setSetting(clave: string, valor: string): Promise<void> {
  await idb();
  await kvSet(`s:${clave}`, valor);
}

async function sha256Hex(texto: string): Promise<string> {
  try {
    const cryptoObj = window.crypto?.subtle;
    if (cryptoObj) {
      const buf = await cryptoObj.digest(
        "SHA-256",
        new TextEncoder().encode(texto),
      );
      return [...new Uint8Array(buf)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    /* fallback abajo */
  }
  // Fallback sin secure-context (http en red local): hash no criptográfico.
  // Es puerta local, no cifrado — igual que el PIN en PC.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `fb-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}`;
}

export async function isPinSet(): Promise<boolean> {
  await idb();
  return (await kvGet("pin_hash")) !== null;
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin))
    throw new Error("el PIN debe tener de 4 a 8 dígitos");
  await idb();
  const salt = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  await kvSet("pin_salt", salt);
  await kvSet("pin_hash", await sha256Hex(`${salt}:${pin}`));
}

export async function verifyPin(pin: string): Promise<boolean> {
  await idb();
  const [salt, hash] = await Promise.all([
    kvGet("pin_salt"),
    kvGet("pin_hash"),
  ]);
  if (!salt || !hash) return false;
  return (await sha256Hex(`${salt}:${pin}`)) === hash;
}

export async function listBackups(): Promise<BackupInfo[]> {
  const rows = await all<BackupInfo & { id: number; json: string }>("backups");
  return rows
    .sort((a, b) => b.id - a.id)
    .map(({ nombre, bytes, creado_secs }) => ({ nombre, bytes, creado_secs }));
}

export async function createBackup(stamp: string): Promise<BackupInfo> {
  const [payments, debts, debtPayments, contacts, reminders, budgets, cats] =
    await Promise.all([
      all("payments"),
      all("debts"),
      all("debt_payments"),
      all("contacts"),
      all("reminders"),
      all("budgets"),
      getCats(),
    ]);
  const json = JSON.stringify({
    app: "remindpay",
    v: 1,
    stamp,
    categories: cats,
    payments,
    debts,
    debt_payments: debtPayments,
    contacts,
    reminders,
    budgets,
  });
  const b: BackupInfo = {
    nombre: `remindpay-${stamp}.json`,
    bytes: new Blob([json]).size,
    creado_secs: Math.floor(Date.now() / 1000),
  };
  await put("backups", { ...b, json });
  const rows = await all<{ id: number }>("backups");
  const viejos = rows.sort((a, b) => a.id - b.id).slice(0, Math.max(0, rows.length - 30));
  await Promise.all(viejos.map((r) => del("backups", r.id)));
  return b;
}

// ── Recurrentes, presupuestos, resumen ──

function esBisiesto(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function diasMes(y: number, m: number): number {
  if ([1, 3, 5, 7, 8, 10, 12].includes(m)) return 31;
  if ([4, 6, 9, 11].includes(m)) return 30;
  return esBisiesto(y) ? 29 : 28;
}

function sumarDias(fecha: string, n: number): string {
  let t = Date.UTC(
    Number(fecha.slice(0, 4)),
    Number(fecha.slice(5, 7)) - 1,
    Number(fecha.slice(8, 10)),
  );
  t += n * 86400000;
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function siguienteOcurrencia(rep: string, desde: string): string {
  if (rep === "daily") return sumarDias(desde, 1);
  if (rep === "weekly") return sumarDias(desde, 7);
  const y = Number(desde.slice(0, 4));
  const m = Number(desde.slice(5, 7));
  const d = Number(desde.slice(8, 10));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${ny}-${p(nm)}-${p(Math.min(d, diasMes(ny, nm)))}`;
}

export async function generarRecurrentes(hoy: string): Promise<number> {
  if (hoy.length !== 10) throw new Error("fecha inválida");
  const [cats, rows] = await Promise.all([
    getCats(),
    all<Payment>("payments"),
  ]);
  let total = 0;
  for (const t of rows.filter(
    (p) => p.recurrente !== "none" && p.serie_id == null,
  )) {
    const serie = rows.filter((p) => p.id === t.id || p.serie_id === t.id);
    const last = serie.map((p) => p.fecha).sort().pop() as string;
    let next = siguienteOcurrencia(t.recurrente, last);
    let guard = 0;
    while (next <= hoy && guard < 365) {
      await put<Omit<Payment, "id">>("payments", {
        tipo: t.tipo,
        monto_cents: t.monto_cents,
        fecha: next,
        categoria_id: t.categoria_id,
        categoria: catNombre(cats, t.categoria_id),
        descripcion: t.descripcion,
        contacto_id: t.contacto_id,
        comprobante_path: t.comprobante_path,
        recurrente: "none",
        serie_id: t.id,
        estado: "pendiente",
        created_at: ahoraISO(),
      });
      total++;
      guard++;
      next = siguienteOcurrencia(t.recurrente, next);
    }
  }
  return total;
}

interface BudgetRow {
  id: number;
  categoria_id: number;
  monto_cents: number;
}

export async function listBudgets(mes: string): Promise<BudgetView[]> {
  const [cats, pays, rows] = await Promise.all([
    getCats(),
    all<Payment>("payments"),
    all<BudgetRow>("budgets"),
  ]);
  return rows
    .map((b) => {
      const c = cats.find((x) => x.id === b.categoria_id);
      if (!c) return null;
      const gastado = pays
        .filter(
          (p) =>
            p.categoria_id === c.id &&
            p.tipo === "gasto" &&
            p.estado === "pagado" &&
            p.fecha.slice(0, 7) === mes,
        )
        .reduce((a, p) => a + p.monto_cents, 0);
      return {
        id: b.id,
        categoria_id: c.id,
        categoria: c.nombre,
        color: c.color,
        monto_cents: b.monto_cents,
        gastado_cents: gastado,
        pct:
          b.monto_cents > 0
            ? Math.floor((gastado * 100) / b.monto_cents)
            : 0,
      } as BudgetView;
    })
    .filter((x): x is BudgetView => x !== null)
    .sort((a, b) => a.categoria.localeCompare(b.categoria));
}

export async function setBudget(
  categoriaId: number,
  monto: number,
): Promise<void> {
  const cats = await getCats();
  if (!cats.some((c) => c.id === categoriaId))
    throw new Error("categoría no existe");
  const cents = toCents(monto);
  const rows = await all<BudgetRow>("budgets");
  const cur = rows.find((x) => x.categoria_id === categoriaId);
  if (cur) await put<BudgetRow>("budgets", { ...cur, monto_cents: cents });
  else
    await put<Omit<BudgetRow, "id">>("budgets", {
      categoria_id: categoriaId,
      monto_cents: cents,
    });
}

export async function deleteBudget(id: number): Promise<void> {
  const rows = await all<BudgetRow>("budgets");
  if (!rows.some((x) => x.id === id))
    throw new Error("presupuesto no encontrado");
  await del("budgets", id);
}

export async function resumenMensual(meses: string[]): Promise<MonthPoint[]> {
  const out: MonthPoint[] = [];
  for (const mes of meses) {
    const s = await paymentsSummary(mes);
    out.push({
      mes: s.mes,
      ingresos_cents: s.ingresos_cents,
      gastos_cents: s.gastos_cents,
    });
  }
  return out;
}

// ── Comprobantes (web: blobs en IndexedDB) ──

const COMP_TIPOS = ["png", "jpg", "jpeg", "webp", "pdf"];
const COMP_MAX = 10 * 1024 * 1024;

const compUrls = new Map<string, string>();

export async function adjuntarPreview(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!COMP_TIPOS.includes(ext))
    throw new Error("solo PNG, JPG, WEBP o PDF");
  if (file.size > COMP_MAX) throw new Error("máximo 10MB");
  const limpio = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 50);
  const nombre = `web-${Date.now()}-${limpio}`;
  await put("files", { nombre, blob: file, tipo: file.type });
  return nombre;
}

export async function abrirComprobantePreview(nombre: string): Promise<void> {
  let url = compUrls.get(nombre);
  if (!url) {
    const rows = await all<{ nombre: string; blob: Blob }>("files");
    const f = rows.find((r) => r.nombre === nombre);
    if (!f) throw new Error("comprobante no encontrado");
    url = URL.createObjectURL(f.blob);
    compUrls.set(nombre, url);
  }
  window.open(url, "_blank");
}
