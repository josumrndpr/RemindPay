//! RemindPay — comandos Tauri (wrappers delgados sobre db.rs).

use crate::db;
use crate::models::{
    BackupInfo, BudgetView, Category, Contact, Debt, DebtFilter, DebtPayment, DebtsSummary,
    EditDebt, MonthPoint, MonthSummary, NewContact, NewDebt, NewDebtPayment, NewPayment,
    NewReminder, Payment, PaymentFilter, Reminder, ReminderFilter,
};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

// ── Pagos ──

#[tauri::command]
pub fn list_payments(
    state: State<'_, Mutex<Connection>>,
    tipo: Option<String>,
    mes: Option<String>,
    buscar: Option<String>,
    estado: Option<String>,
    limite: Option<i64>,
) -> Result<Vec<Payment>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::query_payments(
        &conn,
        &PaymentFilter {
            tipo,
            mes,
            buscar,
            estado,
            limite: limite.unwrap_or(200),
        },
    )
}

#[tauri::command]
pub fn create_payment(
    state: State<'_, Mutex<Connection>>,
    input: NewPayment,
) -> Result<Payment, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::insert_payment(&conn, &input)
}

#[tauri::command]
pub fn update_payment(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    input: NewPayment,
) -> Result<Payment, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::update_payment(&conn, id, &input)
}

#[tauri::command]
pub fn delete_payment(state: State<'_, Mutex<Connection>>, id: i64) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::delete_payment(&conn, id)
}

#[tauri::command]
pub fn marcar_pago(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    estado: String,
) -> Result<Payment, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::marcar_pago(&conn, id, &estado)
}

#[tauri::command]
pub fn payments_summary(
    state: State<'_, Mutex<Connection>>,
    mes: String,
) -> Result<MonthSummary, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::month_summary(&conn, &mes)
}

#[tauri::command]
pub fn list_categories(state: State<'_, Mutex<Connection>>) -> Result<Vec<Category>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::all_categories(&conn)
}

// ── Deudas ──

#[tauri::command]
pub fn list_debts(
    state: State<'_, Mutex<Connection>>,
    direccion: Option<String>,
    estado: Option<String>,
    buscar: Option<String>,
    limite: Option<i64>,
    hoy: String,
) -> Result<Vec<Debt>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::query_debts(
        &conn,
        &DebtFilter {
            direccion,
            estado,
            buscar,
            limite: limite.unwrap_or(200),
        },
        &hoy,
    )
}

#[tauri::command]
pub fn create_debt(
    state: State<'_, Mutex<Connection>>,
    input: NewDebt,
    hoy: String,
) -> Result<Debt, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::insert_debt(&conn, &input, &hoy)
}

#[tauri::command]
pub fn update_debt(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    input: EditDebt,
    hoy: String,
) -> Result<Debt, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::update_debt(&conn, id, &input, &hoy)
}

#[tauri::command]
pub fn delete_debt(state: State<'_, Mutex<Connection>>, id: i64) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::delete_debt(&conn, id)
}

#[tauri::command]
pub fn add_debt_payment(
    state: State<'_, Mutex<Connection>>,
    debt_id: i64,
    input: NewDebtPayment,
    hoy: String,
) -> Result<Debt, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::add_debt_payment(&conn, debt_id, &input, &hoy)
}

#[tauri::command]
pub fn list_debt_payments(
    state: State<'_, Mutex<Connection>>,
    debt_id: i64,
) -> Result<Vec<DebtPayment>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::list_debt_payments(&conn, debt_id)
}

#[tauri::command]
pub fn debts_summary(state: State<'_, Mutex<Connection>>) -> Result<DebtsSummary, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::debts_summary(&conn)
}

// ── Contactos ──

#[tauri::command]
pub fn list_contacts(
    state: State<'_, Mutex<Connection>>,
    buscar: Option<String>,
) -> Result<Vec<Contact>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::query_contacts(&conn, buscar)
}

#[tauri::command]
pub fn create_contact(
    state: State<'_, Mutex<Connection>>,
    input: NewContact,
) -> Result<Contact, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::insert_contact(&conn, &input)
}

#[tauri::command]
pub fn update_contact(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    input: NewContact,
) -> Result<Contact, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::update_contact(&conn, id, &input)
}

#[tauri::command]
pub fn delete_contact(state: State<'_, Mutex<Connection>>, id: i64) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::delete_contact(&conn, id)
}

// ── Recordatorios ──

#[tauri::command]
pub fn list_reminders(
    state: State<'_, Mutex<Connection>>,
    desde: Option<String>,
    hasta: Option<String>,
    solo_pendientes: Option<bool>,
    buscar: Option<String>,
    limite: Option<i64>,
) -> Result<Vec<Reminder>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::query_reminders(
        &conn,
        &ReminderFilter {
            desde,
            hasta,
            solo_pendientes,
            buscar,
            limite: limite.unwrap_or(200),
        },
    )
}

#[tauri::command]
pub fn create_reminder(
    state: State<'_, Mutex<Connection>>,
    input: NewReminder,
) -> Result<Reminder, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::insert_reminder(&conn, &input)
}

#[tauri::command]
pub fn update_reminder(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    input: NewReminder,
) -> Result<Reminder, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::update_reminder(&conn, id, &input)
}

#[tauri::command]
pub fn delete_reminder(state: State<'_, Mutex<Connection>>, id: i64) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::delete_reminder(&conn, id)
}

#[tauri::command]
pub fn set_reminder_done(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    hecho: bool,
) -> Result<Reminder, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::set_reminder_done(&conn, id, hecho)
}

#[tauri::command]
pub fn due_reminders(
    state: State<'_, Mutex<Connection>>,
    ahora: String,
) -> Result<Vec<Reminder>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::due_reminders(&conn, &ahora)
}

// ── Sistema ──

#[tauri::command]
pub fn data_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| format!("app_data_dir: {e}"))
}

#[tauri::command]
pub fn is_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("autostart: {e}"))
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enable: bool) -> Result<(), String> {
    let launcher = app.autolaunch();
    if enable {
        launcher.enable()
    } else {
        launcher.disable()
    }
    .map_err(|e| format!("autostart: {e}"))
}

// ── Ajustes, PIN, respaldos ──

#[tauri::command]
pub fn get_setting(
    state: State<'_, Mutex<Connection>>,
    clave: String,
) -> Result<Option<String>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::get_setting(&conn, &clave)
}

#[tauri::command]
pub fn set_setting(
    state: State<'_, Mutex<Connection>>,
    clave: String,
    valor: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::set_setting(&conn, &clave, &valor)
}

#[tauri::command]
pub fn is_pin_set(state: State<'_, Mutex<Connection>>) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::is_pin_set(&conn)
}

#[tauri::command]
pub fn set_pin(state: State<'_, Mutex<Connection>>, pin: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::set_pin(&conn, &pin)
}

#[tauri::command]
pub fn verify_pin(state: State<'_, Mutex<Connection>>, pin: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::verify_pin(&conn, &pin)
}

fn backups_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| format!("crear backups: {e}"))?;
    Ok(dir)
}

fn backup_info(path: &std::path::Path) -> Result<BackupInfo, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("metadata: {e}"))?;
    let creado = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok(BackupInfo {
        nombre: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        bytes: meta.len(),
        creado_secs: creado,
    })
}

fn listar_nombres(dir: &std::path::Path) -> Result<Vec<String>, String> {
    let mut nombres: Vec<String> = std::fs::read_dir(dir)
        .map_err(|e| format!("leer backups: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.starts_with("remindpay-") && n.ends_with(".db"))
        .collect();
    nombres.sort();
    nombres.reverse();
    Ok(nombres)
}

#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    let dir = backups_dir(&app)?;
    let mut out = Vec::new();
    for n in listar_nombres(&dir)? {
        out.push(backup_info(&dir.join(n))?);
    }
    Ok(out)
}

#[tauri::command]
pub fn create_backup(
    state: State<'_, Mutex<Connection>>,
    app: AppHandle,
    stamp: String,
) -> Result<BackupInfo, String> {
    if stamp.len() > 32
        || !stamp
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("marca inválida".into());
    }
    let dir = backups_dir(&app)?;
    let dest = dir.join(format!("remindpay-{stamp}.db"));
    let ruta = dest.to_string_lossy().replace('\'', "''");
    {
        let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
        conn.execute_batch(&format!("VACUUM INTO '{ruta}'"))
            .map_err(|e| format!("backup: {e}"))?;
    }
    for viejo in listar_nombres(&dir)?.into_iter().skip(30) {
        let _ = std::fs::remove_file(dir.join(viejo));
    }
    backup_info(&dest)
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("escribir: {e}"))?;
    Ok(())
}

// ── Comprobantes, recurrentes, presupuestos ──

fn nombre_seguro(nombre: &str) -> String {
    nombre
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .chars()
        .take(60)
        .collect()
}

/// Copia un comprobante (PNG/JPG/WEBP/PDF ≤10MB) a la carpeta de la app.
/// Devuelve el nombre guardado (relativo).
#[tauri::command]
pub fn guardar_comprobante(
    app: AppHandle,
    origen: String,
    stamp: String,
) -> Result<String, String> {
    if stamp.len() > 32
        || !stamp
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("marca inválida".into());
    }
    let src = std::path::PathBuf::from(&origen);
    if !src.is_file() {
        return Err("archivo no válido".into());
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["png", "jpg", "jpeg", "webp", "pdf"].contains(&ext.as_str()) {
        return Err("solo PNG, JPG, WEBP o PDF".into());
    }
    let meta = std::fs::metadata(&src).map_err(|e| format!("leer: {e}"))?;
    if meta.len() > 10 * 1024 * 1024 {
        return Err("máximo 10 MB".into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("comprobantes");
    std::fs::create_dir_all(&dir).map_err(|e| format!("crear carpeta: {e}"))?;
    let base = src
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "archivo".into());
    let nombre = format!("{stamp}-{}.{}", nombre_seguro(&base), ext);
    std::fs::copy(&src, dir.join(&nombre)).map_err(|e| format!("copiar: {e}"))?;
    Ok(nombre)
}

/// Ruta absoluta de un comprobante guardado (para abrirlo).
#[tauri::command]
pub fn ruta_comprobante(app: AppHandle, nombre: String) -> Result<String, String> {
    if nombre.len() > 120
        || !nombre
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    {
        return Err("nombre inválido".into());
    }
    let ruta = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("comprobantes")
        .join(&nombre);
    if !ruta.is_file() {
        return Err("comprobante no encontrado".into());
    }
    Ok(ruta.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn generar_recurrentes(
    state: State<'_, Mutex<Connection>>,
    hoy: String,
) -> Result<i64, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::generar_recurrentes(&conn, &hoy)
}

#[tauri::command]
pub fn list_budgets(
    state: State<'_, Mutex<Connection>>,
    mes: String,
) -> Result<Vec<BudgetView>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::list_budgets(&conn, &mes)
}

#[tauri::command]
pub fn set_budget(
    state: State<'_, Mutex<Connection>>,
    categoria_id: i64,
    monto: f64,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::set_budget(&conn, categoria_id, monto)
}

#[tauri::command]
pub fn delete_budget(state: State<'_, Mutex<Connection>>, id: i64) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::delete_budget(&conn, id)
}

#[tauri::command]
pub fn resumen_mensual(
    state: State<'_, Mutex<Connection>>,
    meses: Vec<String>,
) -> Result<Vec<MonthPoint>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::resumen_mensual(&conn, meses)
}
