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

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-500";

export function repetirLabel(r: Recurrence): string {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Recordatorios
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Avisos en tu PC con sonido · persisten hasta marcarlos hecho
          </p>
        </div>
        <button
          onClick={openNuevo}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          + Nuevo recordatorio (R)
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setTab("pendientes")}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            tab === "pendientes"
              ? "bg-emerald-500/15 font-medium text-emerald-300"
              : "bg-zinc-800/70 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
        >
          Pendientes ({pendientes.length}
          {vencidos > 0 ? ` · ${vencidos} vencidos` : ""})
        </button>
        <button
          onClick={() => setTab("historial")}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            tab === "historial"
              ? "bg-emerald-500/15 font-medium text-emerald-300"
              : "bg-zinc-800/70 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
        >
          Historial ({historial.length})
        </button>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar…"
          className={`${inputCls} max-w-xs`}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-center text-sm text-zinc-500">Cargando…</p>
      ) : visible.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">
          {tab === "pendientes"
            ? "Sin pendientes. Crea el primero con “+ Nuevo recordatorio”."
            : "Nada por aquí todavía."}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((r) => {
            const vencido = !r.hecho && r.fecha_hora <= ahora;
            return (
              <div
                key={r.id}
                className={`rounded-xl border p-4 ${
                  vencido
                    ? "border-red-900 bg-red-950/30"
                    : "border-zinc-800 bg-zinc-900/60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.titulo}{" "}
                      {vencido && (
                        <span className="ml-1 rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-300">
                          Vencido
                        </span>
                      )}
                      {r.repetir !== "none" && (
                        <span className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                          {repetirLabel(r.repetir)}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-400">
                      {fmtFechaHora(r.fecha_hora)}
                      {r.sonido ? " · con sonido" : ""}
                    </p>
                    {r.detalle && (
                      <p className="mt-1 text-sm text-zinc-500">{r.detalle}</p>
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
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!r.hecho ? (
                    <button
                      onClick={() => void completar(r)}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
                    >
                      Marcar hecho
                    </button>
                  ) : (
                    <button
                      onClick={() => void reabrir(r)}
                      className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
                    >
                      Reabrir
                    </button>
                  )}
                  <button
                    onClick={() => openEditar(r)}
                    className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => void eliminar(r)}
                    className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:text-red-300"
                  >
                    Eliminar
                  </button>
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
          <div className="space-y-3">
            <input
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Título (ej. Pagar tarjeta)"
              maxLength={140}
              className={inputCls}
            />
            <textarea
              value={form.detalle}
              onChange={(e) => setForm((f) => ({ ...f, detalle: e.target.value }))}
              placeholder="Detalle (opcional)"
              rows={2}
              maxLength={500}
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                value={form.fecha_hora}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fecha_hora: e.target.value }))
                }
                className={inputCls}
              />
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
            </div>
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
              <option value="">Sin deuda vinculada</option>
              {debts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.persona}
                </option>
              ))}
            </select>
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
              <option value="">Sin pago vinculado</option>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.descripcion || `Pago ${p.id}`} · {p.fecha}
                </option>
              ))}
            </select>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.sonido}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sonido: e.target.checked }))
                  }
                  className="accent-emerald-500"
                />
                Sonido
              </label>
              <label className="flex items-center gap-2 text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.persistente}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, persistente: e.target.checked }))
                  }
                  className="accent-emerald-500"
                />
                Persistente hasta marcar hecho
              </label>
            </div>
            {formError && <p className="text-sm text-red-300">{formError}</p>}
            <button
              onClick={() => void guardar()}
              disabled={saving}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving
                ? "Guardando…"
                : editing
                  ? "Guardar cambios"
                  : "Agregar recordatorio"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
