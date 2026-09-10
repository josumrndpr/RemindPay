import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPayment,
  deletePayment,
  listCategories,
  listContacts,
  listPayments,
  updatePayment,
} from "../lib/api";
import { fmtFecha, fmtUSD, monthLocal, todayLocal } from "../lib/format";
import type { Category, Contact, Payment, PaymentType } from "../lib/types";
import Modal from "./Modal";

interface FormState {
  tipo: PaymentType;
  monto: string;
  fecha: string;
  categoria_id: string;
  contacto_id: string;
  descripcion: string;
}

const EMPTY_FORM: FormState = {
  tipo: "gasto",
  monto: "",
  fecha: todayLocal(),
  categoria_id: "",
  contacto_id: "",
  descripcion: "",
};

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-500";

export default function Pagos({ signalNuevo }: { signalNuevo: number }) {
  const [items, setItems] = useState<Payment[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [buscar, setBuscar] = useState("");
  const [tipo, setTipo] = useState<"" | PaymentType>("");
  const [mes, setMes] = useState(monthLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, c, ct] = await Promise.all([
        listPayments({
          tipo: tipo || undefined,
          mes: mes || undefined,
          buscar: buscar || undefined,
          limite: 500,
        }),
        listCategories(),
        listContacts(),
      ]);
      setItems(p);
      setCats(c);
      setContacts(ct);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [buscar, tipo, mes]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  function openNuevo() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, fecha: todayLocal() });
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

  function openEditar(p: Payment) {
    setEditing(p);
    setForm({
      tipo: p.tipo,
      monto: (p.monto_cents / 100).toString(),
      fecha: p.fecha,
      categoria_id: p.categoria_id?.toString() ?? "",
      contacto_id: p.contacto_id?.toString() ?? "",
      descripcion: p.descripcion,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function guardar() {
    const monto = Number.parseFloat(form.monto.replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) {
      setFormError("Monto inválido (ej. 19.99)");
      return;
    }
    if (form.fecha.length !== 10) {
      setFormError("Fecha inválida");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const input = {
        tipo: form.tipo,
        monto,
        fecha: form.fecha,
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        contacto_id: form.contacto_id ? Number(form.contacto_id) : null,
        descripcion: form.descripcion.trim(),
      };
      if (editing) await updatePayment(editing.id, input);
      else await createPayment(input);
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(p: Payment) {
    if (
      !window.confirm(
        `Eliminar "${p.descripcion || "pago sin descripción"}" de ${fmtUSD(p.monto_cents)}?`,
      )
    )
      return;
    try {
      await deletePayment(p.id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  const catsFiltradas = cats.filter(
    (c) => c.tipo === form.tipo || c.tipo === "ambos",
  );
  const neto = items.reduce(
    (acc, p) => acc + (p.tipo === "ingreso" ? p.monto_cents : -p.monto_cents),
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Pagos</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {items.length} movimientos · Neto {fmtUSD(neto)}
          </p>
        </div>
        <button
          onClick={openNuevo}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          + Nuevo pago (N)
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar descripción o categoría…"
          className={`${inputCls} max-w-xs`}
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "" | PaymentType)}
          className={`${inputCls} w-auto`}
        >
          <option value="">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="gasto">Gastos</option>
        </select>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className={`${inputCls} w-auto`}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Sin movimientos. Crea el primero con “+ Nuevo pago”.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/60"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">
                    {fmtFecha(p.fecha)}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.descripcion || (
                      <span className="text-zinc-600">Sin descripción</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">
                    {p.categoria ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        p.tipo === "ingreso"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {p.tipo}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${
                      p.tipo === "ingreso"
                        ? "text-emerald-300"
                        : "text-zinc-100"
                    }`}
                  >
                    {p.tipo === "ingreso" ? "+" : "−"}
                    {fmtUSD(p.monto_cents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      onClick={() => openEditar(p)}
                      className="mr-3 text-zinc-400 hover:text-zinc-100"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void eliminar(p)}
                      className="text-zinc-500 hover:text-red-300"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal
          title={editing ? "Editar pago" : "Nuevo pago"}
          onClose={() => setModalOpen(false)}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(["gasto", "ingreso"] as PaymentType[]).map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setForm((f) => ({ ...f, tipo: t, categoria_id: "" }))
                  }
                  className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${
                    form.tipo === t
                      ? t === "ingreso"
                        ? "bg-emerald-500 text-zinc-950"
                        : "bg-zinc-100 text-zinc-950"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.monto}
                onChange={(e) =>
                  setForm((f) => ({ ...f, monto: e.target.value }))
                }
                placeholder="Monto USD (19.99)"
                inputMode="decimal"
                className={inputCls}
              />
              <input
                type="date"
                value={form.fecha}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fecha: e.target.value }))
                }
                className={inputCls}
              />
            </div>
            <select
              value={form.categoria_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoria_id: e.target.value }))
              }
              className={inputCls}
            >
              <option value="">Sin categoría</option>
              {catsFiltradas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              value={form.contacto_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, contacto_id: e.target.value }))
              }
              className={inputCls}
            >
              <option value="">Sin contacto</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <input
              value={form.descripcion}
              onChange={(e) =>
                setForm((f) => ({ ...f, descripcion: e.target.value }))
              }
              placeholder="Descripción (opcional)"
              maxLength={280}
              className={inputCls}
            />
            {formError && (
              <p className="text-sm text-red-300">{formError}</p>
            )}
            <button
              onClick={() => void guardar()}
              disabled={saving}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar pago"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
