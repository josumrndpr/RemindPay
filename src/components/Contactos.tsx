import { useCallback, useEffect, useState } from "react";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "../lib/api";
import type { Contact, NewContactInput } from "../lib/types";
import Modal from "./Modal";
import {
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

const EMPTY: NewContactInput = { nombre: "", telefono: "", nota: "" };

export default function Contactos() {
  const [items, setItems] = useState<Contact[]>([]);
  const [buscar, setBuscar] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<NewContactInput>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listContacts(buscar || undefined));
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
    setForm(EMPTY);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditar(c: Contact) {
    setEditing(c);
    setForm({ nombre: c.nombre, telefono: c.telefono, nota: c.nota });
    setFormError(null);
    setModalOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      setFormError("Falta el nombre");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const input = {
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        nota: form.nota.trim(),
      };
      if (editing) await updateContact(editing.id, input);
      else await createContact(input);
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(c: Contact) {
    if (
      !window.confirm(
        `Eliminar a ${c.nombre}? Se desvincula de sus pagos y deudas (no se borran).`,
      )
    )
      return;
    try {
      await deleteContact(c.id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight">Contactos</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {items.length} personas vinculadas a pagos y deudas
          </p>
        </div>
        <button onClick={openNuevo} className={btnPrimary}>
          <Icon name="plus" size={15} />
          Nuevo contacto
        </button>
      </div>

      <div className={`${cardCls} mt-5 p-3`}>
        <div className="relative max-w-xs">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por nombre o teléfono…"
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

      <div className={`${tableWrapCls} mt-4`}>
        <table className="w-full min-w-[600px] text-sm">
          <thead className="sticky top-0 bg-zinc-900">
            <tr className="border-b border-zinc-800">
              <th className={thCls}>Nombre</th>
              <th className={thCls}>Teléfono</th>
              <th className={thCls}>Nota</th>
              <th className={`${thCls} text-right`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <Empty
                    icon="users"
                    title="Sin contactos"
                    hint="Agrega personas para vincularlas a pagos y deudas."
                    action={
                      <button onClick={openNuevo} className={btnSecondary}>
                        <Icon name="plus" size={15} />
                        Nuevo contacto
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr
                  key={c.id}
                  className="anim-fade border-b border-zinc-800/60 last:border-0 transition-colors hover:bg-zinc-900/70"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                        {c.nombre.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-medium">{c.nombre}</span>
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-zinc-400">
                    {c.telefono || "—"}
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-zinc-400">
                    {c.nota || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => openEditar(c)}
                      className={`${btnGhostSm} mr-3`}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void eliminar(c)}
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
          title={editing ? "Editar contacto" : "Nuevo contacto"}
          onClose={() => setModalOpen(false)}
        >
          <div className="space-y-3.5">
            <Field label="Nombre">
              <input
                value={form.nombre}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nombre: e.target.value }))
                }
                placeholder="Ej. Juan Pérez"
                maxLength={120}
                className={inputCls}
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={form.telefono}
                onChange={(e) =>
                  setForm((f) => ({ ...f, telefono: e.target.value }))
                }
                placeholder="Opcional"
                maxLength={40}
                className={inputCls}
              />
            </Field>
            <Field label="Nota">
              <textarea
                value={form.nota}
                onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))}
                placeholder="Opcional"
                rows={2}
                maxLength={500}
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
                    : "Agregar contacto"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
