import { useCallback, useEffect, useRef, useState } from "react";
import Config from "./components/Config";
import Contactos from "./components/Contactos";
import Dashboard from "./components/Dashboard";
import Deudas from "./components/Deudas";
import DuePanel from "./components/DuePanel";
import Pagos from "./components/Pagos";
import PinGate from "./components/PinGate";
import Planificador from "./components/Planificador";
import Asistente from "./components/Asistente";
import Recordatorios from "./components/Recordatorios";
import Titlebar from "./components/Titlebar";
import { Icon, Logo } from "./components/ui";
import {
  createBackup,
  dueReminders,
  generarRecurrentes,
  getSetting,
  isPinSet,
  isPreview,
  listBackups,
  ping,
  updateReminder,
} from "./lib/api";
import {
  ahoraArchivo,
  ahoraLocal,
  sumarMinutos,
  todayLocal,
} from "./lib/format";
import { avisar } from "./lib/notify";
import { completarRecordatorio } from "./lib/recordatorios";
import { beep } from "./lib/sound";
import type { Reminder, Section } from "./lib/types";

const NAV_MAIN: { id: Section; label: string; icon: "dashboard" | "pagos" | "deudas" | "calendar" | "bell" | "sparkles"; atajo: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", atajo: "" },
  { id: "pagos", label: "Pagos", icon: "pagos", atajo: "N" },
  { id: "deudas", label: "Deudas", icon: "deudas", atajo: "D" },
  { id: "planificador", label: "Planificador", icon: "calendar", atajo: "L" },
  { id: "recordatorios", label: "Recordatorios", icon: "bell", atajo: "R" },
  { id: "asistente", label: "Asistente", icon: "sparkles", atajo: "A" },
];

const NAV_SYS: { id: Section; label: string; icon: "users" | "sliders" }[] = [
  { id: "contactos", label: "Contactos", icon: "users" },
  { id: "config", label: "Configuración", icon: "sliders" },
];

type Lock = "cargando" | "crear" | "pedir" | "ok";

function NavButton({
  active,
  icon,
  label,
  atajo,
  onClick,
}: {
  active: boolean;
  icon: "dashboard" | "pagos" | "deudas" | "calendar" | "bell" | "sparkles" | "users" | "sliders";
  label: string;
  atajo?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
        active
          ? "bg-emerald-500/15 font-semibold text-emerald-300"
          : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-emerald-400 transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
      <Icon name={icon} size={17} className="shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {atajo && (
        <kbd className="rounded-md border border-zinc-700/80 bg-zinc-800/80 px-1.5 py-0.5 font-sans text-[10px] text-zinc-500">
          {atajo}
        </kbd>
      )}
    </button>
  );
}

export default function App() {
  const [lock, setLock] = useState<Lock>("cargando");
  const [section, setSection] = useState<Section>("dashboard");
  const [signalNuevo, setSignalNuevo] = useState(0);
  const [signalDeuda, setSignalDeuda] = useState(0);
  const [signalRec, setSignalRec] = useState(0);
  const [bridge, setBridge] = useState<string | null>(null);
  const [bridgeMs, setBridgeMs] = useState<number | null>(null);
  const [dueItems, setDueItems] = useState<Reminder[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const notifiedRef = useRef<Set<number>>(new Set());
  const backupRef = useRef(false);

  // PIN: crear en primer uso, pedir en los siguientes.
  useEffect(() => {
    void (async () => {
      try {
        setLock((await isPinSet()) ? "pedir" : "crear");
      } catch {
        setLock("pedir");
      }
    })();
  }, []);

  // Tema guardado.
  useEffect(() => {
    void (async () => {
      try {
        const t = await getSetting("tema");
        document.documentElement.classList.toggle("light", t === "claro");
      } catch {
        /* tema por defecto */
      }
    })();
  }, []);

  // Revisa vencidos: notificación nativa + sonido + panel persistente.
  const revisar = useCallback(async (conSonido: boolean) => {
    try {
      const due = await dueReminders(ahoraLocal());
      const nuevos = due.filter((d) => !notifiedRef.current.has(d.id));
      if (nuevos.length > 0) {
        nuevos.forEach((d) => notifiedRef.current.add(d.id));
        if (conSonido && nuevos.some((d) => d.sonido)) beep(3);
        await avisar(
          "RemindPay",
          nuevos.length === 1
            ? nuevos[0].titulo
            : `${nuevos.length} recordatorios vencidos`,
        );
      }
      setDueItems(due.filter((d) => d.persistente));
    } catch {
      /* revisión silenciosa */
    }
  }, []);

  // Respaldo diario automático (una vez por sesión, tras desbloquear).
  useEffect(() => {
    if (lock !== "ok" || backupRef.current) return;
    backupRef.current = true;
    void (async () => {
      try {
        const hoy = `remindpay-${todayLocal()}`;
        const lista = await listBackups();
        if (!lista.some((b) => b.nombre.startsWith(hoy))) {
          await createBackup(ahoraArchivo());
        }
      } catch {
        /* respaldo silencioso */
      }
    })();
  }, [lock]);

  // Genera ocurrencias de pagos recurrentes (una vez por sesión).
  useEffect(() => {
    if (lock !== "ok") return;
    void (async () => {
      try {
        const n = await generarRecurrentes(todayLocal());
        if (n > 0) {
          setToast(
            `Se generaron ${n} pago(s) recurrentes automáticamente`,
          );
          setTimeout(() => setToast(null), 6000);
        }
      } catch {
        /* silencioso */
      }
    })();
  }, [lock]);

  useEffect(() => {
    if (lock !== "ok") return;
    void revisar(false);
    const t = setInterval(() => void revisar(true), 60000);
    const onFocus = () => void revisar(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [lock, revisar]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "n") nuevoPago();
      else if (k === "d") nuevaDeuda();
      else if (k === "l") setSection("planificador");
      else if (k === "a") setSection("asistente");
      else if (k === "r") nuevoRecordatorio();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock]);

  function nuevoPago() {
    setSection("pagos");
    setSignalNuevo((s) => s + 1);
  }

  function nuevaDeuda() {
    setSection("deudas");
    setSignalDeuda((s) => s + 1);
  }

  function nuevoRecordatorio() {
    setSection("recordatorios");
    setSignalRec((s) => s + 1);
  }

  async function hechoDue(id: number) {
    const r = dueItems.find((x) => x.id === id);
    if (!r) return;
    try {
      await completarRecordatorio(r);
      notifiedRef.current.delete(id);
      await revisar(false);
    } catch {
      /* el error se ve en el módulo */
    }
  }

  async function posponerDue(id: number) {
    const r = dueItems.find((x) => x.id === id);
    if (!r) return;
    try {
      await updateReminder(id, {
        titulo: r.titulo,
        detalle: r.detalle,
        fecha_hora: sumarMinutos(ahoraLocal(), 10),
        repetir: r.repetir,
        payment_id: r.payment_id,
        debt_id: r.debt_id,
        sonido: r.sonido,
        persistente: r.persistente,
      });
      await revisar(false);
    } catch {
      /* el error se ve en el módulo */
    }
  }

  function verDue(r: Reminder) {
    if (r.debt_id != null) setSection("deudas");
    else if (r.payment_id != null) setSection("pagos");
    else setSection("recordatorios");
  }

  async function testBridge() {
    const t0 = performance.now();
    try {
      const res = await ping("remindpay");
      setBridge(res);
      setBridgeMs(Math.round(performance.now() - t0));
    } catch (e) {
      setBridge(`Error: ${String(e)}`);
      setBridgeMs(null);
    }
  }

  if (lock === "cargando") {
    return <div className="h-full bg-zinc-950" />;
  }

  if (lock !== "ok") {
    return (
      <PinGate
        modo={lock === "crear" ? "crear" : "pedir"}
        onOk={() => setLock("ok")}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-50">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900/30">
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
          <Logo />
          <div>
            <p className="text-[17px] font-bold leading-tight tracking-tight">
              Remind<span className="text-emerald-400">Pay</span>
            </p>
            <p className="text-[11px] text-zinc-500">100% local · USD</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            Principal
          </p>
          {NAV_MAIN.map((item) => (
            <NavButton
              key={item.id}
              active={section === item.id}
              icon={item.icon}
              label={item.label}
              atajo={item.atajo}
              onClick={() => setSection(item.id)}
            />
          ))}
          <p className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            General
          </p>
          {NAV_SYS.map((item) => (
            <NavButton
              key={item.id}
              active={section === item.id}
              icon={item.icon}
              label={item.label}
              onClick={() => setSection(item.id)}
            />
          ))}
        </nav>

        <div className="space-y-2.5 border-t border-zinc-800/80 p-4">
          <button
            onClick={() => setLock("pedir")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
          >
            <Icon name="lock" size={14} />
            Bloquear
          </button>
          <button
            onClick={testBridge}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800/60"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className={`absolute h-full w-full rounded-full ${
                  bridge?.startsWith("Error")
                    ? "bg-red-400"
                    : "animate-pulse bg-emerald-400"
                }`}
              />
            </span>
            <span className="truncate font-mono">
              {bridge === null
                ? "Motor Rust · clic para probar"
                : bridgeMs !== null
                  ? `${bridge} · ${bridgeMs} ms`
                  : bridge}
            </span>
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl p-8">
          {isPreview() && (
            <div className="anim-rise mb-6 flex items-start gap-2.5 rounded-2xl border border-amber-800/70 bg-amber-950/50 px-4 py-3 text-sm text-amber-200">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <span>
                Vista previa web con datos de ejemplo (se borran al recargar).
                El backend real SQLite se activa al compilar la app de
                escritorio.
              </span>
            </div>
          )}
          {section === "dashboard" && <Dashboard onNuevoPago={nuevoPago} />}
          {section === "pagos" && <Pagos signalNuevo={signalNuevo} />}
          {section === "deudas" && <Deudas signalNueva={signalDeuda} />}
        {section === "planificador" && <Planificador />}
        {section === "asistente" && (
          <Asistente onIrConfig={() => setSection("config")} />
        )}
          {section === "recordatorios" && (
            <Recordatorios
              signalNuevo={signalRec}
              onChanged={() => void revisar(false)}
            />
          )}
          {section === "contactos" && <Contactos />}
          {section === "config" && <Config />}
        </div>
      </main>
      </div>

      {toast && (
        <div className="anim-rise fixed bottom-4 left-4 z-40 flex max-w-sm items-center gap-2.5 rounded-2xl border border-emerald-800 bg-zinc-900 px-4 py-3 text-sm shadow-2xl">
          <Icon name="check" size={16} className="shrink-0 text-emerald-300" />
          <span>{toast}</span>
        </div>
      )}

      <DuePanel
        items={dueItems}
        onHecho={(id) => void hechoDue(id)}
        onPosponer={(id) => void posponerDue(id)}
        onVer={verDue}
      />
    </div>
  );
}
