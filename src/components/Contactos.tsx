import { useCallback, useEffect, useState } from "react";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "../lib/api";
import type { Contact, NewContactInput } from "../lib/types";
import Modal from "./Modal";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-500";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Contactos</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Personas vinculadas a pagos y deudas
          </p>
        </div>
        <button
          onClick={openNuevo}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          + Nuevo contacto
        </button>
      </div>

      <div className="mt-5">
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className={`${inputCls} max-w-xs`}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Nota</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Sin contactos.
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/60"
                >
                  <td className="px-4 py-2.5 font-medium">{c.nombre}</td>
                  <td className="px-4 py-2.5 text-zinc-400">
                    {c.telefono || "—"}
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-zinc-400">
                    {c.nota || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      onClick={() => openEditar(c)}
                      className="mr-3 text-zinc-400 hover:text-zinc-100"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void eliminar(c)}
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
          title={editing ? "Editar contacto" : "Nuevo contacto"}
          onClose={() => setModalOpen(false)}
        >
          <div className="space-y-3">
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre"
              maxLength={120}
              className={inputCls}
            />
            <input
              value={form.telefono}
              onChange={(e) =>
                setForm((f) => ({ ...f, telefono: e.target.value }))
              }
              placeholder="Teléfono (opcional)"
              maxLength={40}
              className={inputCls}
            />
            <textarea
              value={form.nota}
              onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))}
              placeholder="Nota (opcional)"
              rows={2}
              maxLength={500}
              className={inputCls}
            />
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
                  : "Agregar contacto"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
