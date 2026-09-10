// RemindPay — entrypoint Rust (Tauri 2)
// Fase 0: plugins + comando ping. DB/SQLite y PIN llegan en Fase 1/4.

/// Prueba del puente JS → Rust.
#[tauri::command]
fn ping(msg: &str) -> String {
    format!("pong: {msg}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running RemindPay");
}
