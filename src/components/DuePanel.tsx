// RemindPay — avisos vencidos persistentes (esquina inferior derecha).
// Solo se quitan con Hecho o Posponer: así lo pediste.
import { fmtFechaHora } from "../lib/format";
import type { Reminder } from "../lib/types";
import { Icon } from "./ui";

export default function DuePanel({
  items,
  onHecho,
  onPosponer,
  onVer,
}: {
  items: Reminder[];
  onHecho: (id: number) => void;
  onPosponer: (id: number) => void;
  onVer: (r: Reminder) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 space-y-2">
      {items.map((r) => (
        <div
          key={r.id}
          className="anim-panel rounded-2xl border border-amber-700/70 bg-zinc-900 p-4 shadow-2xl"
        >
          <div className="flex items-start gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
              <Icon name="bell" size={16} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.titulo}</p>
              <p className="mt-0.5 text-xs text-amber-200/80">
                Venció {fmtFechaHora(r.fecha_hora)}
              </p>
            </div>
          </div>
          {r.detalle && (
            <p className="mt-2 truncate text-xs text-zinc-400">{r.detalle}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onHecho(r.id)}
              className="flex-1 rounded-xl bg-emerald-500 px-2 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[.98]"
            >
              Hecho
            </button>
            <button
              onClick={() => onPosponer(r.id)}
              className="flex-1 rounded-xl bg-zinc-800 px-2 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              +10 min
            </button>
            {(r.debt_id != null || r.payment_id != null) && (
              <button
                onClick={() => onVer(r)}
                className="rounded-xl px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-100"
              >
                Ver
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
