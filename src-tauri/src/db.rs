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

use crate::models::{BudgetView, MonthPoint};
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

fn tiene_columna(conn: &Connection, tabla: &str, col: &str) -> Result<bool, String> {
    let empty: &[&dyn rusqlite::ToSql] = &[];
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({tabla})"))
        .map_err(|e| format!("migrar: {e}"))?;
    let cols = stmt
        .query_map(empty, |r| r.get::<_, String>(1))
        .map_err(|e| format!("migrar: {e}"))?;
    for c in cols {
        if c.map_err(|e| format!("migrar: {e}"))? == col {
            return Ok(true);
        }
    }
    Ok(false)
}

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
    // Migración v2: serie de recurrentes (DBs creadas antes de esta versión).
    let sin_args: &[&dyn rusqlite::ToSql] = &[];
    let version: i64 = conn
        .query_row("PRAGMA user_version", sin_args, |r| r.get(0))
        .map_err(|e| format!("version: {e}"))?;
    if version < 2 {
        if !tiene_columna(conn, "payments", "serie_id")? {
            conn.execute_batch("ALTER TABLE payments ADD COLUMN serie_id INTEGER")
                .map_err(|e| format!("migrar serie_id: {e}"))?;
        }
        conn.execute_batch("PRAGMA user_version = 2")
            .map_err(|e| format!("version: {e}"))?;
    }
    // Migración v3: pagado vs pendiente (los futuros pasan a pendientes).
    if version < 3 {
        if !tiene_columna(conn, "payments", "estado")? {
            conn.execute_batch(
                "ALTER TABLE payments ADD COLUMN estado TEXT NOT NULL DEFAULT 'pagado'",
            )
            .map_err(|e| format!("migrar estado: {e}"))?;
        }
        conn.execute_batch("UPDATE payments SET estado = 'pendiente' WHERE fecha > date('now')")
            .map_err(|e| format!("migrar estado: {e}"))?;
        conn.execute_batch("PRAGMA user_version = 3")
            .map_err(|e| format!("version: {e}"))?;
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

/// Valida un pago y devuelve (centavos, recurrencia, estado).
pub fn validate(input: &NewPayment) -> Result<(i64, String, String), String> {
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
    let rec = match input.recurrente.as_str() {
        "" | "none" => "none".to_string(),
        "daily" | "weekly" | "monthly" => input.recurrente.clone(),
        _ => return Err("repetición inválida".into()),
    };
    if input.comprobante_path.len() > 120 {
        return Err("comprobante inválido".into());
    }
    let estado = match input.estado.as_str() {
        "pagado" | "pendiente" => input.estado.clone(),
        _ => return Err("estado inválido".into()),
    };
    Ok((cents, rec, estado))
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
        serie_id: row.get(11)?,
        estado: row.get(12)?,
        created_at: row.get(10)?,
    })
}

const PAYMENT_SELECT: &str = "SELECT p.id, p.tipo, p.monto_cents, p.fecha, p.categoria_id, c.nombre, p.descripcion, p.contacto_id, p.comprobante_path, p.recurrente, p.created_at, p.serie_id, p.estado FROM payments p LEFT JOIN categories c ON c.id = p.categoria_id";

pub fn get_payment(conn: &Connection, id: i64) -> Result<Payment, String> {
    conn.query_row(
        &format!("{PAYMENT_SELECT} WHERE p.id = ?1"),
        params![id],
        row_to_payment,
    )
    .map_err(|e| format!("pago no encontrado: {e}"))
}

pub fn insert_payment(conn: &Connection, input: &NewPayment) -> Result<Payment, String> {
    let (cents, rec, estado) = validate(input)?;
    conn.execute(
        "INSERT INTO payments (tipo, monto_cents, fecha, categoria_id, contacto_id, descripcion, recurrente, comprobante_path, estado) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            input.tipo,
            cents,
            input.fecha,
            input.categoria_id,
            input.contacto_id,
            input.descripcion.trim(),
            rec,
            input.comprobante_path.trim(),
            estado
        ],
    )
    .map_err(|e| format!("insert: {e}"))?;
    get_payment(conn, conn.last_insert_rowid())
}

pub fn update_payment(conn: &Connection, id: i64, input: &NewPayment) -> Result<Payment, String> {
    let (cents, rec, estado) = validate(input)?;
    let rows = conn
        .execute(
            "UPDATE payments SET tipo = ?1, monto_cents = ?2, fecha = ?3, categoria_id = ?4, contacto_id = ?5, descripcion = ?6, recurrente = ?7, comprobante_path = ?8, estado = ?9 WHERE id = ?10",
            params![
                input.tipo,
                cents,
                input.fecha,
                input.categoria_id,
                input.contacto_id,
                input.descripcion.trim(),
                rec,
                input.comprobante_path.trim(),
                estado,
                id
            ],
        )
        .map_err(|e| format!("update: {e}"))?;
    if rows == 0 {
        return Err("pago no encontrado".into());
    }
    get_payment(conn, id)
}

/// Marca un pago como pagado o pendiente (realizado vs planificado).
pub fn marcar_pago(conn: &Connection, id: i64, estado: &str) -> Result<Payment, String> {
    if estado != "pagado" && estado != "pendiente" {
        return Err("estado inválido".into());
    }
    let rows = conn
        .execute(
            "UPDATE payments SET estado = ?1 WHERE id = ?2",
            params![estado, id],
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
    if let Some(e) = &f.estado {
        if e == "pagado" || e == "pendiente" {
            sql.push_str(" AND p.estado = ?");
            args.push(e.clone());
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
             FROM payments WHERE substr(fecha, 1, 7) = ?1 AND estado = 'pagado'",
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

// ── Recurrentes, presupuestos, resumen ────────────────────────────────────

fn es_bisiesto(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn dias_mes(y: i32, m: i32) -> i32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if es_bisiesto(y) => 29,
        2 => 28,
        _ => 30,
    }
}

fn parse_fecha(f: &str) -> Result<(i32, i32, i32), String> {
    if f.len() != 10 {
        return Err("fecha inválida".into());
    }
    let y: i32 = f[0..4].parse().map_err(|_| "fecha inválida")?;
    let m: i32 = f[5..7].parse().map_err(|_| "fecha inválida")?;
    let d: i32 = f[8..10].parse().map_err(|_| "fecha inválida")?;
    if !(1..=12).contains(&m) || d < 1 || d > dias_mes(y, m) {
        return Err("fecha inválida".into());
    }
    Ok((y, m, d))
}

fn fmt_fecha(y: i32, m: i32, d: i32) -> String {
    format!("{y:04}-{m:02}-{d:02}")
}

fn sumar_dias(fecha: &str, n: i32) -> Result<String, String> {
    let (mut y, mut m, mut d) = parse_fecha(fecha)?;
    let mut rest = n;
    while rest > 0 {
        let cabe = dias_mes(y, m) - d;
        if rest <= cabe {
            d += rest;
            rest = 0;
        } else {
            rest -= cabe + 1;
            d = 1;
            m += 1;
            if m > 12 {
                m = 1;
                y += 1;
            }
        }
    }
    Ok(fmt_fecha(y, m, d))
}

fn siguiente_ocurrencia(rep: &str, desde: &str) -> Result<String, String> {
    match rep {
        "daily" => sumar_dias(desde, 1),
        "weekly" => sumar_dias(desde, 7),
        "monthly" => {
            let (y, m, d) = parse_fecha(desde)?;
            let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
            Ok(fmt_fecha(ny, nm, d.min(dias_mes(ny, nm))))
        }
        _ => Err("repetición inválida".into()),
    }
}

/// Genera las ocurrencias pendientes de pagos recurrentes hasta `hoy`.
/// Las copias llevan serie_id = plantilla y recurrente 'none'.
pub fn generar_recurrentes(conn: &Connection, hoy: &str) -> Result<i64, String> {
    if hoy.len() != 10 {
        return Err("fecha inválida".into());
    }
    let empty: &[&dyn rusqlite::ToSql] = &[];
    let mut stmt = conn
        .prepare(&format!(
            "{PAYMENT_SELECT} WHERE p.recurrente <> 'none' AND p.serie_id IS NULL"
        ))
        .map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(empty, row_to_payment)
        .map_err(|e| format!("query: {e}"))?;
    let mut plantillas = Vec::new();
    for r in rows {
        plantillas.push(r.map_err(|e| format!("row: {e}"))?);
    }
    let mut total = 0i64;
    for t in plantillas {
        let last: String = conn
            .query_row(
                "SELECT MAX(fecha) FROM payments WHERE id = ?1 OR serie_id = ?1",
                params![t.id],
                |r| r.get(0),
            )
            .map_err(|e| format!("max: {e}"))?;
        let mut next = siguiente_ocurrencia(&t.recurrente, &last)?;
        let mut guard = 0;
        while next.as_str() <= hoy && guard < 365 {
            conn.execute(
                "INSERT INTO payments (tipo, monto_cents, fecha, categoria_id, contacto_id, descripcion, recurrente, comprobante_path, serie_id, estado) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'none', ?7, ?8, 'pendiente')",
                params![
                    t.tipo,
                    t.monto_cents,
                    next,
                    t.categoria_id,
                    t.contacto_id,
                    t.descripcion,
                    t.comprobante_path,
                    t.id
                ],
            )
            .map_err(|e| format!("insert serie: {e}"))?;
            total += 1;
            guard += 1;
            let cur = next;
            next = siguiente_ocurrencia(&t.recurrente, &cur)?;
        }
    }
    Ok(total)
}

pub fn set_budget(conn: &Connection, categoria_id: i64, monto: f64) -> Result<(), String> {
    let cents = to_cents(monto)?;
    let existe: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM categories WHERE id = ?1",
            params![categoria_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("categoria: {e}"))?;
    if existe == 0 {
        return Err("categoría no existe".into());
    }
    conn.execute(
        "INSERT INTO budgets (categoria_id, monto_cents) VALUES (?1, ?2) ON CONFLICT(categoria_id) DO UPDATE SET monto_cents = excluded.monto_cents",
        params![categoria_id, cents],
    )
    .map_err(|e| format!("upsert: {e}"))?;
    Ok(())
}

pub fn delete_budget(conn: &Connection, id: i64) -> Result<(), String> {
    let rows = conn
        .execute("DELETE FROM budgets WHERE id = ?1", params![id])
        .map_err(|e| format!("delete: {e}"))?;
    if rows == 0 {
        return Err("presupuesto no encontrado".into());
    }
    Ok(())
}

pub fn list_budgets(conn: &Connection, mes: &str) -> Result<Vec<BudgetView>, String> {
    if mes.len() != 7 {
        return Err("mes inválido (yyyy-MM)".into());
    }
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.categoria_id, c.nombre, c.color, b.monto_cents,
                    COALESCE((SELECT SUM(p.monto_cents) FROM payments p WHERE p.categoria_id = c.id AND p.tipo = 'gasto' AND p.estado = 'pagado' AND substr(p.fecha, 1, 7) = ?1), 0)
             FROM budgets b JOIN categories c ON c.id = b.categoria_id ORDER BY c.nombre",
        )
        .map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(params![mes], |r| {
            let monto: i64 = r.get(4)?;
            let gast: i64 = r.get(5)?;
            Ok(BudgetView {
                id: r.get(0)?,
                categoria_id: r.get(1)?,
                categoria: r.get(2)?,
                color: r.get(3)?,
                monto_cents: monto,
                gastado_cents: gast,
                pct: if monto > 0 { gast * 100 / monto } else { 0 },
            })
        })
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub fn resumen_mensual(conn: &Connection, meses: Vec<String>) -> Result<Vec<MonthPoint>, String> {
    if meses.len() > 24 {
        return Err("demasiados meses".into());
    }
    let mut out = Vec::new();
    for m in meses {
        let s = month_summary(conn, &m)?;
        out.push(MonthPoint {
            mes: s.mes,
            ingresos_cents: s.ingresos_cents,
            gastos_cents: s.gastos_cents,
        });
    }
    Ok(out)
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
            recurrente: "none".into(),
            comprobante_path: "".into(),
            estado: "pagado".into(),
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

    #[test]
    fn fechas_calendario() {
        assert_eq!(sumar_dias("2026-01-31", 1).unwrap(), "2026-02-01");
        assert_eq!(sumar_dias("2026-12-30", 7).unwrap(), "2027-01-06");
        assert_eq!(
            siguiente_ocurrencia("monthly", "2026-01-31").unwrap(),
            "2026-02-28"
        );
        assert_eq!(
            siguiente_ocurrencia("monthly", "2024-01-31").unwrap(),
            "2024-02-29"
        );
        assert_eq!(
            siguiente_ocurrencia("weekly", "2026-09-10").unwrap(),
            "2026-09-17"
        );
    }

    #[test]
    fn recurrentes_generan_serie() {
        let conn = mem();
        let mut t = sample("gasto", 10.0, "2026-09-01");
        t.recurrente = "daily".into();
        t.descripcion = "Suscripción".into();
        let tpl = insert_payment(&conn, &t).unwrap();
        assert!(tpl.es_plantilla());
        let n = generar_recurrentes(&conn, "2026-09-03").unwrap();
        assert_eq!(n, 2);
        let f = PaymentFilter {
            buscar: Some("Suscripción".into()),
            limite: 100,
            ..Default::default()
        };
        let items = query_payments(&conn, &f).unwrap();
        assert_eq!(items.len(), 3);
        assert!(items.iter().filter(|p| p.serie_id == Some(tpl.id)).count() == 2);
        // Segunda pasada no duplica.
        assert_eq!(generar_recurrentes(&conn, "2026-09-03").unwrap(), 0);
    }

    #[test]
    fn presupuestos_gasto_mes() {
        let conn = mem();
        let cats = all_categories(&conn).unwrap();
        let comida = cats.iter().find(|c| c.nombre == "Comida").unwrap().id;
        set_budget(&conn, comida, 100.0).unwrap();
        let mut g = sample("gasto", 30.0, "2026-09-05");
        g.categoria_id = Some(comida);
        insert_payment(&conn, &g).unwrap();
        let list = list_budgets(&conn, "2026-09").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].gastado_cents, 3000);
        assert_eq!(list[0].pct, 30);
        let pts = resumen_mensual(&conn, vec!["2026-09".to_string()]).unwrap();
        assert_eq!(pts.len(), 1);
        assert_eq!(pts[0].gastos_cents, 3000);
    }

    #[test]
    fn pendiente_no_afecta_resumen() {
        let conn = mem();
        let mut p = sample("gasto", 50.0, "2026-09-10");
        p.estado = "pendiente".into();
        insert_payment(&conn, &p).unwrap();
        insert_payment(&conn, &sample("gasto", 20.0, "2026-09-11")).unwrap();
        let s = month_summary(&conn, "2026-09").unwrap();
        assert_eq!(s.gastos_cents, 2000);
        assert_eq!(s.count, 1);
        let f = PaymentFilter {
            estado: Some("pendiente".into()),
            limite: 100,
            ..Default::default()
        };
        assert_eq!(query_payments(&conn, &f).unwrap().len(), 1);
    }

    #[test]
    fn marcar_pago_cambia_estado() {
        let conn = mem();
        let p = insert_payment(&conn, &sample("gasto", 15.0, "2026-09-10")).unwrap();
        assert_eq!(p.estado, "pagado");
        let m = marcar_pago(&conn, p.id, "pendiente").unwrap();
        assert_eq!(m.estado, "pendiente");
        assert!(marcar_pago(&conn, p.id, "otro").is_err());
        assert!(marcar_pago(&conn, 9999, "pagado").is_err());
    }

    #[test]
    fn migracion_v3_futuros_pendientes() {
        // Simula DB v1: esquema base sin serie_id/estado, versión 0.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
             CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL,
               monto_cents INTEGER NOT NULL, fecha TEXT NOT NULL,
               categoria_id INTEGER, descripcion TEXT NOT NULL DEFAULT '',
               contacto_id INTEGER, comprobante_path TEXT NOT NULL DEFAULT '',
               recurrente TEXT NOT NULL DEFAULT 'none', created_at TEXT NOT NULL DEFAULT (datetime('now')));
             CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
               color TEXT NOT NULL DEFAULT '#10b981', tipo TEXT NOT NULL DEFAULT 'ambos');
             CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
               telefono TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '',
               created_at TEXT NOT NULL DEFAULT (datetime('now')));
             CREATE TABLE debts (id INTEGER PRIMARY KEY AUTOINCREMENT, direccion TEXT NOT NULL,
               persona TEXT NOT NULL, contacto_id INTEGER, monto_total_cents INTEGER NOT NULL,
               saldo_cents INTEGER NOT NULL, fecha_limite TEXT NOT NULL DEFAULT '',
               estado TEXT NOT NULL DEFAULT 'activa', notas TEXT NOT NULL DEFAULT '',
               created_at TEXT NOT NULL DEFAULT (datetime('now')));
             CREATE TABLE debt_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, debt_id INTEGER NOT NULL,
               monto_cents INTEGER NOT NULL, fecha TEXT NOT NULL, nota TEXT NOT NULL DEFAULT '');
             CREATE TABLE reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL,
               detalle TEXT NOT NULL DEFAULT '', fecha_hora TEXT NOT NULL,
               repetir TEXT NOT NULL DEFAULT 'none', payment_id INTEGER, debt_id INTEGER,
               sonido INTEGER NOT NULL DEFAULT 1, persistente INTEGER NOT NULL DEFAULT 1,
               hecho INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
             CREATE TABLE settings (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '');
             CREATE TABLE budgets (id INTEGER PRIMARY KEY AUTOINCREMENT,
               categoria_id INTEGER NOT NULL UNIQUE, monto_cents INTEGER NOT NULL);
             INSERT INTO payments (tipo, monto_cents, fecha, descripcion) VALUES ('gasto', 1000, '2000-01-01', 'viejo');
             INSERT INTO payments (tipo, monto_cents, fecha, descripcion) VALUES ('gasto', 2000, '2099-01-01', 'futuro');",
        )
        .unwrap();
        init(&conn).unwrap();
        let viejo = get_payment(&conn, 1).unwrap();
        let futuro = get_payment(&conn, 2).unwrap();
        assert_eq!(viejo.estado, "pagado");
        assert_eq!(futuro.estado, "pendiente");
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 3);
    }

    #[test]
    fn respaldo_ida_y_vuelta() {
        let conn = mem();
        insert_payment(&conn, &sample("gasto", 9.5, "2026-09-10")).unwrap();
        let json = dump_respaldo(&conn, "t").unwrap();
        assert!(json.contains("\"app\":\"remindpay\""));
        let msg = restore_respaldo(&conn, &json).unwrap();
        assert!(msg.contains("1 pagos"));
        let f = PaymentFilter {
            limite: 10,
            ..Default::default()
        };
        assert_eq!(query_payments(&conn, &f).unwrap().len(), 1);
        assert!(restore_respaldo(&conn, "{}").is_err());
        assert!(restore_respaldo(&conn, "no-json").is_err());
    }
}

// ── Respaldo portable M3 (exportar/importar PC↔iPhone) ─────────────────────

/// Lee una tabla como JSON (columnas dinámicas por tipo SQLite).
fn tabla_json(
    conn: &Connection,
    sql: &str,
    cols: &[&str],
) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| format!("dump: {e}"))?;
    let empty: &[&dyn rusqlite::ToSql] = &[];
    let rows = stmt
        .query_map(empty, |r| {
            let mut m = serde_json::Map::new();
            for (i, c) in cols.iter().enumerate() {
                let v: rusqlite::types::Value = r.get(i)?;
                m.insert(
                    (*c).to_string(),
                    match v {
                        rusqlite::types::Value::Null => serde_json::Value::Null,
                        rusqlite::types::Value::Integer(x) => serde_json::json!(x),
                        rusqlite::types::Value::Real(x) => serde_json::json!(x),
                        rusqlite::types::Value::Text(s) => {
                            serde_json::Value::String(s)
                        }
                        rusqlite::types::Value::Blob(b) => serde_json::json!(b),
                    },
                );
            }
            Ok(m)
        })
        .map_err(|e| format!("dump: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(serde_json::Value::Object(
            r.map_err(|e| format!("dump: {e}"))?,
        ));
    }
    Ok(out)
}

/// Volcado completo JSON. Excluye secretos (ai_key, pin_hash, pin_salt):
/// cada dispositivo guarda los suyos.
pub fn dump_respaldo(conn: &Connection, stamp: &str) -> Result<String, String> {
    let doc = serde_json::json!({
        "app": "remindpay",
        "v": 1,
        "stamp": stamp,
        "categories": tabla_json(conn, "SELECT id, nombre, color, tipo FROM categories ORDER BY id", &["id", "nombre", "color", "tipo"])?,
        "payments": tabla_json(conn, "SELECT id, tipo, monto_cents, fecha, categoria_id, contacto_id, descripcion, recurrente, comprobante_path, serie_id, estado, created_at FROM payments ORDER BY id", &["id", "tipo", "monto_cents", "fecha", "categoria_id", "contacto_id", "descripcion", "recurrente", "comprobante_path", "serie_id", "estado", "created_at"])?,
        "debts": tabla_json(conn, "SELECT id, direccion, persona, contacto_id, monto_total_cents, saldo_cents, fecha_limite, estado, notas, created_at FROM debts ORDER BY id", &["id", "direccion", "persona", "contacto_id", "monto_total_cents", "saldo_cents", "fecha_limite", "estado", "notas", "created_at"])?,
        "debt_payments": tabla_json(conn, "SELECT id, debt_id, monto_cents, fecha, nota FROM debt_payments ORDER BY id", &["id", "debt_id", "monto_cents", "fecha", "nota"])?,
        "contacts": tabla_json(conn, "SELECT id, nombre, telefono, nota, created_at FROM contacts ORDER BY id", &["id", "nombre", "telefono", "nota", "created_at"])?,
        "reminders": tabla_json(conn, "SELECT id, titulo, detalle, fecha_hora, repetir, payment_id, debt_id, sonido, persistente, hecho, created_at FROM reminders ORDER BY id", &["id", "titulo", "detalle", "fecha_hora", "repetir", "payment_id", "debt_id", "sonido", "persistente", "hecho", "created_at"])?,
        "budgets": tabla_json(conn, "SELECT id, categoria_id, monto_cents FROM budgets ORDER BY id", &["id", "categoria_id", "monto_cents"])?,
        "settings": tabla_json(conn, "SELECT clave, valor FROM settings WHERE clave NOT IN ('ai_key', 'pin_hash', 'pin_salt')", &["clave", "valor"])?,
    });
    serde_json::to_string(&doc).map_err(|e| format!("json: {e}"))
}

fn ji(v: &serde_json::Value) -> i64 {
    v.as_i64().unwrap_or(0)
}
fn js(v: &serde_json::Value) -> String {
    v.as_str().unwrap_or("").to_string()
}
fn jo(v: &serde_json::Value) -> Option<i64> {
    v.as_i64()
}
fn jb(v: &serde_json::Value) -> bool {
    v.as_bool()
        .unwrap_or_else(|| v.as_i64().unwrap_or(0) != 0)
}

/// Restaura un volcado (reemplazo total) en una transacción.
/// Devuelve resumen "N pagos, M deudas, K avisos".
pub fn restore_respaldo(conn: &Connection, json: &str) -> Result<String, String> {
    let doc: serde_json::Value = serde_json::from_str(json)
        .map_err(|_| "respaldo inválido: no es JSON".to_string())?;
    if doc.get("app").and_then(|v| v.as_str()) != Some("remindpay") {
        return Err("respaldo inválido: no es de RemindPay".into());
    }
    let arr = |k: &str| -> Result<Vec<serde_json::Value>, String> {
        doc.get(k)
            .and_then(|v| v.as_array())
            .cloned()
            .ok_or_else(|| format!("respaldo inválido: falta {k}"))
    };
    let cats = arr("categories")?;
    let pays = arr("payments")?;
    let debts = arr("debts")?;
    let abonos = arr("debt_payments")?;
    let contacts = arr("contacts")?;
    let rems = arr("reminders")?;
    let budgets = arr("budgets")?;
    let settings = doc
        .get("settings")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| format!("restore: {e}"))?;
    let r: Result<String, String> = (|| {
        conn.execute_batch("DELETE FROM debt_payments; DELETE FROM payments; DELETE FROM debts; DELETE FROM reminders; DELETE FROM contacts; DELETE FROM categories; DELETE FROM budgets;")
            .map_err(|e| format!("limpiar: {e}"))?;
        for c in &cats {
            conn.execute(
                "INSERT INTO categories (id, nombre, color, tipo) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![ji(&c["id"]), js(&c["nombre"]), js(&c["color"]), js(&c["tipo"])],
            )
            .map_err(|e| format!("categorías: {e}"))?;
        }
        for p in &pays {
            conn.execute(
                "INSERT INTO payments (id, tipo, monto_cents, fecha, categoria_id, contacto_id, descripcion, recurrente, comprobante_path, serie_id, estado, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                rusqlite::params![ji(&p["id"]), js(&p["tipo"]), ji(&p["monto_cents"]), js(&p["fecha"]), jo(&p["categoria_id"]), jo(&p["contacto_id"]), js(&p["descripcion"]), js(&p["recurrente"]), js(&p["comprobante_path"]), jo(&p["serie_id"]), js(&p["estado"]), js(&p["created_at"])],
            )
            .map_err(|e| format!("pagos: {e}"))?;
        }
        for d in &debts {
            conn.execute(
                "INSERT INTO debts (id, direccion, persona, contacto_id, monto_total_cents, saldo_cents, fecha_limite, estado, notas, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                rusqlite::params![ji(&d["id"]), js(&d["direccion"]), js(&d["persona"]), jo(&d["contacto_id"]), ji(&d["monto_total_cents"]), ji(&d["saldo_cents"]), js(&d["fecha_limite"]), js(&d["estado"]), js(&d["notas"]), js(&d["created_at"])],
            )
            .map_err(|e| format!("deudas: {e}"))?;
        }
        for a in &abonos {
            conn.execute(
                "INSERT INTO debt_payments (id, debt_id, monto_cents, fecha, nota) VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params![ji(&a["id"]), ji(&a["debt_id"]), ji(&a["monto_cents"]), js(&a["fecha"]), js(&a["nota"])],
            )
            .map_err(|e| format!("abonos: {e}"))?;
        }
        for c in &contacts {
            conn.execute(
                "INSERT INTO contacts (id, nombre, telefono, nota, created_at) VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params![ji(&c["id"]), js(&c["nombre"]), js(&c["telefono"]), js(&c["nota"]), js(&c["created_at"])],
            )
            .map_err(|e| format!("contactos: {e}"))?;
        }
        for m in &rems {
            conn.execute(
                "INSERT INTO reminders (id, titulo, detalle, fecha_hora, repetir, payment_id, debt_id, sonido, persistente, hecho, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                rusqlite::params![ji(&m["id"]), js(&m["titulo"]), js(&m["detalle"]), js(&m["fecha_hora"]), js(&m["repetir"]), jo(&m["payment_id"]), jo(&m["debt_id"]), jb(&m["sonido"]), jb(&m["persistente"]), jb(&m["hecho"]), js(&m["created_at"])],
            )
            .map_err(|e| format!("avisos: {e}"))?;
        }
        for b in &budgets {
            conn.execute(
                "INSERT INTO budgets (id, categoria_id, monto_cents) VALUES (?1,?2,?3)",
                rusqlite::params![ji(&b["id"]), ji(&b["categoria_id"]), ji(&b["monto_cents"])],
            )
            .map_err(|e| format!("presupuestos: {e}"))?;
        }
        for s in &settings {
            let k = js(&s["clave"]);
            if k.is_empty() || k == "ai_key" || k == "pin_hash" || k == "pin_salt" {
                continue;
            }
            conn.execute(
                "INSERT INTO settings (clave, valor) VALUES (?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
                rusqlite::params![k, js(&s["valor"])],
            )
            .map_err(|e| format!("ajustes: {e}"))?;
        }
        for t in [
            "payments",
            "debts",
            "debt_payments",
            "contacts",
            "reminders",
            "categories",
            "budgets",
        ] {
            conn.execute_batch(&format!(
                "UPDATE sqlite_sequence SET seq = COALESCE((SELECT MAX(id) FROM {t}), seq) WHERE name = '{t}'"
            ))
            .map_err(|e| format!("secuencia: {e}"))?;
        }
        Ok(format!(
            "{} pagos, {} deudas, {} avisos",
            pays.len(),
            debts.len(),
            rems.len()
        ))
    })();
    match r {
        Ok(msg) => {
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("restore: {e}"))?;
            Ok(msg)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}
