import { useCallback, useEffect, useState } from "react";
import { debtsSummary, listPayments, paymentsSummary } from "../lib/api";
import { fmtFecha, fmtUSD, monthLabel, monthLocal } from "../lib/format";
import type { DebtsSummary, MonthSummary, Payment } from "../lib/types";

function StatCard({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p
        className={`mt-1 text-3xl font-semibold tracking-tight ${
          accent ? "text-emerald-300" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

export default function Dashboard({
  onNuevoPago,
}: {
  onNuevoPago: () => void;
}) {
  const [mes, setMes] = useState(monthLocal());
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [debts, setDebts] = useState<DebtsSummary | null>(null);
  const [recent, setRecent] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, d, r] = await Promise.all([
        paymentsSummary(mes),
        debtsSummary(),
        listPayments({ limite: 8 }),
      ]);
      setSummary(s);
      setDebts(d);
      setRecent(r);
    } catch (e) {
      setError(String(e));
    }
  }, [mes]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="mt-1 text-sm capitalize text-zinc-500">
            {monthLabel(mes)}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="w-auto rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={onNuevoPago}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            + Nuevo pago
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="Balance del mes"
          value={fmtUSD(summary?.balance_cents ?? 0)}
          hint={`${summary?.count ?? 0} movimientos`}
          accent
        />
        <StatCard
          title="Ingresos"
          value={fmtUSD(summary?.ingresos_cents ?? 0)}
          hint="entradas del mes"
        />
        <StatCard
          title="Gastos"
          value={fmtUSD(summary?.gastos_cents ?? 0)}
          hint="salidas del mes"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard
          title="Por cobrar"
          value={fmtUSD(debts?.por_cobrar_cents ?? 0)}
          hint="te deben"
        />
        <StatCard
          title="Por pagar"
          value={fmtUSD(debts?.por_pagar_cents ?? 0)}
          hint={`yo debo · ${debts?.activas ?? 0} deudas vivas`}
        />
      </div>

      <h3 className="mt-8 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Movimientos recientes
      </h3>
      <div className="mt-3 divide-y divide-zinc-800/60 rounded-xl border border-zinc-800">
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            Aún no hay movimientos.
          </p>
        ) : (
          recent.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">
                  {p.descripcion || (
                    <span className="text-zinc-600">Sin descripción</span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {fmtFecha(p.fecha)}
                  {p.categoria ? ` · ${p.categoria}` : ""}
                </p>
              </div>
              <p
                className={`ml-4 whitespace-nowrap font-medium ${
                  p.tipo === "ingreso" ? "text-emerald-300" : "text-zinc-100"
                }`}
              >
                {p.tipo === "ingreso" ? "+" : "−"}
                {fmtUSD(p.monto_cents)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
