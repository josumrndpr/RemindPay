import { useCallback, useEffect, useState } from "react";
import {
  debtsSummary,
  listPayments,
  listReminders,
  paymentsSummary,
} from "../lib/api";
import {
  ahoraLocal,
  fmtFecha,
  fmtUSD,
  monthLabel,
  monthLocal,
} from "../lib/format";
import type { DebtsSummary, MonthSummary, Payment } from "../lib/types";
import { Icon, Stat, btnPrimary } from "./ui";

export default function Dashboard({
  onNuevoPago,
}: {
  onNuevoPago: () => void;
}) {
  const [mes, setMes] = useState(monthLocal());
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [debts, setDebts] = useState<DebtsSummary | null>(null);
  const [proximos, setProximos] = useState({ total: 0, vencidos: 0 });
  const [recent, setRecent] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, d, r, rems] = await Promise.all([
        paymentsSummary(mes),
        debtsSummary(),
        listPayments({ limite: 8 }),
        listReminders({ solo_pendientes: true, limite: 500 }),
      ]);
      setSummary(s);
      setDebts(d);
      setRecent(r);
      const ahora = ahoraLocal();
      const max = new Date();
      max.setDate(max.getDate() + 7);
      const pad = (n: number) => String(n).padStart(2, "0");
      const tope = `${max.getFullYear()}-${pad(max.getMonth() + 1)}-${pad(max.getDate())}T23:59`;
      const prox = rems.filter((x) => x.fecha_hora <= tope);
      setProximos({
        total: prox.length,
        vencidos: prox.filter((x) => x.fecha_hora <= ahora).length,
      });
    } catch (e) {
      setError(String(e));
    }
  }, [mes]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight">Dashboard</h2>
          <p className="mt-0.5 text-sm capitalize text-zinc-500">
            {monthLabel(mes)}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Icon
              name="calendar"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Mes"
              className="rounded-xl border border-zinc-700/80 bg-zinc-800 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-emerald-500/70"
            />
          </div>
          <button onClick={onNuevoPago} className={btnPrimary}>
            <Icon name="plus" size={15} />
            Nuevo pago
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-900 bg-red-950/50 px-3 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          icon="trendingUp"
          tone="green"
          title="Balance del mes"
          value={fmtUSD(summary?.balance_cents ?? 0)}
          hint={`${summary?.count ?? 0} movimientos`}
          accent
        />
        <Stat
          icon="download"
          tone="green"
          title="Ingresos"
          value={fmtUSD(summary?.ingresos_cents ?? 0)}
          hint="entradas del mes"
        />
        <Stat
          icon="wallet"
          tone="zinc"
          title="Gastos"
          value={fmtUSD(summary?.gastos_cents ?? 0)}
          hint="salidas del mes"
        />
        <Stat
          icon="bell"
          tone={proximos.vencidos > 0 ? "red" : "amber"}
          title="Próximos 7 días"
          value={String(proximos.total)}
          hint={
            proximos.vencidos > 0
              ? `${proximos.vencidos} vencidos`
              : "recordatorios pendientes"
          }
        />
        <Stat
          icon="users"
          tone="green"
          title="Por cobrar"
          value={fmtUSD(debts?.por_cobrar_cents ?? 0)}
          hint="te deben"
        />
        <Stat
          icon="deudas"
          tone="amber"
          title="Por pagar"
          value={fmtUSD(debts?.por_pagar_cents ?? 0)}
          hint={`yo debo · ${debts?.activas ?? 0} deudas vivas`}
        />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Movimientos recientes
        </h3>
      </div>
      <div className="mt-3 divide-y divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            Aún no hay movimientos.
          </p>
        ) : (
          recent.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-zinc-900/70"
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  p.tipo === "ingreso"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                <Icon
                  name={p.tipo === "ingreso" ? "download" : "pagos"}
                  size={16}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
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
                className={`tnum whitespace-nowrap font-semibold ${
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
