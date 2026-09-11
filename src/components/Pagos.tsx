import { useCallback, useEffect, useRef, useState } from "react";
import {
  abrirComprobante,
  createPayment,
  deletePayment,
  guardarComprobante,
  isPreview,
  listCategories,
  listContacts,
  listPayments,
  updatePayment,
} from "../lib/api";
import {
  ahoraArchivo,
  fmtFecha,
  fmtUSD,
  monthLocal,
  todayLocal,
} from "../lib/format";
import type {
  Category,
  Contact,
  Payment,
  PaymentType,
  Recurrence,
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
  tableWrapCls,
  thCls,
} from "./ui";

interface FormState {
  tipo: PaymentType;
  monto: string;
  fecha: string;
  categoria_id: string;
  contacto_id: string;
  descripcion: string;
  recurrente: Recurrence;
  comprobante: string;
}

const EMPTY_FORM: FormState = {
  tipo: "gasto",
  monto: "",
  fecha: todayLocal(),
  categoria_id: "",
  contacto_id: "",
  descripcion: "",
  recurrente: "none",
  comprobante: "",
};

const REPETIR: { id: Recurrence; label: string }[] = [
  { id: "none", label: "Una vez" },
  { id: "daily", label: "Diaria" },
  { id: "weekly", label: "Semanal" },
  { id: "monthly", label: "Mensual" },
];

export function repetirCorto(r: Recurrence): string {
  return REPETIR.find((x) => x.id === r)?.label ?? r;
}

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
  const fileRef = useRef<HTMLInputElement>(null);

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
      recurrente: p.recurrente,
      comprobante: p.comprobante_path,
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
        recurrente: form.recurrente,
        comprobante_path: form.comprobante,
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

  async function adjuntar() {
    setFormError(null);
    try {
      if (isPreview()) {
        fileRef.current?.click();
        return;
      }
      const { open } = await import("@tauri-apps/plugin-dialog");
      const ruta = await open({
        multiple: false,
        filters: [
          { name: "Comprobante", extensions: ["png", "jpg", "jpeg", "webp", "pdf"] },
        ],
      });
      if (typeof ruta === "string") {
        const nombre = await guardarComprobante(ruta, ahoraArchivo());
        setForm((f) => ({ ...f, comprobante: nombre }));
      }
    } catch (e) {
      setFormError(String(e));
    }
  }

  async function onFilePreview(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { adjuntarPreview } = await import("../lib/mock");
      const nombre = await adjuntarPreview(file);
      setForm((f) => ({ ...f, comprobante: nombre }));
    } catch (err) {
      setFormError(String(err));
    }
  }

  async function verComp(nombre: string) {
    try {
      await abrirComprobante(nombre);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight">Pagos</h2>
          <p className="tnum mt-0.5 text-sm text-zinc-500">
            {items.length} movimientos · Neto {fmtUSD(neto)}
          </p>
        </div>
        <button onClick={openNuevo} className={btnPrimary}>
          <Icon name="plus" size={15} />
          Nuevo pago
          <kbd className="rounded-md bg-zinc-950/20 px-1.5 py-0.5 font-sans text-[10px]">
            N
          </kbd>
        </button>
      </div>

      <div className={`${cardCls} mt-5 flex flex-wrap gap-2 p-3`}>
        <div className="relative min-w-52 flex-1">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar descripción o categoría…"
            aria-label="Buscar"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "" | PaymentType)}
          aria-label="Tipo"
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
          aria-label="Mes"
          className={`${inputCls} w-auto`}
        />
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      <div className={`${tableWrapCls} mt-4`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-zinc-900">
            <tr className="border-b border-zinc-800">
              <th className={thCls}>Fecha</th>
              <th className={thCls}>Descripción</th>
              <th className={thCls}>Categoría</th>
              <th className={thCls}>Tipo</th>
              <th className={`${thCls} text-right`}>Monto</th>
              <th className={`${thCls} text-right`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <Empty
                    icon="pagos"
                    title="Sin movimientos"
                    hint="Crea el primero con el botón Nuevo pago."
                    action={
                      <button onClick={openNuevo} className={btnSecondary}>
                        <Icon name="plus" size={15} />
                        Nuevo pago
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr
                  key={p.id}
                  className="anim-fade border-b border-zinc-800/60 last:border-0 transition-colors hover:bg-zinc-900/70"
                >
                  <td className="tnum whitespace-nowrap px-4 py-3 text-zinc-400">
                    {fmtFecha(p.fecha)}
                  </td>
                  <td className="max-w-[240px] px-4 py-3">
                    <p className="truncate font-medium">
                      {p.descripcion || (
                        <span className="font-normal text-zinc-600">
                          Sin descripción
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                      {p.recurrente !== "none" && p.serie_id == null && (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <Icon name="deudas" size={11} />
                          {repetirCorto(p.recurrente)}
                        </span>
                      )}
                      {p.comprobante_path && (
                        <button
                          onClick={() => void verComp(p.comprobante_path)}
                          className="inline-flex items-center gap-1 hover:text-zinc-200"
                        >
                          <Icon name="download" size={11} />
                          Comprobante
                        </button>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {p.categoria ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={p.tipo === "ingreso" ? "green" : "zinc"}>
                      {p.tipo === "ingreso" ? "Ingreso" : "Gasto"}
                    </Badge>
                  </td>
                  <td
                    className={`tnum whitespace-nowrap px-4 py-3 text-right font-semibold ${
                      p.tipo === "ingreso"
                        ? "text-emerald-300"
                        : "text-zinc-100"
                    }`}
                  >
                    {p.tipo === "ingreso" ? "+" : "−"}
                    {fmtUSD(p.monto_cents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => openEditar(p)}
                      className={`${btnGhostSm} mr-3`}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void eliminar(p)}
                      className={btnDangerSm}
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
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-800/60 p-1">
              {(["gasto", "ingreso"] as PaymentType[]).map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setForm((f) => ({ ...f, tipo: t, categoria_id: "" }))
                  }
                  className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-all ${
                    form.tipo === t
                      ? t === "ingreso"
                        ? "bg-emerald-500 text-zinc-950 shadow"
                        : "bg-zinc-100 text-zinc-950 shadow"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Monto (USD)">
                <input
                  value={form.monto}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, monto: e.target.value }))
                  }
                  placeholder="19.99"
                  inputMode="decimal"
                  className={`${inputCls} tnum`}
                />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fecha: e.target.value }))
                  }
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Categoría">
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
              </Field>
              <Field label="Contacto">
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
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Repetición">
                <select
                  value={form.recurrente}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      recurrente: e.target.value as Recurrence,
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
              <Field label="Comprobante">
                {form.comprobante ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => void verComp(form.comprobante)}
                      className={`${btnSecondary} min-w-0 flex-1 !px-2 text-xs`}
                    >
                      <span className="truncate">Ver archivo</span>
                    </button>
                    <button
                      onClick={() => setForm((f) => ({ ...f, comprobante: "" }))}
                      className="rounded-xl bg-zinc-800 px-2.5 text-zinc-400 hover:text-red-300"
                      aria-label="Quitar comprobante"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => void adjuntar()} className={btnSecondary}>
                    <Icon name="download" size={15} />
                    Adjuntar
                  </button>
                )}
              </Field>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              className="hidden"
              onChange={onFilePreview}
            />
            <Field label="Descripción">
              <input
                value={form.descripcion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, descripcion: e.target.value }))
                }
                placeholder="Opcional"
                maxLength={280}
                className={inputCls}
              />
            </Field>
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
                    : "Agregar pago"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
