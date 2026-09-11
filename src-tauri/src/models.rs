//! RemindPay — modelos (Fase 1: pagos · Fase 2: deudas + contactos · Fase 3: recordatorios).

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
    pub serie_id: Option<i64>,
    pub estado: String,
    pub created_at: String,
}

impl Payment {
    pub fn es_plantilla(&self) -> bool {
        self.recurrente != "none" && self.serie_id.is_none()
    }
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
    pub recurrente: String,
    pub comprobante_path: String,
    pub estado: String,
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
    pub estado: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
pub struct Reminder {
    pub id: i64,
    pub titulo: String,
    pub detalle: String,
    pub fecha_hora: String,
    pub repetir: String,
    pub payment_id: Option<i64>,
    pub debt_id: Option<i64>,
    pub sonido: bool,
    pub persistente: bool,
    pub hecho: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewReminder {
    pub titulo: String,
    pub detalle: String,
    pub fecha_hora: String,
    pub repetir: String,
    pub payment_id: Option<i64>,
    pub debt_id: Option<i64>,
    pub sonido: bool,
    pub persistente: bool,
}

#[derive(Debug, Clone, Default)]
pub struct ReminderFilter {
    pub desde: Option<String>,
    pub hasta: Option<String>,
    pub solo_pendientes: Option<bool>,
    pub buscar: Option<String>,
    pub limite: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupInfo {
    pub nombre: String,
    pub bytes: u64,
    pub creado_secs: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BudgetView {
    pub id: i64,
    pub categoria_id: i64,
    pub categoria: String,
    pub color: String,
    pub monto_cents: i64,
    pub gastado_cents: i64,
    pub pct: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MonthPoint {
    pub mes: String,
    pub ingresos_cents: i64,
    pub gastos_cents: i64,
}
