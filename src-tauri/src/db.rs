//! RemindPay — acceso SQLite.
//! Funciones puras sobre `&Connection`: la app real usa el archivo data.db,
//! los tests usan base en memoria. Sin `chrono`: fechas como TEXT ISO.

use crate::models::{Category, MonthSummary, NewPayment, Payment, PaymentFilter};
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
    ("Entretenimiento", "#ec4899", "gasto"),
    ("Otros gastos", "#6b7280", "gasto"),
];

/// Crea tablas + categorías iniciales. Idempotente.
pub fn init(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("pragmas: {e}"))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("schema: {e}"))?;
    let empty: &[&dyn rusqlite::ToSql] = &[];
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM categories", empty, |r| r.get(0))
        .map_err(|e| format!("count categories: {e}"))?;
    if count == 0 {
        for (nombre, color, tipo) in SEED_CATEGORIES {
            conn.execute(
                "INSERT INTO categories (nombre, color, tipo) VALUES (?1, ?2, ?3)",
                params![nombre, color, tipo],
            )
            .map_err(|e| format!("seed: {e}"))?;
        }
    }
    Ok(())
}

/// Valida un pago y devuelve el monto en centavos USD.
pub fn validate(input: &NewPayment) -> Result<i64, String> {
    if input.tipo != "ingreso" && input.tipo != "gasto" {
        return Err("tipo inválido".into());
    }
    if !input.monto.is_finite() || input.monto <= 0.0 {
        return Err("el monto debe ser mayor a 0".into());
    }
    if input.monto > 999_999_999.0 {
        return Err("monto demasiado grande".into());
    }
    let cents = (input.monto * 100.0).round() as i64;
    if cents <= 0 {
        return Err("el monto debe ser mayor a 0".into());
    }
    if input.fecha.len() != 10 || input.fecha.as_bytes()[4] != b'-' {
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
        "INSERT INTO payments (tipo, monto_cents, fecha, categoria_id, descripcion) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.tipo,
            cents,
            input.fecha,
            input.categoria_id,
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
            "UPDATE payments SET tipo = ?1, monto_cents = ?2, fecha = ?3, categoria_id = ?4, descripcion = ?5 WHERE id = ?6",
            params![
                input.tipo,
                cents,
                input.fecha,
                input.categoria_id,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::NewPayment;

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
            descripcion: "prueba".into(),
        }
    }

    #[test]
    fn seed_crea_categorias() {
        let conn = mem();
        let cats = all_categories(&conn).unwrap();
        assert_eq!(cats.len(), 9);
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
}
