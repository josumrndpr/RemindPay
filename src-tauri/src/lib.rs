//! RemindPay — entrypoint Rust (Tauri 2).
//! Fase 1: SQLite real (data.db en app-data) + comandos de pagos.

mod commands;
mod db;
mod models;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

/// Prueba del puente JS → Rust.
#[tauri::command]
fn ping(msg: &str) -> String {
    format!("pong: {msg}")
}

fn db_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("crear carpeta datos: {e}"))?;
    Ok(dir.join("data.db"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let conn =
                Connection::open(db_path(app.handle())?).map_err(|e| format!("abrir db: {e}"))?;
            db::init(&conn)?;
            app.manage(Mutex::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            commands::list_payments,
            commands::create_payment,
            commands::update_payment,
            commands::delete_payment,
            commands::payments_summary,
            commands::list_categories,
            commands::list_debts,
            commands::create_debt,
            commands::update_debt,
            commands::delete_debt,
            commands::add_debt_payment,
            commands::list_debt_payments,
            commands::debts_summary,
            commands::list_contacts,
            commands::create_contact,
            commands::update_contact,
            commands::delete_contact,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RemindPay");
}
