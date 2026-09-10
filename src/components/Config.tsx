import { useEffect, useState } from "react";
import {
  createBackup,
  getDataDir,
  getSetting,
  isAutostart,
  isPreview,
  listBackups,
  listDebts,
  listPayments,
  listReminders,
  setAutostart,
  setSetting,
  verifyPin,
  setPin,
} from "../lib/api";
import {
  ahoraArchivo,
  fmtBackupFecha,
  fmtBytes,
  todayLocal,
} from "../lib/format";
import {
  deudasCsv,
  guardarCsv,
  pagosCsv,
  recordatoriosCsv,
} from "../lib/export";
import type { BackupInfo } from "../lib/types";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-500";

export default function Config() {
  const [auto, setAuto] = useState(false);
  const [dir, setDir] = useState("");
  const [tema, setTema] = useState<"oscuro" | "claro">("oscuro");
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinConf, setPinConf] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [a, d, t, b] = await Promise.all([
          isAutostart(),
          getDataDir(),
          getSetting("tema"),
          listBackups(),
        ]);
        setAuto(a);
        setDir(d);
        if (t === "claro" || t === "oscuro") setTema(t);
        setBackups(b);
      } catch (e) {
        setMsg(String(e));
      }
    })();
  }, []);

  function flash(texto: string) {
    setOk(texto);
    setMsg(null);
    setTimeout(() => setOk(null), 3000);
  }

  function fail(e: unknown) {
    setMsg(String(e));
    setOk(null);
  }

  async function toggleAuto() {
    const next = !auto;
    try {
      await setAutostart(next);
      setAuto(next);
    } catch (e) {
      fail(e);
    }
  }

  async function cambiarTema(next: "oscuro" | "claro") {
    setTema(next);
    document.documentElement.classList.toggle("light", next === "claro");
    try {
      await setSetting("tema", next);
    } catch (e) {
      fail(e);
    }
  }

  async function cambiarPin() {
    if (!/^\d{4,8}$/.test(pinNuevo)) {
      fail("El PIN nuevo debe tener de 4 a 8 dígitos");
      return;
    }
    if (pinNuevo !== pinConf) {
      fail("Los PIN no coinciden");
      return;
    }
    setBusy(true);
    try {
      if (!(await verifyPin(pinActual))) {
        fail("El PIN actual es incorrecto");
        return;
      }
      await setPin(pinNuevo);
      setPinActual("");
      setPinNuevo("");
      setPinConf("");
      flash("PIN actualizado");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function respaldoAhora() {
    setBusy(true);
    try {
      const b = await createBackup(ahoraArchivo());
      setBackups(await listBackups());
      flash(`Respaldo creado: ${b.nombre}`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function exportar(cual: "pagos" | "deudas" | "recordatorios") {
    setBusy(true);
    try {
      const sello = todayLocal();
      if (cual === "pagos") {
        const items = await listPayments({ limite: 2000 });
        await guardarCsv(`remindpay-pagos-${sello}.csv`, pagosCsv(items));
      } else if (cual === "deudas") {
        const items = await listDebts({ limite: 2000 });
        await guardarCsv(`remindpay-deudas-${sello}.csv`, deudasCsv(items));
      } else {
        const items = await listReminders({ limite: 2000 });
        await guardarCsv(
          `remindpay-recordatorios-${sello}.csv`,
          recordatoriosCsv(items),
        );
      }
      flash("CSV exportado");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight">Configuración</h2>
      <p className="mt-1 text-sm text-zinc-500">Comportamiento de la app</p>

      {msg && (
        <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {msg}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          {ok}
        </p>
      )}

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div>
            <p className="font-medium">Iniciar con Windows</p>
            <p className="text-sm text-zinc-500">
              RemindPay arranca solo para revisar tus avisos
              {isPreview() ? " (solo funciona en la app instalada)" : ""}
            </p>
          </div>
          <button
            onClick={() => void toggleAuto()}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              auto ? "bg-emerald-500" : "bg-zinc-700"
            }`}
            aria-label="Iniciar con Windows"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                auto ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="font-medium">Tema</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["oscuro", "claro"] as const).map((t) => (
              <button
                key={t}
                onClick={() => void cambiarTema(t)}
                className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${
                  tema === t
                    ? "bg-emerald-500 text-zinc-950"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="font-medium">Cambiar PIN</p>
          <div className="mt-3 space-y-2">
            <input
              type="password"
              value={pinActual}
              onChange={(e) =>
                setPinActual(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
              placeholder="PIN actual"
              inputMode="numeric"
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                value={pinNuevo}
                onChange={(e) =>
                  setPinNuevo(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="PIN nuevo"
                inputMode="numeric"
                className={inputCls}
              />
              <input
                type="password"
                value={pinConf}
                onChange={(e) =>
                  setPinConf(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="Confirma"
                inputMode="numeric"
                className={inputCls}
              />
            </div>
            <button
              onClick={() => void cambiarPin()}
              disabled={busy}
              className="w-full rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Actualizar PIN
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Respaldos</p>
              <p className="text-sm text-zinc-500">
                Copia diaria automática + últimas 30
              </p>
            </div>
            <button
              onClick={() => void respaldoAhora()}
              disabled={busy}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Crear copia ahora
            </button>
          </div>
          {backups.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Aún no hay copias.</p>
          ) : (
            <div className="mt-3 divide-y divide-zinc-800/60">
              {backups.slice(0, 8).map((b) => (
                <div
                  key={b.nombre}
                  className="flex items-center justify-between py-1.5 text-sm"
                >
                  <span className="truncate font-mono text-xs text-zinc-300">
                    {b.nombre}
                  </span>
                  <span className="ml-3 shrink-0 text-xs text-zinc-500">
                    {fmtBytes(b.bytes)} · {fmtBackupFecha(b.creado_secs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="font-medium">Exportar CSV</p>
          <p className="mt-1 text-sm text-zinc-500">
            Compatible con Excel (punto y coma)
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              onClick={() => void exportar("pagos")}
              disabled={busy}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Pagos
            </button>
            <button
              onClick={() => void exportar("deudas")}
              disabled={busy}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Deudas
            </button>
            <button
              onClick={() => void exportar("recordatorios")}
              disabled={busy}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Avisos
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="font-medium">Tus datos</p>
          <p className="mt-1 break-all font-mono text-xs text-zinc-400">{dir}</p>
          <p className="mt-2 text-sm text-zinc-500">
            Cerrar la ventana minimiza a la bandeja; para salir usa el menú del
            icono.
          </p>
        </div>

        {isPreview() && (
          <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-4">
            <p className="font-medium text-amber-200">Vista previa</p>
            <p className="mt-1 text-sm text-amber-200/70">
              Los datos de ejemplo viven en memoria.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
            >
              Reiniciar datos de ejemplo
            </button>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="font-medium">RemindPay 0.1.0</p>
          <p className="mt-1 text-sm text-zinc-500">
            100% local · SQLite · USD · Sin nube ni cuentas
          </p>
        </div>
      </div>
    </div>
  );
}
