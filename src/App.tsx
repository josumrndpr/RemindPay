import { useCallback, useEffect, useRef, useState } from "react";
import Config from "./components/Config";
import Contactos from "./components/Contactos";
import Dashboard from "./components/Dashboard";
import Deudas from "./components/Deudas";
import DuePanel from "./components/DuePanel";
import Pagos from "./components/Pagos";
import Recordatorios from "./components/Recordatorios";
import {
  dueReminders,
  isPreview,
  ping,
  updateReminder,
} from "./lib/api";
import { ahoraLocal, sumarMinutos } from "./lib/format";
import { avisar } from "./lib/notify";
import { completarRecordatorio } from "./lib/recordatorios";
import { beep } from "./lib/sound";
import type { Reminder, Section } from "./lib/types";

const NAV: { id: Section; label: string; fase?: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "pagos", label: "Pagos" },
  { id: "deudas", label: "Deudas" },
  { id: "recordatorios", label: "Recordatorios" },
  { id: "contactos", label: "Contactos" },
  { id: "config", label: "Configuración" },
];

export default function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [signalNuevo, setSignalNuevo] = useState(0);
  const [signalDeuda, setSignalDeuda] = useState(0);
  const [signalRec, setSignalRec] = useState(0);
  const [bridge, setBridge] = useState<string | null>(null);
  const [bridgeMs, setBridgeMs] = useState<number | null>(null);
  const [dueItems, setDueItems] = useState<Reminder[]>([]);
  const notifiedRef = useRef<Set<number>>(new Set());

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

  useEffect(() => {
    void revisar(false);
    const t = setInterval(() => void revisar(true), 60000);
    const onFocus = () => void revisar(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [revisar]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "n") nuevoPago();
      else if (k === "d") nuevaDeuda();
      else if (k === "r") nuevoRecordatorio();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-50">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/40">
        <div className="px-5 pb-4 pt-6">
          <h1 className="text-xl font-bold tracking-tight">
            Remind<span className="text-emerald-400">Pay</span>
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">100% local · USD</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                section === item.id
                  ? "bg-emerald-500/15 font-medium text-emerald-300"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
              }`}
            >
              {item.label}
              {item.fase && (
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                  {item.fase}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="border-t border-zinc-800 p-4 text-xs text-zinc-500">
          <p className="font-medium text-zinc-400">Puente Rust</p>
          {bridge === null ? (
            <button
              onClick={testBridge}
              className="mt-2 w-full rounded-lg bg-zinc-800 px-3 py-1.5 text-zinc-200 hover:bg-zinc-700"
            >
              Probar conexión
            </button>
          ) : (
            <button onClick={testBridge} className="mt-2 w-full text-left">
              <span className="block truncate font-mono text-emerald-400">
                {bridge}
              </span>
              {bridgeMs !== null && (
                <span className="text-zinc-500">{bridgeMs} ms</span>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 overflow-y-auto p-8">
        {isPreview() && (
          <div className="mb-6 rounded-lg border border-amber-800 bg-amber-950/60 px-4 py-2.5 text-sm text-amber-200">
            Vista previa web con datos de ejemplo (se borran al recargar). El
            backend real SQLite se activa al compilar la app de escritorio.
          </div>
        )}
        {section === "dashboard" && <Dashboard onNuevoPago={nuevoPago} />}
        {section === "pagos" && <Pagos signalNuevo={signalNuevo} />}
        {section === "deudas" && <Deudas signalNueva={signalDeuda} />}
        {section === "recordatorios" && (
          <Recordatorios
            signalNuevo={signalRec}
            onChanged={() => void revisar(false)}
          />
        )}
        {section === "contactos" && <Contactos />}
        {section === "config" && <Config />}
      </main>

      <DuePanel
        items={dueItems}
        onHecho={(id) => void hechoDue(id)}
        onPosponer={(id) => void posponerDue(id)}
        onVer={verDue}
      />
    </div>
  );
}
