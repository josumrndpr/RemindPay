-- RemindPay — esquema SQLite v1 (moneda USD, montos en centavos INTEGER)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#10b981',
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto','ambos')) DEFAULT 'ambos'
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  monto_cents INTEGER NOT NULL CHECK (monto_cents > 0),
  fecha TEXT NOT NULL,
  categoria_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  contacto_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  comprobante_path TEXT NOT NULL DEFAULT '',
  recurrente TEXT NOT NULL DEFAULT 'none' CHECK (recurrente IN ('none','daily','weekly','monthly')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_fecha ON payments(fecha);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direccion TEXT NOT NULL CHECK (direccion IN ('debo','me_deben')),
  persona TEXT NOT NULL,
  contacto_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  monto_total_cents INTEGER NOT NULL CHECK (monto_total_cents > 0),
  saldo_cents INTEGER NOT NULL CHECK (saldo_cents >= 0),
  fecha_limite TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','saldada','vencida')),
  notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_debts_estado ON debts(estado);

CREATE TABLE IF NOT EXISTS debt_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  monto_cents INTEGER NOT NULL CHECK (monto_cents > 0),
  fecha TEXT NOT NULL,
  nota TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT '',
  fecha_hora TEXT NOT NULL,
  repetir TEXT NOT NULL DEFAULT 'none' CHECK (repetir IN ('none','daily','weekly','monthly')),
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  debt_id INTEGER REFERENCES debts(id) ON DELETE SET NULL,
  sonido INTEGER NOT NULL DEFAULT 1,
  persistente INTEGER NOT NULL DEFAULT 1,
  hecho INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_fecha ON reminders(fecha_hora);

CREATE TABLE IF NOT EXISTS settings (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);
