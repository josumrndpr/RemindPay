import { useEffect, useState } from "react";
import Contactos from "./components/Contactos";
import Dashboard from "./components/Dashboard";
import Deudas from "./components/Deudas";
import Pagos from "./components/Pagos";
import { isPreview, ping } from "./lib/api";
import type { Section } from "./lib/types";

const NAV: { id: Section; label: string; fase?: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "pagos", label: "Pagos" },
  { id: "deudas", label: "Deudas" },
  { id: "contactos", label: "Contactos" },
  { id: "recordatorios", label: "Recordatorios", fase: "Fase 3" },
  { id: "config", label: "Configuración", fase: "Fase 4" },
];

export default function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [signalNuevo, setSignalNuevo] = useState(0);
  const [signalDeuda, setSignalDeuda] = useState(0);
  const [bridge, setBridge] = useState<string | null>(null);
  const [bridgeMs, setBridgeMs] = useState<number | null>(null);

  function nuevoPago() {
    setSection("pagos");
    setSignalNuevo((s) => s + 1);
  }

  function nuevaDeuda() {
    setSection("deudas");
    setSignalDeuda((s) => s + 1);
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "n") nuevoPago();
      else if (k === "d") nuevaDeuda();
      else if (k === "r") setSection("recordatorios");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {section === "contactos" && <Contactos />}
        {(section === "recordatorios" || section === "config") && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="text-2xl font-semibold capitalize tracking-tight">
              {NAV.find((n) => n.id === section)?.label}
            </h2>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
              Este módulo se construye en{" "}
              {NAV.find((n) => n.id === section)?.fase}. La base (tipos y
              esquema SQLite) ya está lista en PLAN.md y schema.sql.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
