//! RemindPay — entrypoint Rust (Tauri 2).
//! Fase 3: SQLite + recordatorios + bandeja (tray) + single-instance + autostart.

mod commands;
mod db;
mod models;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

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

fn mostrar_ventana(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            mostrar_ventana(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let conn =
                Connection::open(db_path(app.handle())?).map_err(|e| format!("abrir db: {e}"))?;
            db::init(&conn)?;
            app.manage(Mutex::new(conn));

            let abrir = MenuItem::with_id(app, "abrir", "Abrir RemindPay", true, None::<&str>)?;
            let salir = MenuItem::with_id(app, "salir", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &salir])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("icono de la app").clone())
                .tooltip("RemindPay")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "salir" => app.exit(0),
                    "abrir" => mostrar_ventana(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        mostrar_ventana(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Cerrar (X) minimiza a la bandeja; salir desde el menú del icono.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
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
            commands::list_reminders,
            commands::create_reminder,
            commands::update_reminder,
            commands::delete_reminder,
            commands::set_reminder_done,
            commands::due_reminders,
            commands::data_dir,
            commands::is_autostart,
            commands::set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RemindPay");
}
