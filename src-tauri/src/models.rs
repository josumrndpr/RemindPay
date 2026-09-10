//! RemindPay — modelos de datos (Fase 1: pagos · Fase 2: deudas + contactos).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct Payment {
    pub id: i64,
    pub tipo: String,
    pub monto_cents: i64,
    pub fecha: String,
    pub categoria_id: Option<i64>,
    pub categoria: Option<String>,
    pub descripcion: String,
    pub contacto_id: Option<i64>,
    pub comprobante_path: String,
    pub recurrente: String,
    pub created_at: String,
}

/// Lo que envía el frontend: monto en dólares, Rust lo pasa a centavos.
#[derive(Debug, Clone, Deserialize)]
pub struct NewPayment {
    pub tipo: String,
    pub monto: f64,
    pub fecha: String,
    pub categoria_id: Option<i64>,
    pub contacto_id: Option<i64>,
    pub descripcion: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Category {
    pub id: i64,
    pub nombre: String,
    pub color: String,
    pub tipo: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MonthSummary {
    pub mes: String,
    pub ingresos_cents: i64,
    pub gastos_cents: i64,
    pub balance_cents: i64,
    pub count: i64,
}

#[derive(Debug, Clone, Default)]
pub struct PaymentFilter {
    pub tipo: Option<String>,
    pub mes: Option<String>,
    pub buscar: Option<String>,
    pub limite: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Debt {
    pub id: i64,
    pub direccion: String,
    pub persona: String,
    pub contacto_id: Option<i64>,
    pub contacto: Option<String>,
    pub monto_total_cents: i64,
    pub saldo_cents: i64,
    pub fecha_limite: String,
    pub estado: String,
    pub notas: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewDebt {
    pub direccion: String,
    pub persona: String,
    pub contacto_id: Option<i64>,
    pub monto_total: f64,
    pub fecha_limite: String,
    pub notas: String,
}

/// Edición: la dirección no cambia (debo ↔ me_deben sería otra deuda).
#[derive(Debug, Clone, Deserialize)]
pub struct EditDebt {
    pub persona: String,
    pub contacto_id: Option<i64>,
    pub monto_total: f64,
    pub fecha_limite: String,
    pub notas: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DebtPayment {
    pub id: i64,
    pub debt_id: i64,
    pub monto_cents: i64,
    pub fecha: String,
    pub nota: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewDebtPayment {
    pub monto: f64,
    pub fecha: String,
    pub nota: String,
}

#[derive(Debug, Clone, Default)]
pub struct DebtFilter {
    pub direccion: Option<String>,
    pub estado: Option<String>,
    pub buscar: Option<String>,
    pub limite: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DebtsSummary {
    pub por_pagar_cents: i64,
    pub por_cobrar_cents: i64,
    pub activas: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Contact {
    pub id: i64,
    pub nombre: String,
    pub telefono: String,
    pub nota: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewContact {
    pub nombre: String,
    pub telefono: String,
    pub nota: String,
}
