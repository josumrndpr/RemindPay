//! RemindPay — modelos de datos (Fase 1: pagos).

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
