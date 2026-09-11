import { useCallback, useEffect, useMemo, useState } from "react";
import { listPayments, marcarPago } from "../lib/api";
import { fmtFecha, fmtUSD, todayLocal } from "../lib/format";
import type { Payment } from "../lib/types";
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  Icon,
  OkBox,
  Stat,
  btnPrimary,
  btnSecondary,
  cardCls,
  inputCls,
  tableWrapCls,
  thCls,
} from "./ui";

interface Extra {
  id: number;
  fecha: string;
  monto: string;
  nota: string;
}

interface Fila {
  key: string;
  fecha: string;
  concepto: string;
  monto_cents: number;
  ingreso: boolean;
  pagoId?: number;
  seleccionable: boolean;
  balance: number;
  cubierto: boolean;
}

function masDias(base: string, n: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export default function Planificador() {
  const [fondo, setFondo] = useState("0");
  const [desde, setDesde] = useState(todayLocal());
  const [hasta, setHasta] = useState(masDias(todayLocal(), 30));
  const [pendientes, setPendientes] = useState<Payment[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [excluidos, setExcluidos] = useState<number[]>([]);
  const [exFecha, setExFecha] = useState(todayLocal());
  const [exMonto, setExMonto] = useState("");
  const [exNota, setExNota] = useState("");
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPendientes(await listPayments({ estado: "pendiente", limite: 2000 }));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const gastos = useMemo(
    () =>
      pendientes
        .filter(
          (p) => p.tipo === "gasto" && p.fecha >= desde && p.fecha <= hasta,
        )
        .sort((a, b) =>
          a.fecha === b.fecha ? a.id - b.id : a.fecha.localeCompare(b.fecha),
        ),
    [pendientes, desde, hasta],
  );

  const ingresosBase = useMemo(
    () =>
      pendientes
        .filter(
          (p) => p.tipo === "ingreso" && p.fecha >= desde && p.fecha <= hasta,
        )
        .sort((a, b) =>
          a.fecha === b.fecha ? a.id - b.id : a.fecha.localeCompare(b.fecha),
        ),
    [pendientes, desde, hasta],
  );

  const fondoCents = Math.max(
    0,
    Math.round((Number.parseFloat(fondo.replace(",", ".")) || 0) * 100),
  );

  const filas: Fila[] = useMemo(() => {
    const evs: {
      fecha: string;
      concepto: string;
      monto_cents: number;
      ingreso: boolean;
      pagoId?: number;
      seleccionable: boolean;
    }[] = [];
    for (const g of gastos) {
      if (excluidos.includes(g.id)) continue;
      evs.push({
        fecha: g.fecha,
        concepto: g.descripcion || "Gasto sin descripción",
        monto_cents: g.monto_cents,
        ingreso: false,
        pagoId: g.id,
        seleccionable: true,
      });
    }
    for (const i of ingresosBase) {
      evs.push({
        fecha: i.fecha,
        concepto: i.descripcion || "Ingreso",
        monto_cents: i.monto_cents,
        ingreso: true,
        pagoId: i.id,
        seleccionable: false,
      });
    }
    for (const x of extras) {
      const m = Math.round((Number.parseFloat(x.monto.replace(",", ".")) || 0) * 100);
      if (m <= 0 || x.fecha < desde || x.fecha > hasta) continue;
      evs.push({
        fecha: x.fecha,
        concepto: x.nota.trim() || "Ingreso extra",
        monto_cents: m,
        ingreso: true,
        seleccionable: false,
      });
    }
    evs.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      if (a.ingreso !== b.ingreso) return a.ingreso ? -1 : 1;
      return 0;
    });
    let bal = fondoCents;
    return evs.map((e, i) => {
      let cubierto = true;
      if (e.ingreso) {
        bal += e.monto_cents;
      } else if (bal >= e.monto_cents) {
        bal -= e.monto_cents;
      } else {
        cubierto = false;
      }
      return { ...e, key: `${e.fecha}-${i}`, balance: bal, cubierto };
    });
  }, [gastos, ingresosBase, extras, excluidos, fondoCents, desde, hasta]);

  const totalIng = filas
    .filter((f) => f.ingreso)
    .reduce((a, f) => a + f.monto_cents, 0);
  const totalSel = filas
    .filter((f) => !f.ingreso)
    .reduce((a, f) => a + f.monto_cents, 0);
  const sobrante = fondoCents + totalIng - totalSel;
  const noCubiertos = filas.filter((f) => !f.ingreso && !f.cubierto);
  const selCount = filas.filter((f) => !f.ingreso).length;

  function toggle(id: number) {
    setExcluidos((xs) =>
      xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id],
    );
  }

  function agregarExtra() {
    const m = Number.parseFloat(exMonto.replace(",", "."));
    if (!Number.isFinite(m) || m <= 0 || exFecha.length !== 10) return;
    setExtras((xs) => [
      ...xs,
      { id: seq, fecha: exFecha, monto: exMonto, nota: exNota.trim() },
    ]);
    setSeq((s) => s + 1);
    setExMonto("");
    setExNota("");
  }

  async function ejecutar() {
    const ids = filas
      .filter((f) => !f.ingreso && f.pagoId != null)
      .map((f) => f.pagoId as number);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Marcar ${ids.length} pago(s) como pagados? Esta acción los descuenta del balance.`,
      )
    )
      return;
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      for (const id of ids) await marcarPago(id, "pagado");
      setOk(`${ids.length} pago(s) marcados como pagados`);
      setExcluidos([]);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight">Planificador</h2>
          <p className="mt-0.5 max-w-xl text-sm text-zinc-500">
            Con tu fondo + quincenas, simula qué cuentas pagar primero por
            fecha y cuánto te sobra. Tip: registra tu quincena como ingreso con
            fecha futura en Pagos y aparece aquí sola.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      {ok && (
        <div className="mt-4">
          <OkBox>{ok}</OkBox>
        </div>
      )}

      <div className={`${cardCls} mt-5 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3`}>
        <Field label="Fondo inicial (USD)">
          <input
            value={fondo}
            onChange={(e) => setFondo(e.target.value)}
            inputMode="decimal"
            className={`${inputCls} tnum`}
          />
        </Field>
        <Field label="Desde">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Hasta">
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <div className={`${cardCls} mt-4 p-4`}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Ingresos del periodo
        </h3>
        {ingresosBase.length === 0 && extras.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Sin quincenas en el rango. Agrega una abajo o regístrala en Pagos
            como ingreso pendiente.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ingresosBase.map((i) => (
              <Badge key={i.id} tone="green">
                {i.descripcion || "Ingreso"} · {fmtUSD(i.monto_cents)} ·{" "}
                {fmtFecha(i.fecha)}
              </Badge>
            ))}
            {extras.map((x) => (
              <span
                key={x.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300"
              >
                {x.nota || "Extra"} · {x.monto} · {x.fecha}
                <button
                  onClick={() =>
                    setExtras((xs) => xs.filter((e) => e.id !== x.id))
                  }
                  aria-label="Quitar extra"
                  className="text-zinc-500 hover:text-red-300"
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            type="date"
            value={exFecha}
            onChange={(e) => setExFecha(e.target.value)}
            aria-label="Fecha extra"
            className={inputCls}
          />
          <input
            value={exMonto}
            onChange={(e) => setExMonto(e.target.value)}
            placeholder="Monto USD"
            inputMode="decimal"
            aria-label="Monto extra"
            className={`${inputCls} tnum`}
          />
          <input
            value={exNota}
            onChange={(e) => setExNota(e.target.value)}
            placeholder="Nota (ej. Bono)"
            aria-label="Nota extra"
            className={inputCls}
          />
          <button onClick={agregarExtra} className={btnSecondary}>
            <Icon name="plus" size={15} />
            Agregar
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          icon="download"
          tone="green"
          title="Ingresos periodo"
          value={fmtUSD(fondoCents + totalIng)}
          hint="fondo + quincenas + extras"
        />
        <Stat
          icon="pagos"
          tone="zinc"
          title="Cuentas elegidas"
          value={fmtUSD(totalSel)}
          hint={`${selCount} pago(s) incluidos`}
        />
        <Stat
          icon="trendingUp"
          tone={sobrante >= 0 ? "green" : "red"}
          title="Sobrante"
          value={fmtUSD(sobrante)}
          hint={
            noCubiertos.length > 0
              ? `${noCubiertos.length} cuenta(s) no alcanzan`
              : "todo cubierto por fecha"
          }
          accent={sobrante >= 0}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setExcluidos([])}
          className={`${btnSecondary} !px-3 !py-1.5 !text-xs`}
        >
          Todas
        </button>
        <button
          onClick={() =>
            setExcluidos(gastos.map((g) => g.id))
          }
          className={`${btnSecondary} !px-3 !py-1.5 !text-xs`}
        >
          Ninguna
        </button>
        <span className="flex-1" />
        <button
          onClick={() => void ejecutar()}
          disabled={busy || selCount === 0}
          className={btnPrimary}
        >
          <Icon name="check" size={15} />
          Marcar elegidos como pagados
        </button>
      </div>

      <div className={`${tableWrapCls} mt-3`}>
        <table className="w-full min-w-[680px] text-sm">
          <thead className="sticky top-0 bg-zinc-900">
            <tr className="border-b border-zinc-800">
              <th className={`${thCls} w-10`}>
                <span className="sr-only">Incluir</span>
              </th>
              <th className={thCls}>Fecha</th>
              <th className={thCls}>Concepto</th>
              <th className={`${thCls} text-right`}>Monto</th>
              <th className={`${thCls} text-right`}>Balance</th>
              <th className={`${thCls} text-right`}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <Empty
                    icon="calendar"
                    title="Nada en el periodo"
                    hint="Agrega cuentas pendientes o amplía el rango de fechas."
                  />
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr
                  key={f.key}
                  className={`border-b border-zinc-800/60 last:border-0 ${
                    !f.ingreso && !f.cubierto ? "bg-red-950/30" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-center">
                    {f.seleccionable && f.pagoId != null ? (
                      <input
                        type="checkbox"
                        checked={!excluidos.includes(f.pagoId)}
                        onChange={() => toggle(f.pagoId as number)}
                        aria-label={`Incluir ${f.concepto}`}
                        className="h-4 w-4 accent-emerald-500"
                      />
                    ) : (
                      <span className="inline-block h-4 w-4" />
                    )}
                  </td>
                  <td className="tnum whitespace-nowrap px-4 py-2.5 text-zinc-400">
                    {fmtFecha(f.fecha)}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-2.5 font-medium">
                    {f.concepto}
                  </td>
                  <td
                    className={`tnum whitespace-nowrap px-4 py-2.5 text-right font-semibold ${
                      f.ingreso ? "text-emerald-300" : "text-zinc-100"
                    }`}
                  >
                    {f.ingreso ? "+" : "−"}
                    {fmtUSD(f.monto_cents)}
                  </td>
                  <td className="tnum whitespace-nowrap px-4 py-2.5 text-right text-zinc-400">
                    {fmtUSD(f.balance)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {f.ingreso ? (
                      <Badge tone="green">Ingreso</Badge>
                    ) : f.cubierto ? (
                      <Badge tone="zinc">Cubre</Badge>
                    ) : (
                      <Badge tone="red">No alcanza</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
