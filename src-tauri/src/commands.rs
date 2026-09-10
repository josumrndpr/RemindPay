//! RemindPay — comandos Tauri (wrappers delgados sobre db.rs).

use crate::db;
use crate::models::{
    Category, Contact, Debt, DebtFilter, DebtPayment, DebtsSummary, EditDebt, MonthSummary,
    NewContact, NewDebt, NewDebtPayment, NewPayment, Payment, PaymentFilter,
};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;

// ── Pagos ──

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
