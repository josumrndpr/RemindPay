# RemindPay — Plan maestro

App de escritorio Windows 100% local: pagos, deudas y recordatorios.
Stack: **Tauri 2 + Rust + React 19 + Vite + TypeScript + Tailwind v4 + SQLite (rusqlite)**.
Moneda: USD. Sin nube, sin cuentas, sin telemetría.

## Decisiones cerradas
- Tauri 2 (Rust) en vez de Electron: .exe ~10MB, WebView2 del sistema, SQLite + PIN en Rust.
- Recordatorios: notificación nativa Windows + sonido + persistentes hasta marcar hecho.
- PIN de 4–8 dígitos al abrir (hash Argon2id en Rust, nunca en frontend).
- Datos en `%APPDATA%/com.remindpay.app/data.db` + `/backups` con copia diaria (últimas 30).

## Modelo de datos (ver `src-tauri/schema.sql`)
- `payments`: ingresos/gastos, monto USD (centavos INTEGER), fecha, categoría, contacto, comprobante local, recurrencia.
- `debts` + `debt_payments`: dirección (debo / me_deben), total, saldo, vencimiento, estado, abonos parciales.
- `reminders`: título, fecha_hora, repetir (none/daily/weekly/monthly), vínculo a pago/deuda, sonido, persistente, hecho.
- `contacts`, `categories`, `settings` (PIN hash, backup dir, tema, autostart).

## Comandos Tauri (Rust → frontend vía `invoke`)
- `ping` → prueba Fase 0.
- Fase 1: `list_payments`, `create_payment`, `delete_payment`, `payments_summary` (balance mes).
- Fase 2: `list_debts`, `create_debt`, `add_debt_payment`, `settle_debt`.
- Fase 3: `list_reminders`, `create_reminder`, `complete_reminder`, `due_reminders` (polling cada 60s desde frontend + notificación nativa + sonido).
- Transversal: `verify_pin`, `set_pin`, `is_pin_set`, `create_backup`, `export_csv`, `get_settings`, `set_setting`.

## Pantallas
Sidebar: Dashboard / Pagos / Deudas / Recordatorios / Contactos / Config. PIN gate al arrancar.
- **Dashboard**: balance mes, próximos vencimientos 7 días, deudas activas, accesos rápidos.
- **Pagos**: tabla con filtros + buscador, nuevo/editar en diálogo, `N` atajo.
- **Deudas**: tarjetas por estado, abonos, `D` atajo.
- **Recordatorios**: lista por fecha, persistentes destacados, `R` atajo, `Ctrl+K` buscar global.

## Fases
- [x] **Fase 0** — scaffold, Tailwind, plugins (notification/autostart/single-instance/dialog), schema, shell + comando ping Rust, build web verde (tsc+vite). Rust sin compilar aún: requiere workload C++ (ver requisito de máquina).
- [x] **Fase 1 (código)** — Pagos + Dashboard (CRUD, filtros, balance, SQLite en Rust con 5 tests). Compilación Rust pendiente del workload C++.
- [ ] **Fase 2** — Deudas + abonos.
- [ ] **Fase 3** — Recordatorios + notificaciones + sonido + autostart + tray + persistentes.
- [ ] **Fase 4** — PIN real (Argon2), backups diarios, export CSV, tema, instalador NSIS firmado local.

## Requisito de máquina (Windows)
Para `tauri dev` / `tauri build` hace falta VS 2022 con workload **"Desarrollo para el escritorio con C++"** + WebView2 (ya lo tienes). Sin eso: `npm run dev` (solo web) y `cargo check` sí funcionan. Instálalo desde Visual Studio Installer → Modificar → marcar C++ → Instalar (~6GB).
