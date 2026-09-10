//! RemindPay — acceso SQLite.
//! Funciones puras sobre `&Connection`: la app real usa el archivo data.db,
//! los tests usan base en memoria. Sin `chrono`: fechas como TEXT ISO
//! (el orden lexicográfico equivale al cronológico).

use crate::models::{
    Category, Contact, Debt, DebtFilter, DebtPayment, DebtsSummary, EditDebt, MonthSummary,
    NewContact, NewDebt, NewDebtPayment, NewPayment, NewReminder, Payment, PaymentFilter, Reminder,
    ReminderFilter,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rusqlite::{params, Connection, Row};

const SCHEMA: &str = include_str!("../schema.sql");

const SEED_CATEGORIES: &[(&str, &str, &str)] = &[
    ("Salario", "#10b981", "ingreso"),
    ("Ventas", "#22c55e", "ingreso"),
    ("Otros ingresos", "#2dd4bf", "ingreso"),
    ("Comida", "#f59e0b", "gasto"),
    ("Transporte", "#3b82f6", "gasto"),
    ("Vivienda", "#8b5cf6", "gasto"),
    ("Salud", "#ef4444", "gasto"),
    ("Suscripción", "#f43f5e", "gasto"),
    ("Entretenimiento", "#ec4899", "gasto"),
    ("Otros gastos", "#6b7280", "gasto"),
];

/// Crea tablas + categorías iniciales. Idempotente por nombre:
/// agrega las que falten (ej. Suscripción en DBs creadas antes).
pub fn init(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("pragmas: {e}"))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("schema: {e}"))?;
    for (nombre, color, tipo) in SEED_CATEGORIES {
        conn.execute(
            "INSERT INTO categories (nombre, color, tipo) SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE nombre = ?1)",
            params![nombre, color, tipo],
        )
        .map_err(|e| format!("seed: {e}"))?;
    }
    Ok(())
}

/// Dólares → centavos con validación compartida.
fn to_cents(monto: f64) -> Result<i64, String> {
    if !monto.is_finite() || monto <= 0.0 {
        return Err("el monto debe ser mayor a 0".into());
    }
    if monto > 999_999_999.0 {
        return Err("monto demasiado grande".into());
    }
    let cents = (monto * 100.0).round() as i64;
    if cents <= 0 {
        return Err("el monto debe ser mayor a 0".into());
    }
    Ok(cents)
}

fn fecha_valida(fecha: &str) -> bool {
    fecha.len() == 10 && fecha.as_bytes()[4] == b'-'
}

// ── Pagos ────────────────────────────────────────────────────────────────

/// Valida un pago y devuelve el monto en centavos USD.
pub fn validate(input: &NewPayment) -> Result<i64, String> {
    if input.tipo != "ingreso" && input.tipo != "gasto" {
        return Err("tipo inválido".into());
    }
    let cents = to_cents(input.monto)?;
    if !fecha_valida(&input.fecha) {
        return Err("fecha inválida (yyyy-MM-dd)".into());
    }
    if input.descripcion.trim().len() > 280 {
        return Err("descripción muy larga (máx 280)".into());
    }
    Ok(cents)
}

fn row_to_payment(row: &Row) -> rusqlite::Result<Payment> {
    Ok(Payment {
        id: row.get(0)?,
        tipo: row.get(1)?,
        monto_cents: row.get(2)?,
        fecha: row.get(3)?,
        categoria_id: row.get(4)?,
        categoria: row.get(5)?,
        descripcion: row.get(6)?,
        contacto_id: row.get(7)?,
        comprobante_path: row.get(8)?,
        recurrente: row.get(9)?,
        created_at: row.get(10)?,
    })
}

const PAYMENT_SELECT: &str = "SELECT p.id, p.tipo, p.monto_cents, p.fecha, p.categoria_id, c.nombre, p.descripcion, p.contacto_id, p.comprobante_path, p.recurrente, p.created_at FROM payments p LEFT JOIN categories c ON c.id = p.categoria_id";

pub fn get_payment(conn: &Connection, id: i64) -> Result<Payment, String> {
    conn.query_row(
        &format!("{PAYMENT_SELECT} WHERE p.id = ?1"),
        params![id],
        row_to_payment,
    )
    .map_err(|e| format!("pago no encontrado: {e}"))
}

pub fn insert_payment(conn: &Connection, input: &NewPayment) -> Result<Payment, String> {
    let cents = validate(input)?;
    conn.execute(
        "INSERT INTO payments (tipo, monto_cents, fecha, categoria_id, contacto_id, descripcion) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            input.tipo,
            cents,
            input.fecha,
            input.categoria_id,
            input.contacto_id,
            input.descripcion.trim()
        ],
    )
    .map_err(|e| format!("insert: {e}"))?;
    get_payment(conn, conn.last_insert_rowid())
}

pub fn update_payment(conn: &Connection, id: i64, input: &NewPayment) -> Result<Payment, String> {
    let cents = validate(input)?;
    let rows = conn
        .execute(
            "UPDATE payments SET tipo = ?1, monto_cents = ?2, fecha = ?3, categoria_id = ?4, contacto_id = ?5, descripcion = ?6 WHERE id = ?7",
            params![
                input.tipo,
                cents,
                input.fecha,
                input.categoria_id,
                input.contacto_id,
                input.descripcion.trim(),
                id
            ],
        )
        .map_err(|e| format!("update: {e}"))?;
    if rows == 0 {
        return Err("pago no encontrado".into());
    }
    get_payment(conn, id)
}

pub fn delete_payment(conn: &Connection, id: i64) -> Result<(), String> {
    let rows = conn
        .execute("DELETE FROM payments WHERE id = ?1", params![id])
        .map_err(|e| format!("delete: {e}"))?;
    if rows == 0 {
        return Err("pago no encontrado".into());
    }
    Ok(())
}

pub fn query_payments(conn: &Connection, f: &PaymentFilter) -> Result<Vec<Payment>, String> {
    let mut sql = String::from(PAYMENT_SELECT);
    sql.push_str(" WHERE 1 = 1");
    let mut args: Vec<String> = Vec::new();
    if let Some(t) = &f.tipo {
        if t == "ingreso" || t == "gasto" {
            sql.push_str(" AND p.tipo = ?");
            args.push(t.clone());
        }
    }
    if let Some(m) = &f.mes {
        if m.len() == 7 {
            sql.push_str(" AND substr(p.fecha, 1, 7) = ?");
            args.push(m.clone());
        }
    }
    if let Some(b) = &f.buscar {
        let q = b.trim();
        if !q.is_empty() {
            sql.push_str(
                " AND (p.descripcion LIKE '%' || ? || '%' OR c.nombre LIKE '%' || ? || '%')",
            );
            args.push(q.to_string());
            args.push(q.to_string());
        }
    }
    sql.push_str(" ORDER BY p.fecha DESC, p.id DESC LIMIT ?");
    args.push(f.limite.clamp(1, 2000).to_string());

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a as &dyn rusqlite::ToSql).collect();
    let rows = stmt
        .query_map(refs.as_slice(), row_to_payment)
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub fn month_summary(conn: &Connection, mes: &str) -> Result<MonthSummary, String> {
    if mes.len() != 7 {
        return Err("mes inválido (yyyy-MM)".into());
    }
    let (ing, gas, count): (Option<i64>, Option<i64>, i64) = conn
        .query_row(
            "SELECT SUM(CASE WHEN tipo = 'ingreso' THEN monto_cents END),
                    SUM(CASE WHEN tipo = 'gasto' THEN monto_cents END),
                    COUNT(*)
             FROM payments WHERE substr(fecha, 1, 7) = ?1",
            params![mes],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| format!("summary: {e}"))?;
    let ing = ing.unwrap_or(0);
    let gas = gas.unwrap_or(0);
    Ok(MonthSummary {
        mes: mes.to_string(),
        ingresos_cents: ing,
        gastos_cents: gas,
        balance_cents: ing - gas,
        count,
    })
}

pub fn all_categories(conn: &Connection) -> Result<Vec<Category>, String> {
    let empty: &[&dyn rusqlite::ToSql] = &[];
    let mut stmt = conn
        .prepare("SELECT id, nombre, color, tipo FROM categories ORDER BY nombre")
        .map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(empty, |r| {
            Ok(Category {
                id: r.get(0)?,
                nombre: r.get(1)?,
                color: r.get(2)?,
                tipo: r.get(3)?,
            })
        })
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

// ── Deudas ───────────────────────────────────────────────────────────────

const DEBT_SELECT: &str = "SELECT d.id, d.direccion, d.persona, d.contacto_id, c.nombre, d.monto_total_cents, d.saldo_cents, d.fecha_limite, d.estado, d.notas, d.created_at FROM debts d LEFT JOIN contacts c ON c.id = d.contacto_id";

fn row_to_debt(row: &Row) -> rusqlite::Result<Debt> {
    Ok(Debt {
        id: row.get(0)?,
        direccion: row.get(1)?,
        persona: row.get(2)?,
        contacto_id: row.get(3)?,
        contacto: row.get(4)?,
        monto_total_cents: row.get(5)?,
        saldo_cents: row.get(6)?,
        fecha_limite: row.get(7)?,
        estado: row.get(8)?,
        notas: row.get(9)?,
        created_at: row.get(10)?,
    })
}

/// Deriva "vencida": activa con fecha límite pasada. No se persiste;
/// `hoy` viene del frontend en yyyy-MM-dd.
fn derivar(mut d: Debt, hoy: &str) -> Debt {
    if d.estado == "activa" && !d.fecha_limite.is_empty() && d.fecha_limite.as_str() < hoy {
        d.estado = "vencida".to_string();
    }
    d
}

fn validate_deuda_cuerpo(
    persona: &str,
    total: f64,
    fecha_limite: &str,
    notas: &str,
) -> Result<(String, i64), String> {
    let persona = persona.trim().to_string();
    if persona.is_empty() {
        return Err("falta la persona".into());
    }
    if persona.len() > 120 {
        return Err("persona muy larga (máx 120)".into());
    }
    let cents = to_cents(total)?;
    if !fecha_limite.is_empty() && !fecha_valida(fecha_limite) {
        return Err("fecha límite inválida".into());
    }
    if notas.trim().len() > 500 {
        return Err("notas muy largas (máx 500)".into());
    }
    Ok((persona, cents))
}

fn get_debt_row(conn: &Connection, id: i64) -> Result<Debt, String> {
    conn.query_row(
        &format!("{DEBT_SELECT} WHERE d.id = ?1"),
        params![id],
        row_to_debt,
    )
    .map_err(|e| format!("deuda no encontrada: {e}"))
}

pub fn get_debt(conn: &Connection, id: i64, hoy: &str) -> Result<Debt, String> {
    get_debt_row(conn, id).map(|d| derivar(d, hoy))
}

pub fn insert_debt(conn: &Connection, input: &NewDebt, hoy: &str) -> Result<Debt, String> {
    if input.direccion != "debo" && input.direccion != "me_deben" {
        return Err("dirección inválida".into());
    }
    let (persona, total) = validate_deuda_cuerpo(
        &input.persona,
        input.monto_total,
        &input.fecha_limite,
        &input.notas,
    )?;
    conn.execute(
        "INSERT INTO debts (direccion, persona, contacto_id, monto_total_cents, saldo_cents, fecha_limite, notas) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)",
        params![
            input.direccion,
            persona,
            input.contacto_id,
            total,
            input.fecha_limite,
            input.notas.trim()
        ],
    )
    .map_err(|e| format!("insert: {e}"))?;
    get_debt(conn, conn.last_insert_rowid(), hoy)
}

pub fn update_debt(
    conn: &Connection,
    id: i64,
    input: &EditDebt,
    hoy: &str,
) -> Result<Debt, String> {
    let (persona, total) = validate_deuda_cuerpo(
        &input.persona,
        input.monto_total,
        &input.fecha_limite,
        &input.notas,
    )?;
    let cur = get_debt_row(conn, id)?;
    if cur.estado == "saldada" && total != cur.monto_total_cents {
        return Err("no se puede cambiar el total de una deuda saldada".into());
    }
    let saldo = (cur.saldo_cents + (total - cur.monto_total_cents)).max(0);
    let rows = conn
        .execute(
            "UPDATE debts SET persona = ?1, contacto_id = ?2, monto_total_cents = ?3, saldo_cents = ?4, fecha_limite = ?5, notas = ?6 WHERE id = ?7",
            params![
                persona,
                input.contacto_id,
                total,
                saldo,
                input.fecha_limite,
                input.notas.trim(),
                id
            ],
        )
        .map_err(|e| format!("update: {e}"))?;
    if rows == 0 {
        return Err("deuda no encontrada".into());
    }
    get_debt(conn, id, hoy)
}

pub fn delete_debt(conn: &Connection, id: i64) -> Result<(), String> {
    let rows = conn
        .execute("DELETE FROM debts WHERE id = ?1", params![id])
        .map_err(|e| format!("delete: {e}"))?;
    if rows == 0 {
        return Err("deuda no encontrada".into());
    }
    Ok(())
}

pub fn query_debts(conn: &Connection, f: &DebtFilter, hoy: &str) -> Result<Vec<Debt>, String> {
    let mut sql = String::from(DEBT_SELECT);
    sql.push_str(" WHERE 1 = 1");
    let mut args: Vec<String> = Vec::new();
    if let Some(d) = &f.direccion {
        if d == "debo" || d == "me_deben" {
            sql.push_str(" AND d.direccion = ?");
            args.push(d.clone());
        }
    }
    if let Some(b) = &f.buscar {
        let q = b.trim();
        if !q.is_empty() {
            sql.push_str(" AND (d.persona LIKE '%' || ? || '%' OR d.notas LIKE '%' || ? || '%')");
            args.push(q.to_string());
            args.push(q.to_string());
        }
    }
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a as &dyn rusqlite::ToSql).collect();
    let rows = stmt
        .query_map(refs.as_slice(), row_to_debt)
        .map_err(|e| format!("query: {e}"))?;
    let mut out: Vec<Debt> = Vec::new();
    for r in rows {
        out.push(derivar(r.map_err(|e| format!("row: {e}"))?, hoy));
    }
    if let Some(e) = &f.estado {
        if e == "activa" || e == "vencida" || e == "saldada" {
            out.retain(|d| &d.estado == e);
        }
    }
    out.sort_by(|a, b| {
        let ra = if a.estado == "saldada" { 1 } else { 0 };
        let rb = if b.estado == "saldada" { 1 } else { 0 };
        (ra, &a.fecha_limite, a.id).cmp(&(rb, &b.fecha_limite, b.id))
    });
    out.truncate(f.limite.clamp(1, 2000) as usize);
    Ok(out)
}

/// Registra un abono. Si supera el saldo, se limita al saldo y la deuda
/// queda saldada automáticamente.
pub fn add_debt_payment(
    conn: &Connection,
    debt_id: i64,
    input: &NewDebtPayment,
    hoy: &str,
) -> Result<Debt, String> {
    let cents = to_cents(input.monto)?;
    if !fecha_valida(&input.fecha) {
        return Err("fecha inválida (yyyy-MM-dd)".into());
    }
    if input.nota.trim().len() > 280 {
        return Err("nota muy larga (máx 280)".into());
    }
    let cur = get_debt_row(conn, debt_id)?;
    if cur.estado == "saldada" || cur.saldo_cents <= 0 {
        return Err("la deuda ya está saldada".into());
    }
    let aplicado = cents.min(cur.saldo_cents);
    conn.execute(
        "INSERT INTO debt_payments (debt_id, monto_cents, fecha, nota) VALUES (?1, ?2, ?3, ?4)",
        params![debt_id, aplicado, input.fecha, input.nota.trim()],
    )
    .map_err(|e| format!("insert: {e}"))?;
    let saldo = cur.saldo_cents - aplicado;
    let estado: &str = if saldo == 0 { "saldada" } else { &cur.estado };
    conn.execute(
        "UPDATE debts SET saldo_cents = ?1, estado = ?2 WHERE id = ?3",
        params![saldo, estado, debt_id],
    )
    .map_err(|e| format!("update: {e}"))?;
    get_debt(conn, debt_id, hoy)
}

pub fn list_debt_payments(conn: &Connection, debt_id: i64) -> Result<Vec<DebtPayment>, String> {
    let mut stmt = conn
        .prepare("SELECT id, debt_id, monto_cents, fecha, nota FROM debt_payments WHERE debt_id = ?1 ORDER BY fecha DESC, id DESC")
        .map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(params![debt_id], |r| {
            Ok(DebtPayment {
                id: r.get(0)?,
                debt_id: r.get(1)?,
                monto_cents: r.get(2)?,
                fecha: r.get(3)?,
                nota: r.get(4)?,
            })
        })
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub fn debts_summary(conn: &Connection) -> Result<DebtsSummary, String> {
    let empty: &[&dyn rusqlite::ToSql] = &[];
    let (pagar, cobrar, activas): (i64, i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(CASE WHEN direccion = 'debo' AND estado <> 'saldada' THEN saldo_cents ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN direccion = 'me_deben' AND estado <> 'saldada' THEN saldo_cents ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN estado <> 'saldada' THEN 1 ELSE 0 END), 0)
             FROM debts",
            empty,
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| format!("summary: {e}"))?;
    Ok(DebtsSummary {
        por_pagar_cents: pagar,
        por_cobrar_cents: cobrar,
        activas,
    })
}

// ── Contactos ────────────────────────────────────────────────────────────

fn row_to_contact(row: &Row) -> rusqlite::Result<Contact> {
    Ok(Contact {
        id: row.get(0)?,
        nombre: row.get(1)?,
        telefono: row.get(2)?,
        nota: row.get(3)?,
        created_at: row.get(4)?,
    })
}

pub fn validate_contact(input: &NewContact) -> Result<String, String> {
    let nombre = input.nombre.trim().to_string();
    if nombre.is_empty() {
        return Err("falta el nombre".into());
    }
    if nombre.len() > 120 {
        return Err("nombre muy largo (máx 120)".into());
    }
    if input.telefono.trim().len() > 40 {
        return Err("teléfono muy largo (máx 40)".into());
    }
    if input.nota.trim().len() > 500 {
        return Err("nota muy larga (máx 500)".into());
    }
    Ok(nombre)
}

pub fn insert_contact(conn: &Connection, input: &NewContact) -> Result<Contact, String> {
    let nombre = validate_contact(input)?;
    conn.execute(
        "INSERT INTO contacts (nombre, telefono, nota) VALUES (?1, ?2, ?3)",
        params![nombre, input.telefono.trim(), input.nota.trim()],
    )
    .map_err(|e| format!("insert: {e}"))?;
    conn.query_row(
        "SELECT id, nombre, telefono, nota, created_at FROM contacts WHERE id = ?1",
        params![conn.last_insert_rowid()],
        row_to_contact,
    )
    .map_err(|e| format!("get: {e}"))
}

pub fn update_contact(conn: &Connection, id: i64, input: &NewContact) -> Result<Contact, String> {
    let nombre = validate_contact(input)?;
    let rows = conn
        .execute(
            "UPDATE contacts SET nombre = ?1, telefono = ?2, nota = ?3 WHERE id = ?4",
            params![nombre, input.telefono.trim(), input.nota.trim(), id],
        )
        .map_err(|e| format!("update: {e}"))?;
    if rows == 0 {
        return Err("contacto no encontrado".into());
    }
    conn.query_row(
        "SELECT id, nombre, telefono, nota, created_at FROM contacts WHERE id = ?1",
        params![id],
        row_to_contact,
    )
    .map_err(|e| format!("get: {e}"))
}

/// Borrar un contacto lo desvincula de pagos y deudas (FK SET NULL).
pub fn delete_contact(conn: &Connection, id: i64) -> Result<(), String> {
    let rows = conn
        .execute("DELETE FROM contacts WHERE id = ?1", params![id])
        .map_err(|e| format!("delete: {e}"))?;
    if rows == 0 {
        return Err("contacto no encontrado".into());
    }
    Ok(())
}

pub fn query_contacts(conn: &Connection, buscar: Option<String>) -> Result<Vec<Contact>, String> {
    let mut sql =
        String::from("SELECT id, nombre, telefono, nota, created_at FROM contacts WHERE 1 = 1");
    let mut args: Vec<String> = Vec::new();
    if let Some(b) = buscar {
        let q = b.trim().to_string();
        if !q.is_empty() {
            sql.push_str(" AND (nombre LIKE '%' || ? || '%' OR telefono LIKE '%' || ? || '%')");
            args.push(q.clone());
            args.push(q);
        }
    }
    sql.push_str(" ORDER BY nombre LIMIT 500");
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a as &dyn rusqlite::ToSql).collect();
    let rows = stmt
        .query_map(refs.as_slice(), row_to_contact)
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

// ── Recordatorios ────────────────────────────────────────────────────────

fn row_to_reminder(row: &Row) -> rusqlite::Result<Reminder> {
    Ok(Reminder {
        id: row.get(0)?,
        titulo: row.get(1)?,
        detalle: row.get(2)?,
        fecha_hora: row.get(3)?,
        repetir: row.get(4)?,
        payment_id: row.get(5)?,
        debt_id: row.get(6)?,
        sonido: row.get(7)?,
        persistente: row.get(8)?,
        hecho: row.get(9)?,
        created_at: row.get(10)?,
    })
}

fn fecha_hora_valida(fh: &str) -> bool {
    fh.len() == 16 && fh.as_bytes()[4] == b'-' && fh.as_bytes()[10] == b'T'
}

pub fn validate_reminder(input: &NewReminder) -> Result<(), String> {
    let titulo = input.titulo.trim();
    if titulo.is_empty() {
        return Err("falta el título".into());
    }
    if titulo.len() > 140 {
        return Err("título muy largo (máx 140)".into());
    }
    if !fecha_hora_valida(&input.fecha_hora) {
        return Err("fecha/hora inválida".into());
    }
    match input.repetir.as_str() {
        "none" | "daily" | "weekly" | "monthly" => {}
        _ => return Err("repetición inválida".into()),
    }
    if input.detalle.trim().len() > 500 {
        return Err("detalle muy largo (máx 500)".into());
    }
    Ok(())
}

const REMINDER_SELECT: &str = "SELECT id, titulo, detalle, fecha_hora, repetir, payment_id, debt_id, sonido, persistente, hecho, created_at FROM reminders";

fn get_reminder_row(conn: &Connection, id: i64) -> Result<Reminder, String> {
    conn.query_row(
        &format!("{REMINDER_SELECT} WHERE id = ?1"),
        params![id],
        row_to_reminder,
    )
    .map_err(|e| format!("recordatorio no encontrado: {e}"))
}

pub fn insert_reminder(conn: &Connection, input: &NewReminder) -> Result<Reminder, String> {
    validate_reminder(input)?;
    conn.execute(
        "INSERT INTO reminders (titulo, detalle, fecha_hora, repetir, payment_id, debt_id, sonido, persistente) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.titulo.trim(),
            input.detalle.trim(),
            input.fecha_hora,
            input.repetir,
            input.payment_id,
            input.debt_id,
            input.sonido,
            input.persistente
        ],
    )
    .map_err(|e| format!("insert: {e}"))?;
    get_reminder_row(conn, conn.last_insert_rowid())
}

pub fn update_reminder(
    conn: &Connection,
    id: i64,
    input: &NewReminder,
) -> Result<Reminder, String> {
    validate_reminder(input)?;
    let rows = conn
        .execute(
            "UPDATE reminders SET titulo = ?1, detalle = ?2, fecha_hora = ?3, repetir = ?4, payment_id = ?5, debt_id = ?6, sonido = ?7, persistente = ?8 WHERE id = ?9",
            params![
                input.titulo.trim(),
                input.detalle.trim(),
                input.fecha_hora,
                input.repetir,
                input.payment_id,
                input.debt_id,
                input.sonido,
                input.persistente,
                id
            ],
        )
        .map_err(|e| format!("update: {e}"))?;
    if rows == 0 {
        return Err("recordatorio no encontrado".into());
    }
    get_reminder_row(conn, id)
}

pub fn delete_reminder(conn: &Connection, id: i64) -> Result<(), String> {
    let rows = conn
        .execute("DELETE FROM reminders WHERE id = ?1", params![id])
        .map_err(|e| format!("delete: {e}"))?;
    if rows == 0 {
        return Err("recordatorio no encontrado".into());
    }
    Ok(())
}

pub fn set_reminder_done(conn: &Connection, id: i64, hecho: bool) -> Result<Reminder, String> {
    let rows = conn
        .execute(
            "UPDATE reminders SET hecho = ?1 WHERE id = ?2",
            params![hecho, id],
        )
        .map_err(|e| format!("update: {e}"))?;
    if rows == 0 {
        return Err("recordatorio no encontrado".into());
    }
    get_reminder_row(conn, id)
}

pub fn query_reminders(conn: &Connection, f: &ReminderFilter) -> Result<Vec<Reminder>, String> {
    let mut sql = String::from(REMINDER_SELECT);
    sql.push_str(" WHERE 1 = 1");
    let mut args: Vec<String> = Vec::new();
    if f.solo_pendientes == Some(true) {
        sql.push_str(" AND hecho = 0");
    }
    if let Some(d) = &f.desde {
        if d.len() >= 10 {
            sql.push_str(" AND fecha_hora >= ?");
            args.push(d.clone());
        }
    }
    if let Some(h) = &f.hasta {
        if h.len() >= 10 {
            sql.push_str(" AND fecha_hora <= ?");
            args.push(h.clone());
        }
    }
    if let Some(b) = &f.buscar {
        let q = b.trim();
        if !q.is_empty() {
            sql.push_str(" AND (titulo LIKE '%' || ? || '%' OR detalle LIKE '%' || ? || '%')");
            args.push(q.to_string());
            args.push(q.to_string());
        }
    }
    sql.push_str(" ORDER BY hecho ASC, fecha_hora ASC, id DESC LIMIT ?");
    args.push(f.limite.clamp(1, 2000).to_string());

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a as &dyn rusqlite::ToSql).collect();
    let rows = stmt
        .query_map(refs.as_slice(), row_to_reminder)
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

/// Pendientes cuya hora ya llegó (lo que revisa el frontend cada 60s).
pub fn due_reminders(conn: &Connection, ahora: &str) -> Result<Vec<Reminder>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{REMINDER_SELECT} WHERE hecho = 0 AND fecha_hora <= ?1 ORDER BY fecha_hora ASC LIMIT 50"
        ))
        .map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(params![ahora], row_to_reminder)
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

// ── Ajustes y PIN ────────────────────────────────────────────────────────

pub fn get_setting(conn: &Connection, clave: &str) -> Result<Option<String>, String> {
    match conn.query_row(
        "SELECT valor FROM settings WHERE clave = ?1",
        params![clave],
        |r| r.get::<_, String>(0),
    ) {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("get setting: {e}")),
    }
}

pub fn set_setting(conn: &Connection, clave: &str, valor: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (clave, valor) VALUES (?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        params![clave, valor],
    )
    .map_err(|e| format!("set setting: {e}"))?;
    Ok(())
}

fn pin_formato_ok(pin: &str) -> bool {
    (4..=8).contains(&pin.len()) && pin.bytes().all(|b| b.is_ascii_digit())
}

/// Guarda el PIN como hash Argon2id. El PIN en claro nunca toca el disco.
pub fn set_pin(conn: &Connection, pin: &str) -> Result<(), String> {
    if !pin_formato_ok(pin) {
        return Err("el PIN debe tener de 4 a 8 dígitos".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|e| format!("hash: {e}"))?
        .to_string();
    set_setting(conn, "pin_hash", &hash)
}

pub fn is_pin_set(conn: &Connection) -> Result<bool, String> {
    Ok(get_setting(conn, "pin_hash")?.is_some())
}

pub fn verify_pin(conn: &Connection, pin: &str) -> Result<bool, String> {
    let stored = match get_setting(conn, "pin_hash")? {
        Some(h) => h,
        None => return Ok(false),
    };
    let parsed = PasswordHash::new(&stored).map_err(|e| format!("hash inválido: {e}"))?;
    Ok(Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{NewDebt, NewDebtPayment, NewPayment};

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        conn
    }

    fn sample(tipo: &str, monto: f64, fecha: &str) -> NewPayment {
        NewPayment {
            tipo: tipo.into(),
            monto,
            fecha: fecha.into(),
            categoria_id: None,
            contacto_id: None,
            descripcion: "prueba".into(),
        }
    }

    fn debt_sample() -> NewDebt {
        NewDebt {
            direccion: "me_deben".into(),
            persona: "Juan".into(),
            contacto_id: None,
            monto_total: 200.0,
            fecha_limite: "2026-09-20".into(),
            notas: "".into(),
        }
    }

    #[test]
    fn seed_crea_categorias() {
        let conn = mem();
        let cats = all_categories(&conn).unwrap();
        assert_eq!(cats.len(), 10);
        assert!(cats.iter().any(|c| c.nombre == "Suscripción"));
    }

    #[test]
    fn seed_idempotente_agrega_faltantes() {
        let conn = mem();
        conn.execute("DELETE FROM categories WHERE nombre = 'Suscripción'", [])
            .unwrap();
        init(&conn).unwrap();
        let cats = all_categories(&conn).unwrap();
        assert_eq!(cats.len(), 10);
    }

    #[test]
    fn crud_pago() {
        let conn = mem();
        let p = insert_payment(&conn, &sample("gasto", 19.99, "2026-09-10")).unwrap();
        assert_eq!(p.monto_cents, 1999);
        let u = update_payment(&conn, p.id, &sample("ingreso", 10.0, "2026-09-01")).unwrap();
        assert_eq!(u.tipo, "ingreso");
        assert_eq!(u.monto_cents, 1000);
        delete_payment(&conn, p.id).unwrap();
        assert!(get_payment(&conn, p.id).is_err());
    }

    #[test]
    fn resumen_mes() {
        let conn = mem();
        insert_payment(&conn, &sample("ingreso", 100.0, "2026-09-05")).unwrap();
        insert_payment(&conn, &sample("gasto", 30.5, "2026-09-06")).unwrap();
        insert_payment(&conn, &sample("gasto", 10.0, "2026-08-01")).unwrap();
        let s = month_summary(&conn, "2026-09").unwrap();
        assert_eq!(s.ingresos_cents, 10000);
        assert_eq!(s.gastos_cents, 3050);
        assert_eq!(s.balance_cents, 6950);
        assert_eq!(s.count, 2);
    }

    #[test]
    fn filtros_busqueda() {
        let conn = mem();
        let mut a = sample("gasto", 5.0, "2026-09-01");
        a.descripcion = "Café colmado".into();
        insert_payment(&conn, &a).unwrap();
        insert_payment(&conn, &sample("ingreso", 50.0, "2026-09-02")).unwrap();
        let f = PaymentFilter {
            buscar: Some("colmado".into()),
            limite: 100,
            ..Default::default()
        };
        assert_eq!(query_payments(&conn, &f).unwrap().len(), 1);
        let f2 = PaymentFilter {
            tipo: Some("ingreso".into()),
            limite: 100,
            ..Default::default()
        };
        assert_eq!(query_payments(&conn, &f2).unwrap().len(), 1);
    }

    #[test]
    fn validacion_rechaza_basura() {
        let conn = mem();
        assert!(insert_payment(&conn, &sample("gasto", 0.0, "2026-09-10")).is_err());
        assert!(insert_payment(&conn, &sample("otro", 5.0, "2026-09-10")).is_err());
        assert!(insert_payment(&conn, &sample("gasto", 5.0, "ayer")).is_err());
    }

    #[test]
    fn deuda_abonos_y_saldo() {
        let conn = mem();
        let d = insert_debt(&conn, &debt_sample(), "2026-09-10").unwrap();
        assert_eq!(d.saldo_cents, 20000);
        assert_eq!(d.estado, "activa");
        let abono = NewDebtPayment {
            monto: 50.0,
            fecha: "2026-09-11".into(),
            nota: "".into(),
        };
        let d2 = add_debt_payment(&conn, d.id, &abono, "2026-09-11").unwrap();
        assert_eq!(d2.saldo_cents, 15000);
        assert_eq!(list_debt_payments(&conn, d.id).unwrap().len(), 1);
        // Sobrepago: se limita al saldo y salda la deuda.
        let grande = NewDebtPayment {
            monto: 999.0,
            fecha: "2026-09-12".into(),
            nota: "".into(),
        };
        let d3 = add_debt_payment(&conn, d.id, &grande, "2026-09-12").unwrap();
        assert_eq!(d3.saldo_cents, 0);
        assert_eq!(d3.estado, "saldada");
        assert!(add_debt_payment(&conn, d.id, &abono, "2026-09-13").is_err());
    }

    #[test]
    fn deuda_vencida_derivada_y_resumen() {
        let conn = mem();
        let mut s = debt_sample();
        s.fecha_limite = "2026-09-01".into();
        let d = insert_debt(&conn, &s, "2026-09-10").unwrap();
        assert_eq!(d.estado, "vencida");
        let r = debts_summary(&conn).unwrap();
        assert_eq!(r.por_cobrar_cents, 20000);
        assert_eq!(r.por_pagar_cents, 0);
        assert_eq!(r.activas, 1);
    }

    #[test]
    fn contacto_desvincula_al_borrar() {
        let conn = mem();
        let c = insert_contact(
            &conn,
            &NewContact {
                nombre: "Juan".into(),
                telefono: "787".into(),
                nota: "".into(),
            },
        )
        .unwrap();
        let mut s = debt_sample();
        s.contacto_id = Some(c.id);
        let d = insert_debt(&conn, &s, "2026-09-10").unwrap();
        assert_eq!(d.contacto.as_deref(), Some("Juan"));
        delete_contact(&conn, c.id).unwrap();
        let d2 = get_debt(&conn, d.id, "2026-09-10").unwrap();
        assert_eq!(d2.contacto_id, None);
    }

    #[test]
    fn deuda_rechaza_basura() {
        let conn = mem();
        let mut s = debt_sample();
        s.persona = "  ".into();
        assert!(insert_debt(&conn, &s, "2026-09-10").is_err());
        s.persona = "Juan".into();
        s.monto_total = 0.0;
        assert!(insert_debt(&conn, &s, "2026-09-10").is_err());
    }

    fn reminder_sample(titulo: &str, fh: &str) -> NewReminder {
        NewReminder {
            titulo: titulo.into(),
            detalle: "".into(),
            fecha_hora: fh.into(),
            repetir: "none".into(),
            payment_id: None,
            debt_id: None,
            sonido: true,
            persistente: true,
        }
    }

    #[test]
    fn crud_recordatorio() {
        let conn = mem();
        let r = insert_reminder(&conn, &reminder_sample("Pagar luz", "2026-09-15T10:00")).unwrap();
        assert!(!r.hecho);
        let d = set_reminder_done(&conn, r.id, true).unwrap();
        assert!(d.hecho);
        let d2 = set_reminder_done(&conn, r.id, false).unwrap();
        assert!(!d2.hecho);
        delete_reminder(&conn, r.id).unwrap();
        let f = ReminderFilter {
            limite: 100,
            ..Default::default()
        };
        assert!(query_reminders(&conn, &f).unwrap().is_empty());
    }

    #[test]
    fn vencidos_query() {
        let conn = mem();
        insert_reminder(&conn, &reminder_sample("Pasado", "2026-09-09T10:00")).unwrap();
        insert_reminder(&conn, &reminder_sample("Futuro", "2026-09-20T10:00")).unwrap();
        let h = insert_reminder(&conn, &reminder_sample("Hecho", "2026-09-01T10:00")).unwrap();
        set_reminder_done(&conn, h.id, true).unwrap();
        let due = due_reminders(&conn, "2026-09-10T12:00").unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].titulo, "Pasado");
        let pend = ReminderFilter {
            solo_pendientes: Some(true),
            limite: 100,
            ..Default::default()
        };
        assert_eq!(query_reminders(&conn, &pend).unwrap().len(), 2);
    }

    #[test]
    fn recordatorio_rechaza_basura() {
        let conn = mem();
        assert!(insert_reminder(&conn, &reminder_sample("  ", "2026-09-15T10:00")).is_err());
        assert!(insert_reminder(&conn, &reminder_sample("X", "mañana")).is_err());
        let mut r = reminder_sample("X", "2026-09-15T10:00");
        r.repetir = "anual".into();
        assert!(insert_reminder(&conn, &r).is_err());
    }

    #[test]
    fn pin_roundtrip() {
        let conn = mem();
        assert!(!is_pin_set(&conn).unwrap());
        assert!(!verify_pin(&conn, "1234").unwrap());
        set_pin(&conn, "1234").unwrap();
        assert!(is_pin_set(&conn).unwrap());
        assert!(verify_pin(&conn, "1234").unwrap());
        assert!(!verify_pin(&conn, "4321").unwrap());
        assert!(set_pin(&conn, "12ab").is_err());
        assert!(set_pin(&conn, "123").is_err());
        assert!(set_pin(&conn, "123456789").is_err());
    }

    #[test]
    fn settings_set_get() {
        let conn = mem();
        assert_eq!(get_setting(&conn, "tema").unwrap(), None);
        set_setting(&conn, "tema", "claro").unwrap();
        assert_eq!(
            get_setting(&conn, "tema").unwrap().as_deref(),
            Some("claro")
        );
    }
}
