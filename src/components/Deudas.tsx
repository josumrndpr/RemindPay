import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDebtPayment,
  createDebt,
  deleteDebt,
  listContacts,
  listDebtPayments,
  listDebts,
  updateDebt,
} from "../lib/api";
import { fmtFecha, fmtUSD, todayLocal } from "../lib/format";
import type {
  Contact,
  Debt,
  DebtDirection,
  DebtPayment,
} from "../lib/types";
import Modal from "./Modal";

type Tab = "pendientes" | "vencidas" | "saldadas" | "todas";

interface DeudaForm {
  direccion: DebtDirection;
  persona: string;
  monto: string;
  fecha_limite: string;
  contacto_id: string;
  notas: string;
}

const EMPTY_FORM: DeudaForm = {
  direccion: "debo",
  persona: "",
  monto: "",
  fecha_limite: "",
  contacto_id: "",
  notas: "",
};

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-500";

export default function Deudas({ signalNueva }: { signalNueva: number }) {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tab, setTab] = useState<Tab>("pendientes");
  const [direccion, setDireccion] = useState<"" | DebtDirection>("");
  const [buscar, setBuscar] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [form, setForm] = useState<DeudaForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [abonoPara, setAbonoPara] = useState<Debt | null>(null);
  const [abonoMonto, setAbonoMonto] = useState("");
  const [abonoFecha, setAbonoFecha] = useState(todayLocal());
  const [abonoNota, setAbonoNota] = useState("");
  const [abonoError, setAbonoError] = useState<string | null>(null);

  const [verAbonos, setVerAbonos] = useState<Debt | null>(null);
  const [abonos, setAbonos] = useState<DebtPayment[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, c] = await Promise.all([
        listDebts({
          direccion: direccion || undefined,
          buscar: buscar || undefined,
          limite: 500,
        }),
        listContacts(),
      ]);
      setDebts(d);
      setContacts(c);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [direccion, buscar]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  function openNueva() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  const signalRef = useRef(signalNueva);
  useEffect(() => {
    if (signalNueva !== signalRef.current) {
      signalRef.current = signalNueva;
      openNueva();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalNueva]);

  function openEditar(d: Debt) {
    setEditing(d);
    setForm({
      direccion: d.direccion,
      persona: d.persona,
      monto: (d.monto_total_cents / 100).toString(),
      fecha_limite: d.fecha_limite,
      contacto_id: d.contacto_id?.toString() ?? "",
      notas: d.notas,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function guardar() {
    const monto = Number.parseFloat(form.monto.replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) {
      setFormError("Monto inválido (ej. 200.00)");
      return;
    }
    if (!form.persona.trim()) {
      setFormError("Falta la persona");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const contacto_id = form.contacto_id ? Number(form.contacto_id) : null;
      if (editing) {
        await updateDebt(editing.id, {
          persona: form.persona.trim(),
          contacto_id,
          monto_total: monto,
          fecha_limite: form.fecha_limite,
          notas: form.notas.trim(),
        });
      } else {
        await createDebt({
          direccion: form.direccion,
          persona: form.persona.trim(),
          contacto_id,
          monto_total: monto,
          fecha_limite: form.fecha_limite,
          notas: form.notas.trim(),
        });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(d: Debt) {
    if (
      !window.confirm(
        `Eliminar la deuda de ${d.persona} (${fmtUSD(d.saldo_cents)} pendientes)? Se borran también sus abonos.`,
      )
    )
      return;
    try {
      await deleteDebt(d.id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  function openAbono(d: Debt) {
    setAbonoPara(d);
    setAbonoMonto(d.saldo_cents > 0 ? (d.saldo_cents / 100).toString() : "");
    setAbonoFecha(todayLocal());
    setAbonoNota("");
    setAbonoError(null);
  }

  async function guardarAbono() {
    if (!abonoPara) return;
    const monto = Number.parseFloat(abonoMonto.replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) {
      setAbonoError("Monto inválido");
      return;
    }
    setSaving(true);
    setAbonoError(null);
    try {
      await addDebtPayment(abonoPara.id, {
        monto,
        fecha: abonoFecha,
        nota: abonoNota.trim(),
      });
      setAbonoPara(null);
      await load();
    } catch (e) {
      setAbonoError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function openVerAbonos(d: Debt) {
    try {
      setAbonos(await listDebtPayments(d.id));
      setVerAbonos(d);
    } catch (e) {
      setError(String(e));
    }
  }

  const counts = {
    pendientes: debts.filter((d) => d.estado !== "saldada").length,
    vencidas: debts.filter((d) => d.estado === "vencida").length,
    saldadas: debts.filter((d) => d.estado === "saldada").length,
    todas: debts.length,
  };
  const visible = debts.filter((d) => {
    if (tab === "todas") return true;
    if (tab === "pendientes") return d.estado !== "saldada";
    if (tab === "vencidas") return d.estado === "vencida";
    return d.estado === "saldada";
  });

  const TABS: { id: Tab; label: string }[] = [
    { id: "pendientes", label: `Pendientes (${counts.pendientes})` },
    { id: "vencidas", label: `Vencidas (${counts.vencidas})` },
    { id: "saldadas", label: `Saldadas (${counts.saldadas})` },
    { id: "todas", label: `Todas (${counts.todas})` },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Deudas</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Quién te debe y a quién debes · con abonos parciales
          </p>
        </div>
        <button
          onClick={openNueva}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          + Nueva deuda (D)
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === t.id
                ? "bg-emerald-500/15 font-medium text-emerald-300"
                : "bg-zinc-800/70 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        <select
          value={direccion}
          onChange={(e) => setDireccion(e.target.value as "" | DebtDirection)}
          className={`${inputCls} w-auto`}
        >
          <option value="">Ambas direcciones</option>
          <option value="debo">Yo debo</option>
          <option value="me_deben">Me deben</option>
        </select>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar persona…"
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
          Sin deudas aquí. Crea la primera con “+ Nueva deuda”.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visible.map((d) => {
            const abonado = d.monto_total_cents - d.saldo_cents;
            const pct =
              d.monto_total_cents > 0
                ? Math.round((abonado / d.monto_total_cents) * 100)
                : 100;
            return (
              <div
                key={d.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-medium">{d.persona}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {d.direccion === "debo" ? "Yo debo" : "Me debe"}
                      {d.contacto ? ` · ${d.contacto}` : ""}
                      {d.fecha_limite
                        ? ` · Límite ${fmtFecha(d.fecha_limite)}`
                        : " · Sin límite"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                      d.estado === "saldada"
                        ? "bg-zinc-700/60 text-zinc-300"
                        : d.estado === "vencida"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {d.estado === "saldada"
                      ? "Saldada"
                      : d.estado === "vencida"
                        ? "Vencida"
                        : "Activa"}
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Saldo restante</p>
                    <p className="text-2xl font-semibold tracking-tight">
                      {fmtUSD(d.saldo_cents)}
                    </p>
                  </div>
                  <p className="text-right text-xs text-zinc-500">
                    Total {fmtUSD(d.monto_total_cents)}
                    <br />
                    Abonado {fmtUSD(abonado)} ({pct}%)
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${
                      d.estado === "saldada"
                        ? "bg-zinc-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {d.notas && (
                  <p className="mt-3 truncate text-sm text-zinc-400">{d.notas}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {d.estado !== "saldada" && (
                    <button
                      onClick={() => openAbono(d)}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
                    >
                      Abonar
                    </button>
                  )}
                  <button
                    onClick={() => void openVerAbonos(d)}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    Abonos
                  </button>
                  <button
                    onClick={() => openEditar(d)}
                    className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => void eliminar(d)}
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
          title={editing ? "Editar deuda" : "Nueva deuda"}
          onClose={() => setModalOpen(false)}
        >
          <div className="space-y-3">
            {!editing && (
              <div className="grid grid-cols-2 gap-2">
                {(["debo", "me_deben"] as DebtDirection[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setForm((f) => ({ ...f, direccion: v }))}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      form.direccion === v
                        ? "bg-emerald-500 text-zinc-950"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {v === "debo" ? "Yo debo" : "Me deben"}
                  </button>
                ))}
              </div>
            )}
            <input
              value={form.persona}
              onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
              placeholder="Persona o negocio"
              maxLength={120}
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                placeholder={editing ? "Nuevo total USD" : "Monto total USD"}
                inputMode="decimal"
                className={inputCls}
              />
              <input
                type="date"
                value={form.fecha_limite}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fecha_limite: e.target.value }))
                }
                className={inputCls}
              />
            </div>
            <select
              value={form.contacto_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, contacto_id: e.target.value }))
              }
              className={inputCls}
            >
              <option value="">Sin contacto vinculado</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              placeholder="Notas (opcional)"
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
                  : "Agregar deuda"}
            </button>
          </div>
        </Modal>
      )}

      {abonoPara && (
        <Modal
          title={`Abonar a ${abonoPara.persona}`}
          onClose={() => setAbonoPara(null)}
        >
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Saldo restante:{" "}
              <span className="font-medium text-zinc-100">
                {fmtUSD(abonoPara.saldo_cents)}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={abonoMonto}
                onChange={(e) => setAbonoMonto(e.target.value)}
                placeholder="Monto USD"
                inputMode="decimal"
                className={inputCls}
              />
              <input
                type="date"
                value={abonoFecha}
                onChange={(e) => setAbonoFecha(e.target.value)}
                className={inputCls}
              />
            </div>
            <input
              value={abonoNota}
              onChange={(e) => setAbonoNota(e.target.value)}
              placeholder="Nota (opcional)"
              maxLength={280}
              className={inputCls}
            />
            {abonoError && <p className="text-sm text-red-300">{abonoError}</p>}
            <button
              onClick={() => void guardarAbono()}
              disabled={saving}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Registrar abono"}
            </button>
          </div>
        </Modal>
      )}

      {verAbonos && (
        <Modal
          title={`Abonos · ${verAbonos.persona}`}
          onClose={() => setVerAbonos(null)}
        >
          {abonos.length === 0 ? (
            <p className="text-sm text-zinc-500">Aún no hay abonos.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {abonos.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <p>{a.nota || <span className="text-zinc-600">Abono</span>}</p>
                    <p className="text-xs text-zinc-500">{fmtFecha(a.fecha)}</p>
                  </div>
                  <p className="font-medium text-emerald-300">
                    {fmtUSD(a.monto_cents)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
