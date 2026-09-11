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
- [x] **Fase 2 (código)** — Deudas + abonos + Contactos (CRUD, sobrepago limitado con saldo automático, vencidas derivadas, resumen por cobrar/por pagar, 10 tests). Categoría "Suscripción" agregada (seed idempotente). Compilación Rust pendiente del workload C++.
- [x] **Fase 3 (código)** — Recordatorios + notificaciones nativas + sonido WebAudio + panel persistente (Hecho/+10 min) + repetición con siguiente ocurrencia automática + autostart + bandeja con X→minimizar + single-instance + Config (14 tests Rust). Compilación Rust pendiente del workload C++.
- [x] **Fase 4** — PIN Argon2id (crear/pedir/cambiar/bloquear) + ajustes genéricos + respaldos diarios automáticos (VACUUM INTO, últimas 30) + export CSV + tema oscuro/claro + NSIS. Compilado y verificado (nota: el PIN es puerta de acceso, no cifrado del archivo).
- [x] **0.2.0** — Comprobantes (PNG/JPG/WEBP/PDF ≤10MB) + recurrentes automáticos al abrir (calendario manual, serie_id, migración user_version) + presupuestos por categoría + gráfico 6 meses SVG. 18 tests. Instalador NSIS.
- [x] **0.3.0** — Pagado vs pendiente (los futuros no tocan balance; migración v3 auto) + "Próximos pagos" en Dashboard con "Ya lo pagué" + Planificador de quincena (fondo + paydays + extras, orden por vencimiento, sobrante, marcar pagados). 21 tests.
- [x] **0.4.0** — Asistente IA opcional (cliente OpenAI-compatible genérico: endpoint + key + modelo en Config con probar-conexión) + chat con contexto real del mes + registro de pagos por lenguaje natural con tarjeta de confirmación. Sin config, todo sigue 100% local.
- [x] **0.5.0** — Aura con identidad (rol, responsabilidad, conocimiento de la app) + acciones confirmadas (registrar pago, crear aviso, marcar pagado por id) + monitoreo con alertas (chequeo 1×/sesión al desbloquear, tarjeta en Asistente, urgentes con notificación + sonido).
- [x] **0.5.1** — Fix conexión IA: normaliza endpoint (acepta URL completa), peticiones vía plugin HTTP (sin CORS) + plugin registrado. Valores correctos Zen: base `https://opencode.ai/zen/v1`, modelo `mimo-v2.5-free`.
- [x] **0.5.2** — Go: headers `x-opencode-session` + UA exigidos por doc + errores con mensaje real del servidor. Go válido: base `https://opencode.ai/zen/go/v1`, modelo `mimo-v2.5`.
- [x] **0.5.3** — Config centrada en Go/Zen (botones preset, placeholders reales). Sin simulación: la IA siempre es HTTPS real o error real.
- [x] **0.5.4** — Fix modelos razonadores (mimo): fallback a `reasoning_details` si `content` viene null + test con 100 tokens. Clave/endpoint/modelo verificados en vivo (200 OK).

## Requisito de máquina (Windows)
Para `tauri dev` / `tauri build` hace falta VS 2022 con workload **"Desarrollo para el escritorio con C++"** + WebView2 (ya lo tienes). Sin eso: `npm run dev` (solo web) y `cargo check` sí funcionan. Instálalo desde Visual Studio Installer → Modificar → marcar C++ → Instalar (~6GB).
