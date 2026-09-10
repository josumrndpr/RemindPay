import { useState } from "react";
import { ping } from "./lib/api";
import { fmtUSD } from "./lib/format";
import type { Section } from "./lib/types";

const NAV: { id: Section; label: string; fase: string }[] = [
  { id: "dashboard", label: "Dashboard", fase: "Fase 1" },
  { id: "pagos", label: "Pagos", fase: "Fase 1" },
  { id: "deudas", label: "Deudas", fase: "Fase 2" },
  { id: "recordatorios", label: "Recordatorios", fase: "Fase 3" },
  { id: "contactos", label: "Contactos", fase: "Fase 2" },
  { id: "config", label: "Configuración", fase: "Fase 4" },
];

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

export default function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [bridge, setBridge] = useState<string | null>(null);
  const [bridgeMs, setBridgeMs] = useState<number | null>(null);

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
              {item.id !== "dashboard" && (
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
        {section === "dashboard" && (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Resumen del mes · datos reales en Fase 1
            </p>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Balance del mes"
                value={fmtUSD(0)}
                hint="ingresos − gastos"
              />
              <StatCard title="Por cobrar" value={fmtUSD(0)} hint="me deben" />
              <StatCard title="Por pagar" value={fmtUSD(0)} hint="yo debo" />
              <StatCard
                title="Vencen en 7 días"
                value="0"
                hint="pagos + deudas + recordatorios"
              />
            </div>
          </div>
        )}
        {section !== "dashboard" && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="text-2xl font-semibold capitalize tracking-tight">
              {NAV.find((n) => n.id === section)?.label}
            </h2>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
              Este módulo se construye en{" "}
              {NAV.find((n) => n.id === section)?.fase}. La base (tipos,
              esquema SQLite y comandos Rust) ya está planificada en PLAN.md.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
