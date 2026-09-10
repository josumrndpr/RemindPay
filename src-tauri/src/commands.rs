//! RemindPay — comandos Tauri Fase 1 (wrappers delgados sobre db.rs).

use crate::db;
use crate::models::{Category, MonthSummary, NewPayment, Payment, PaymentFilter};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn list_payments(
    state: State<'_, Mutex<Connection>>,
    tipo: Option<String>,
    mes: Option<String>,
    buscar: Option<String>,
    limite: Option<i64>,
) -> Result<Vec<Payment>, String> {
    let conn = state.lock().map_err(|e| format!("db bloqueada: {e}"))?;
    db::query_payments(
        &conn,
        &PaymentFilter {
            tipo,
            mes,
            buscar,
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
