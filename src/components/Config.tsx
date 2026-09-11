import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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
import { testConnection } from "../lib/ai";
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
import {
  ErrorBox,
  Field,
  Icon,
  OkBox,
  btnSecondary,
  cardCls,
  inputCls,
} from "./ui";

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: "sliders" | "lock" | "sparkles" | "database" | "download" | "bell" | "sun";
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className={`${cardCls} p-5`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-800 text-zinc-300">
          <Icon name={icon} size={17} />
        </span>
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-emerald-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

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

  const [aiEndpoint, setAiEndpoint] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [a, d, t, b, e, k, m] = await Promise.all([
          isAutostart(),
          getDataDir(),
          getSetting("tema"),
          listBackups(),
          getSetting("ai_endpoint"),
          getSetting("ai_key"),
          getSetting("ai_model"),
        ]);
        setAuto(a);
        setDir(d);
        if (t === "claro" || t === "oscuro") setTema(t);
        setBackups(b);
        setAiEndpoint(e ?? "");
        setAiKey(k ?? "");
        setAiModel(m ?? "");
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

  async function guardarAi() {
    setBusy(true);
    try {
      await Promise.all([
        setSetting("ai_endpoint", aiEndpoint.trim().replace(/\/+$/, "")),
        setSetting("ai_key", aiKey.trim()),
        setSetting("ai_model", aiModel.trim()),
      ]);
      flash("Asistente configurado");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function probarAi() {
    setBusy(true);
    setAiMsg(null);
    try {
      const r = await testConnection({
        endpoint: aiEndpoint.trim().replace(/\/+$/, ""),
        key: aiKey.trim(),
        model: aiModel.trim(),
      });
      setAiMsg(r);
    } catch (e) {
      setAiMsg(String(e));
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

  const dig = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  return (
    <div className="max-w-2xl">
      <h2 className="text-[26px] font-bold tracking-tight">Configuración</h2>
      <p className="mt-0.5 text-sm text-zinc-500">Comportamiento de la app</p>

      {msg && (
        <div className="mt-4">
          <ErrorBox>{msg}</ErrorBox>
        </div>
      )}
      {ok && (
        <div className="mt-4">
          <OkBox>{ok}</OkBox>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Section
          icon="sliders"
          title="Arranque y apariencia"
          hint="Cómo se comporta al iniciar y cómo se ve"
        >
          <div className="flex items-center justify-between gap-3 py-1">
            <p className="text-sm">
              Iniciar con Windows
              <span className="block text-xs text-zinc-500">
                Revisa tus avisos automáticamente
                {isPreview() ? " (solo en la app instalada)" : ""}
              </span>
            </p>
            <Toggle
              on={auto}
              onClick={() => void toggleAuto()}
              label="Iniciar con Windows"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["oscuro", "claro"] as const).map((t) => (
              <button
                key={t}
                onClick={() => void cambiarTema(t)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium capitalize transition-all ${
                  tema === t
                    ? "bg-emerald-500 font-semibold text-zinc-950"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                <Icon name={t === "oscuro" ? "moon" : "sun"} size={15} />
                {t}
              </button>
            ))}
          </div>
        </Section>

        <Section
          icon="lock"
          title="Cambiar PIN"
          hint="Protege la entrada a la app"
        >
          <div className="space-y-2.5">
            <Field label="PIN actual">
              <input
                type="password"
                value={pinActual}
                onChange={(e) => setPinActual(dig(e.target.value))}
                placeholder="••••"
                inputMode="numeric"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="PIN nuevo">
                <input
                  type="password"
                  value={pinNuevo}
                  onChange={(e) => setPinNuevo(dig(e.target.value))}
                  placeholder="••••"
                  inputMode="numeric"
                  className={inputCls}
                />
              </Field>
              <Field label="Confirmar">
                <input
                  type="password"
                  value={pinConf}
                  onChange={(e) => setPinConf(dig(e.target.value))}
                  placeholder="••••"
                  inputMode="numeric"
                  className={inputCls}
                />
              </Field>
            </div>
            <button
              onClick={() => void cambiarPin()}
              disabled={busy}
              className={`${btnSecondary} w-full`}
            >
              Actualizar PIN
            </button>
          </div>
        </Section>

        <Section
          icon="sparkles"
          title="OpenCode Go / Zen"
          hint="Tu clave de opencode.ai/auth. Opcional."
        >
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setAiEndpoint("https://opencode.ai/zen/go/v1");
                  setAiMsg(null);
                }}
                className={btnSecondary}
              >
                Usar Go
              </button>
              <button
                onClick={() => {
                  setAiEndpoint("https://opencode.ai/zen/v1");
                  setAiMsg(null);
                }}
                className={btnSecondary}
              >
                Usar Zen
              </button>
            </div>
            <Field label="Endpoint (base URL)">
              <input
                value={aiEndpoint}
                onChange={(e) => setAiEndpoint(e.target.value)}
                placeholder="https://opencode.ai/zen/go/v1"
                inputMode="url"
                className={`${inputCls} font-mono !text-xs`}
              />
            </Field>
            <Field label="API key">
              <input
                type="password"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder="Tu clave de opencode.ai/auth (solo vive en tu PC)"
                className={`${inputCls} font-mono !text-xs`}
              />
            </Field>
            <Field label="Modelo">
              <input
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="Go: mimo-v2.5 · Zen: mimo-v2.5-free"
                className={inputCls}
              />
            </Field>
            {aiMsg && (
              <p className="text-xs text-zinc-400">{aiMsg}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void guardarAi()}
                disabled={busy}
                className={btnSecondary}
              >
                Guardar
              </button>
              <button
                onClick={() => void probarAi()}
                disabled={busy}
                className={btnSecondary}
              >
                Probar conexión
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Aura habla directo con tu endpoint por HTTPS. Sin configurar,
              la app sigue 100% local.
            </p>
          </div>
        </Section>

        <Section
          icon="database"
          title="Respaldos"
          hint="Copia diaria automática · se conservan las últimas 30"
        >
          <button
            onClick={() => void respaldoAhora()}
            disabled={busy}
            className={btnSecondary}
          >
            <Icon name="plus" size={15} />
            Crear copia ahora
          </button>
          {backups.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Aún no hay copias.</p>
          ) : (
            <div className="mt-3 divide-y divide-zinc-800/60 overflow-hidden rounded-xl border border-zinc-800/60">
              {backups.slice(0, 8).map((b) => (
                <div
                  key={b.nombre}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="truncate font-mono text-xs text-zinc-300">
                    {b.nombre}
                  </span>
                  <span className="tnum shrink-0 text-xs text-zinc-500">
                    {fmtBytes(b.bytes)} · {fmtBackupFecha(b.creado_secs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          icon="download"
          title="Exportar CSV"
          hint="Compatible con Excel (punto y coma)"
        >
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["pagos", "Pagos"],
                ["deudas", "Deudas"],
                ["recordatorios", "Avisos"],
              ] as const
            ).map(([cual, label]) => (
              <button
                key={cual}
                onClick={() => void exportar(cual)}
                disabled={busy}
                className={btnSecondary}
              >
                <Icon name="download" size={15} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 break-all font-mono text-xs text-zinc-500">
            {dir}
          </p>
        </Section>

        {isPreview() && (
          <Section
            icon="bell"
            title="Vista previa"
            hint="Datos de ejemplo en memoria"
          >
            <button
              onClick={() => window.location.reload()}
              className={btnSecondary}
            >
              Reiniciar datos de ejemplo
            </button>
          </Section>
        )}

        <div className="flex items-center gap-3 px-1 py-2 text-xs text-zinc-600">
          <span>RemindPay 0.5.5 · 100% local · SQLite · USD</span>
        </div>
      </div>
    </div>
  );
}
