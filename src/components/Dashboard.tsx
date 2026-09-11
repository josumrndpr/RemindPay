import { useCallback, useEffect, useState } from "react";
import {
  debtsSummary,
  deleteBudget,
  listBudgets,
  listCategories,
  listPayments,
  listReminders,
  paymentsSummary,
  resumenMensual,
  setBudget,
} from "../lib/api";
import {
  ahoraLocal,
  fmtFecha,
  fmtUSD,
  monthLabel,
  monthLocal,
} from "../lib/format";
import type {
  BudgetView,
  Category,
  DebtsSummary,
  MonthPoint,
  MonthSummary,
  Payment,
} from "../lib/types";
import Modal from "./Modal";
import {
  ErrorBox,
  Icon,
  Stat,
  btnPrimary,
  btnSecondary,
  cardCls,
  inputCls,
} from "./ui";

const MES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function ultimos6(mes: string): string[] {
  const [y, m] = mes.split("-").map(Number);
  const out: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return out;
}

function Barras({ puntos }: { puntos: MonthPoint[] }) {
  const max = Math.max(
    1,
    ...puntos.flatMap((p) => [p.ingresos_cents, p.gastos_cents]),
  );
  const W = 600;
  const H = 228;
  const padB = 30;
  const padT = 14;
  const n = Math.max(puntos.length, 1);
  const gw = W / n;
  const bw = Math.min(30, gw / 4.5);
  const h = (v: number) => Math.max(3, ((H - padB - padT) * v) / max);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + (H - padB - padT) * (1 - f);
          return (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-zinc-800"
              strokeWidth={1}
            />
          );
        })}
        {puntos.map((p, i) => {
          const cx = gw * i + gw / 2;
          const hi = h(p.ingresos_cents);
          const hg = h(p.gastos_cents);
          const base = H - padB;
          const mes = MES_CORTO[Number(p.mes.slice(5, 7)) - 1] ?? "";
          return (
            <g key={p.mes}>
              <rect
                x={cx - bw - 3}
                y={base - hi}
                width={bw}
                height={hi}
                rx={4}
                fill="#10b981"
              >
                <title>{`Ingresos ${mes}: ${fmtUSD(p.ingresos_cents)}`}</title>
              </rect>
              <rect
                x={cx + 3}
                y={base - hg}
                width={bw}
                height={hg}
                rx={4}
                fill="#52525b"
              >
                <title>{`Gastos ${mes}: ${fmtUSD(p.gastos_cents)}`}</title>
              </rect>
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                fontSize={12}
                fill="currentColor"
                className="fill-zinc-500"
              >
                {mes}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Ingresos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-zinc-600" />
          Gastos
        </span>
      </div>
    </div>
  );
}

function BudgetsModal({
  mes,
  onClose,
  onSaved,
}: {
  mes: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<BudgetView[]>([]);
  const [montos, setMontos] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([
        listCategories(),
        listBudgets(mes),
      ]);
      setCats(c.filter((x) => x.tipo !== "ingreso"));
      setBudgets(b);
      const m: Record<number, string> = {};
      for (const x of b) m[x.categoria_id] = (x.monto_cents / 100).toString();
      setMontos(m);
    } catch (e) {
      setError(String(e));
    }
  }, [mes]);

  useEffect(() => {
    void load();
  }, [load]);

  async function guardar(catId: number) {
    const v = Number.parseFloat((montos[catId] ?? "").replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      setError("Monto inválido");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setBudget(catId, v);
      await load();
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function quitar(id: number) {
    try {
      await deleteBudget(id);
      await load();
      onSaved();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Modal title="Presupuestos mensuales" onClose={onClose}>
      <p className="text-sm text-zinc-500">
        Topes de gasto por categoría. Se miden contra los gastos del mes.
      </p>
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {cats.map((c) => {
          const b = budgets.find((x) => x.categoria_id === c.id);
          return (
            <div
              key={c.id}
              className="flex items-center gap-2.5 rounded-xl border border-zinc-800/60 p-2.5"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{c.nombre}</span>
              <input
                value={montos[c.id] ?? ""}
                onChange={(e) =>
                  setMontos((m) => ({ ...m, [c.id]: e.target.value }))
                }
                placeholder="USD"
                inputMode="decimal"
                aria-label={`Tope ${c.nombre}`}
                className={`${inputCls} tnum !w-24 !py-1.5`}
              />
              <button
                onClick={() => void guardar(c.id)}
                disabled={saving}
                className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                OK
              </button>
              {b && (
                <button
                  onClick={() => void quitar(b.id)}
                  aria-label={`Quitar ${c.nombre}`}
                  className="rounded-lg px-1.5 py-1.5 text-zinc-500 hover:text-red-300"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
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
  const [proximos, setProximos] = useState({ total: 0, vencidos: 0 });
  const [recent, setRecent] = useState<Payment[]>([]);
  const [chart, setChart] = useState<MonthPoint[]>([]);
  const [budgets, setBudgets] = useState<BudgetView[]>([]);
  const [showBudgets, setShowBudgets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const meses = ultimos6(mes);
      const [s, d, r, rems, ch, b] = await Promise.all([
        paymentsSummary(mes),
        debtsSummary(),
        listPayments({ limite: 8 }),
        listReminders({ solo_pendientes: true, limite: 500 }),
        resumenMensual(meses),
        listBudgets(mes),
      ]);
      setSummary(s);
      setDebts(d);
      setRecent(r);
      setChart(ch);
      setBudgets(b);
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

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className={`${cardCls} p-5 xl:col-span-3`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Últimos 6 meses
            </h3>
          </div>
          <div className="mt-3">
            <Barras puntos={chart} />
          </div>
        </div>
        <div className={`${cardCls} p-5 xl:col-span-2`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Presupuestos
            </h3>
            <button
              onClick={() => setShowBudgets(true)}
              className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
            >
              Gestionar
            </button>
          </div>
          {budgets.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-zinc-500">
                Sin topes. Define cuánto puedes gastar por categoría.
              </p>
              <button
                onClick={() => setShowBudgets(true)}
                className={`${btnSecondary} mt-3 !text-xs`}
              >
                Crear presupuesto
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3.5">
              {budgets.slice(0, 5).map((b) => (
                <div key={b.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                      <span className="truncate">{b.categoria}</span>
                    </span>
                    <span className="tnum ml-2 shrink-0 text-xs text-zinc-500">
                      {fmtUSD(b.gastado_cents)} / {fmtUSD(b.monto_cents)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${
                        b.pct >= 100
                          ? "bg-red-500"
                          : b.pct >= 85
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(b.pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {budgets.length > 5 && (
                <p className="text-xs text-zinc-500">
                  +{budgets.length - 5} más en Gestionar
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <h3 className="mt-8 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Movimientos recientes
      </h3>
      <div className="mt-3 divide-y divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
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

      {showBudgets && (
        <BudgetsModal
          mes={mes}
          onClose={() => setShowBudgets(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
