import { useCallback, useEffect, useRef, useState } from "react";
import {
  createReminder,
  deleteReminder,
  listDebts,
  listPayments,
  listReminders,
  setReminderDone,
  updateReminder,
} from "../lib/api";
import { ahoraLocal, fmtFechaHora } from "../lib/format";
import { completarRecordatorio } from "../lib/recordatorios";
import type {
  Debt,
  NewReminderInput,
  Payment,
  Recurrence,
  Reminder,
} from "../lib/types";
import Modal from "./Modal";
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  Icon,
  btnDangerSm,
  btnGhostSm,
  btnPrimary,
  btnSecondary,
  cardCls,
  inputCls,
} from "./ui";

type Tab = "pendientes" | "historial";

const EMPTY: NewReminderInput = {
  titulo: "",
  detalle: "",
  fecha_hora: ahoraLocal(),
  repetir: "none",
  payment_id: null,
  debt_id: null,
  sonido: true,
  persistente: true,
};

const REPETIR: { id: Recurrence; label: string }[] = [
  { id: "none", label: "Una vez" },
  { id: "daily", label: "Diaria" },
  { id: "weekly", label: "Semanal" },
  { id: "monthly", label: "Mensual" },
];

function repetirLabel(r: Recurrence): string {
  return REPETIR.find((x) => x.id === r)?.label ?? r;
}

export default function Recordatorios({
  signalNuevo,
  onChanged,
}: {
  signalNuevo: number;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Reminder[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tab, setTab] = useState<Tab>("pendientes");
  const [buscar, setBuscar] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [form, setForm] = useState<NewReminderInput>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, d, p] = await Promise.all([
        listReminders({ buscar: buscar || undefined, limite: 500 }),
        listDebts({ limite: 200 }),
        listPayments({ limite: 50 }),
      ]);
      setItems(r);
      setDebts(d.filter((x) => x.estado !== "saldada"));
      setPayments(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [buscar]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  function openNuevo() {
    setEditing(null);
    setForm({ ...EMPTY, fecha_hora: ahoraLocal() });
    setFormError(null);
    setModalOpen(true);
  }

  const signalRef = useRef(signalNuevo);
  useEffect(() => {
    if (signalNuevo !== signalRef.current) {
      signalRef.current = signalNuevo;
      openNuevo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalNuevo]);

  function openEditar(r: Reminder) {
    setEditing(r);
    setForm({
      titulo: r.titulo,
      detalle: r.detalle,
      fecha_hora: r.fecha_hora,
      repetir: r.repetir,
      payment_id: r.payment_id,
      debt_id: r.debt_id,
      sonido: r.sonido,
      persistente: r.persistente,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function guardar() {
    if (!form.titulo.trim()) {
      setFormError("Falta el título");
      return;
    }
    if (form.fecha_hora.length !== 16) {
      setFormError("Fecha/hora inválida");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await updateReminder(editing.id, form);
      else await createReminder(form);
      setModalOpen(false);
      await load();
      onChanged?.();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function completar(r: Reminder) {
    try {
      await completarRecordatorio(r);
      await load();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    }
  }

  async function reabrir(r: Reminder) {
    try {
      await setReminderDone(r.id, false);
      await load();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    }
  }

  async function eliminar(r: Reminder) {
    if (!window.confirm(`Eliminar "${r.titulo}"?`)) return;
    try {
      await deleteReminder(r.id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    }
  }

  const ahora = ahoraLocal();
  const pendientes = items.filter((r) => !r.hecho);
  const historial = items.filter((r) => r.hecho);
  const vencidos = pendientes.filter((r) => r.fecha_hora <= ahora).length;
  const visible = tab === "pendientes" ? pendientes : historial;

  const deudaNombre = (id: number | null) =>
    debts.find((d) => d.id === id)?.persona;
  const pagoNombre = (id: number | null) => {
    const p = payments.find((x) => x.id === id);
    return p ? p.descripcion || `Pago ${p.id}` : undefined;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight">
            Recordatorios
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Avisos en tu PC con sonido · persisten hasta marcarlos hecho
          </p>
        </div>
        <button onClick={openNuevo} className={btnPrimary}>
          <Icon name="plus" size={15} />
          Nuevo recordatorio
          <kbd className="rounded-md bg-zinc-950/20 px-1.5 py-0.5 font-sans text-[10px]">
            R
          </kbd>
        </button>
      </div>

      <div className={`${cardCls} mt-5 flex flex-wrap items-center gap-2 p-3`}>
        <div className="flex gap-1.5">
          <button
            onClick={() => setTab("pendientes")}
            className={`rounded-lg px-3 py-1.5 text-sm transition-all ${
              tab === "pendientes"
                ? "bg-emerald-500/15 font-semibold text-emerald-300"
                : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
            }`}
          >
            Pendientes ({pendientes.length}
            {vencidos > 0 ? ` · ${vencidos} vencidos` : ""})
          </button>
          <button
            onClick={() => setTab("historial")}
            className={`rounded-lg px-3 py-1.5 text-sm transition-all ${
              tab === "historial"
                ? "bg-emerald-500/15 font-semibold text-emerald-300"
                : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
            }`}
          >
            Historial ({historial.length})
          </button>
        </div>
        <div className="relative min-w-48 flex-1">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar"
            className={`${inputCls} pl-9`}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
        </div>
      ) : visible.length === 0 ? (
        <div className={`${cardCls} mt-4`}>
          <Empty
            icon="bell"
            title={tab === "pendientes" ? "Sin pendientes" : "Nada por aquí"}
            hint={
              tab === "pendientes"
                ? "Crea el primero con el botón Nuevo recordatorio."
                : "Los avisos completados aparecen aquí."
            }
            action={
              tab === "pendientes" ? (
                <button onClick={openNuevo} className={btnSecondary}>
                  <Icon name="plus" size={15} />
                  Nuevo recordatorio
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((r) => {
            const vencido = !r.hecho && r.fecha_hora <= ahora;
            return (
              <div
                key={r.id}
                className={`${cardCls} anim-rise flex items-start gap-3.5 p-4 transition-all hover:border-zinc-700 ${
                  vencido ? "!border-red-900/70" : ""
                } ${r.hecho ? "opacity-60" : ""}`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    vencido
                      ? "bg-red-500/15 text-red-300"
                      : r.hecho
                        ? "bg-zinc-800 text-zinc-500"
                        : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  <Icon name="bell" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold tracking-tight">{r.titulo}</p>
                    {vencido && <Badge tone="red">Vencido</Badge>}
                    {r.repetir !== "none" && (
                      <Badge tone="zinc">{repetirLabel(r.repetir)}</Badge>
                    )}
                  </div>
                  <p className="tnum mt-0.5 text-sm text-zinc-400">
                    {fmtFechaHora(r.fecha_hora)}
                    {r.sonido ? " · con sonido" : ""}
                  </p>
                  {r.detalle && (
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      {r.detalle}
                    </p>
                  )}
                  {(r.debt_id != null || r.payment_id != null) && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {r.debt_id != null &&
                        `Deuda: ${deudaNombre(r.debt_id) ?? `#${r.debt_id}`}`}
                      {r.debt_id != null && r.payment_id != null && " · "}
                      {r.payment_id != null &&
                        `Pago: ${pagoNombre(r.payment_id) ?? `#${r.payment_id}`}`}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {!r.hecho ? (
                      <button
                        onClick={() => void completar(r)}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[.98]"
                      >
                        Marcar hecho
                      </button>
                    ) : (
                      <button
                        onClick={() => void reabrir(r)}
                        className={`${btnSecondary} !px-3 !py-1.5 !text-xs`}
                      >
                        Reabrir
                      </button>
                    )}
                    <button
                      onClick={() => openEditar(r)}
                      className={`${btnGhostSm} px-2 text-[13px]`}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void eliminar(r)}
                      className={`${btnDangerSm} px-2 text-[13px]`}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? "Editar recordatorio" : "Nuevo recordatorio"}
          onClose={() => setModalOpen(false)}
        >
          <div className="space-y-3.5">
            <Field label="Título">
              <input
                value={form.titulo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, titulo: e.target.value }))
                }
                placeholder="Ej. Pagar tarjeta"
                maxLength={140}
                className={inputCls}
              />
            </Field>
            <Field label="Detalle">
              <textarea
                value={form.detalle}
                onChange={(e) =>
                  setForm((f) => ({ ...f, detalle: e.target.value }))
                }
                placeholder="Opcional"
                rows={2}
                maxLength={500}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Fecha y hora">
                <input
                  type="datetime-local"
                  value={form.fecha_hora}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fecha_hora: e.target.value }))
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Repetición">
                <select
                  value={form.repetir}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      repetir: e.target.value as Recurrence,
                    }))
                  }
                  className={inputCls}
                >
                  {REPETIR.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Deuda vinculada">
                <select
                  value={form.debt_id?.toString() ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      debt_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className={inputCls}
                >
                  <option value="">Ninguna</option>
                  {debts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.persona}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pago vinculado">
                <select
                  value={form.payment_id?.toString() ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      payment_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className={inputCls}
                >
                  <option value="">Ninguno</option>
                  {payments.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.descripcion || `Pago ${p.id}`} · {p.fecha}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex gap-2">
              {(
                [
                  ["sonido", "Sonido"],
                  ["persistente", "Persistente"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
                  aria-pressed={form[key]}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    form[key]
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Icon
                    name={form[key] ? "check" : "x"}
                    size={14}
                  />
                  {label}
                </button>
              ))}
            </div>
            {formError && <ErrorBox>{formError}</ErrorBox>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setModalOpen(false)}
                className={`${btnSecondary} flex-1`}
              >
                Cancelar
              </button>
              <button
                onClick={() => void guardar()}
                disabled={saving}
                className={`${btnPrimary} flex-1`}
              >
                {saving
                  ? "Guardando…"
                  : editing
                    ? "Guardar cambios"
                    : "Agregar recordatorio"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
