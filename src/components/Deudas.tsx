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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight">Deudas</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Quién te debe y a quién debes · con abonos parciales
          </p>
        </div>
        <button onClick={openNueva} className={btnPrimary}>
          <Icon name="plus" size={15} />
          Nueva deuda
          <kbd className="rounded-md bg-zinc-950/20 px-1.5 py-0.5 font-sans text-[10px]">
            D
          </kbd>
        </button>
      </div>

      <div className={`${cardCls} mt-5 flex flex-wrap items-center gap-2 p-3`}>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-all ${
                tab === t.id
                  ? "bg-emerald-500/15 font-semibold text-emerald-300"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          <select
            value={direccion}
            onChange={(e) => setDireccion(e.target.value as "" | DebtDirection)}
            aria-label="Dirección"
            className={`${inputCls} w-auto`}
          >
            <option value="">Ambas direcciones</option>
            <option value="debo">Yo debo</option>
            <option value="me_deben">Me deben</option>
          </select>
          <div className="relative">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar persona…"
              aria-label="Buscar persona"
              className={`${inputCls} pl-9`}
            />
          </div>
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
            icon="deudas"
            title="Sin deudas aquí"
            hint="Crea la primera con el botón Nueva deuda."
            action={
              <button onClick={openNueva} className={btnSecondary}>
                <Icon name="plus" size={15} />
                Nueva deuda
              </button>
            }
          />
        </div>
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
                className={`${cardCls} anim-rise p-5 transition-all hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-xl ${
                  d.estado === "vencida" ? "!border-red-900/70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        d.direccion === "debo"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      <Icon name="deudas" size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-semibold tracking-tight">
                        {d.persona}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {d.direccion === "debo" ? "Yo debo" : "Me debe"}
                        {d.contacto ? ` · ${d.contacto}` : ""}
                        {d.fecha_limite
                          ? ` · Límite ${fmtFecha(d.fecha_limite)}`
                          : " · Sin límite"}
                      </p>
                    </div>
                  </div>
                  <Badge
                    tone={
                      d.estado === "saldada"
                        ? "zinc"
                        : d.estado === "vencida"
                          ? "red"
                          : "amber"
                    }
                  >
                    {d.estado === "saldada"
                      ? "Saldada"
                      : d.estado === "vencida"
                        ? "Vencida"
                        : "Activa"}
                  </Badge>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Saldo restante
                    </p>
                    <p className="tnum mt-0.5 text-[26px] font-semibold leading-none tracking-tight">
                      {fmtUSD(d.saldo_cents)}
                    </p>
                  </div>
                  <p className="tnum text-right text-xs leading-relaxed text-zinc-500">
                    Total {fmtUSD(d.monto_total_cents)}
                    <br />
                    Abonado {fmtUSD(abonado)} · {pct}%
                  </p>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      d.estado === "saldada"
                        ? "bg-zinc-500"
                        : "bg-gradient-to-r from-emerald-500 to-teal-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {d.notas && (
                  <p className="mt-3 truncate text-sm text-zinc-400">
                    {d.notas}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-zinc-800/60 pt-3.5">
                  {d.estado !== "saldada" && (
                    <button
                      onClick={() => openAbono(d)}
                      className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[.98]"
                    >
                      Abonar
                    </button>
                  )}
                  <button
                    onClick={() => void openVerAbonos(d)}
                    className={`${btnSecondary} !px-3.5 !py-1.5`}
                  >
                    Abonos
                  </button>
                  <span className="flex-1" />
                  <button
                    onClick={() => openEditar(d)}
                    className={`${btnGhostSm} px-2`}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => void eliminar(d)}
                    className={`${btnDangerSm} px-2`}
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
          <div className="space-y-3.5">
            {!editing && (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-800/60 p-1">
                {(["debo", "me_deben"] as DebtDirection[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setForm((f) => ({ ...f, direccion: v }))}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                      form.direccion === v
                        ? "bg-emerald-500 text-zinc-950 shadow"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {v === "debo" ? "Yo debo" : "Me deben"}
                  </button>
                ))}
              </div>
            )}
            <Field label="Persona o negocio">
              <input
                value={form.persona}
                onChange={(e) =>
                  setForm((f) => ({ ...f, persona: e.target.value }))
                }
                placeholder="Ej. Colmado Los Primos"
                maxLength={120}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label={editing ? "Nuevo total (USD)" : "Monto total (USD)"}>
                <input
                  value={form.monto}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, monto: e.target.value }))
                  }
                  placeholder="200.00"
                  inputMode="decimal"
                  className={`${inputCls} tnum`}
                />
              </Field>
              <Field label="Fecha límite">
                <input
                  type="date"
                  value={form.fecha_limite}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fecha_limite: e.target.value }))
                  }
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Contacto vinculado">
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
            </Field>
            <Field label="Notas">
              <textarea
                value={form.notas}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notas: e.target.value }))
                }
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
                    : "Agregar deuda"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {abonoPara && (
        <Modal
          title={`Abonar a ${abonoPara.persona}`}
          onClose={() => setAbonoPara(null)}
        >
          <div className="space-y-3.5">
            <div className={`${cardCls} flex items-center justify-between p-3.5`}>
              <span className="text-sm text-zinc-400">Saldo restante</span>
              <span className="tnum text-xl font-semibold">
                {fmtUSD(abonoPara.saldo_cents)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Monto (USD)">
                <input
                  value={abonoMonto}
                  onChange={(e) => setAbonoMonto(e.target.value)}
                  placeholder="50.00"
                  inputMode="decimal"
                  className={`${inputCls} tnum`}
                />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={abonoFecha}
                  onChange={(e) => setAbonoFecha(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Nota">
              <input
                value={abonoNota}
                onChange={(e) => setAbonoNota(e.target.value)}
                placeholder="Opcional"
                maxLength={280}
                className={inputCls}
              />
            </Field>
            {abonoError && <ErrorBox>{abonoError}</ErrorBox>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAbonoPara(null)}
                className={`${btnSecondary} flex-1`}
              >
                Cancelar
              </button>
              <button
                onClick={() => void guardarAbono()}
                disabled={saving}
                className={`${btnPrimary} flex-1`}
              >
                {saving ? "Guardando…" : "Registrar abono"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {verAbonos && (
        <Modal
          title={`Abonos · ${verAbonos.persona}`}
          onClose={() => setVerAbonos(null)}
        >
          {abonos.length === 0 ? (
            <p className="py-2 text-center text-sm text-zinc-500">
              Aún no hay abonos.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800/60">
              {abonos.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-3.5 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate">
                      {a.nota || <span className="text-zinc-600">Abono</span>}
                    </p>
                    <p className="tnum text-xs text-zinc-500">
                      {fmtFecha(a.fecha)}
                    </p>
                  </div>
                  <p className="tnum ml-3 font-semibold text-emerald-300">
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
