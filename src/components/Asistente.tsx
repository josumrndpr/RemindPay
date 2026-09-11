import { useEffect, useRef, useState } from "react";
import {
  addDebtPayment,
  createContact,
  createDebt,
  createPayment,
  createReminder,
  debtsSummary,
  listCategories,
  listDebts,
  listPayments,
  marcarPago,
  paymentsSummary,
} from "../lib/api";
import {
  chatCompletion,
  extraerAccionRespuesta,
  getAiConfig,
  isAiConfigured,
  promptAuraSistema,
  type AccionIA,
  type AiConfig,
  type ChatMsg,
  type ChatUsage,
  type ContactoExtraido,
  type DeudaExtraida,
  type PagoExtraido,
} from "../lib/ai";
import { getChequeo, pasarChequeo, type Alerta } from "../lib/monitor";
import { avisar } from "../lib/notify";
import { beep } from "../lib/sound";
import {
  fmtFecha,
  fmtFechaHora,
  fmtUSD,
  monthLabel,
  monthLocal,
  todayLocal,
} from "../lib/format";
import type {
  Category,
  Debt,
  NewReminderInput,
  Payment,
  Recurrence,
} from "../lib/types";
import {
  Badge,
  Empty,
  ErrorBox,
  Icon,
  btnPrimary,
  btnSecondary,
  cardCls,
} from "./ui";

interface Burbuja {
  id: number;
  de: "user" | "assistant";
  texto: string;
  uso?: ChatUsage;
}

type Pendiente =
  | {
      kind: "pago";
      pago: PagoExtraido;
      categoriaId: number | null;
      categoriaNombre: string | null;
    }
  | { kind: "deuda"; deuda: DeudaExtraida }
  | { kind: "abono"; deuda: Debt; monto: number; fecha: string }
  | { kind: "recordatorio"; input: NewReminderInput }
  | { kind: "marcar"; pago: Payment }
  | { kind: "contacto"; contacto: ContactoExtraido };

let seq = 1;

const nivelTone: Record<Alerta["nivel"], "red" | "amber" | "zinc"> = {
  urgente: "red",
  aviso: "amber",
  info: "zinc",
};

export default function Asistente({ onIrConfig }: { onIrConfig: () => void }) {
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [msgs, setMsgs] = useState<Burbuja[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pend, setPend] = useState<Pendiente | null>(null);
  const [chequeo, setChequeo] = useState<Alerta[]>(
    () => getChequeo()?.alertas ?? [],
  );
  const [revisando, setRevisando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [c, ct] = await Promise.all([getAiConfig(), listCategories()]);
        setCfg(c);
        setCats(ct);
      } catch {
        /* sin config */
      }
    })();
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, pend, chequeo]);

  function push(de: "user" | "assistant", texto: string, uso?: ChatUsage) {
    setMsgs((m) => [...m, { id: seq++, de, texto, uso }]);
  }

  /** Contexto real para Aura: mes + pendientes + deudas abiertas. */
  async function contextoAura(): Promise<{
    ctx: string;
    pendientes: string[];
    deudas: string[];
  }> {
    const mes = monthLocal();
    const [s, d, pends, deudas] = await Promise.all([
      paymentsSummary(mes),
      debtsSummary(),
      listPayments({ estado: "pendiente", limite: 50 }),
      listDebts({ limite: 50 }),
    ]);
    const pendientes = [...pends]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .slice(0, 8)
      .map(
        (p) =>
          `- [${p.id}] ${p.descripcion || p.tipo} ${fmtUSD(p.monto_cents)} el ${p.fecha}`,
      );
    const abiertas = deudas
      .filter((x) => x.estado !== "saldada")
      .slice(0, 8)
      .map(
        (x) =>
          `- [${x.id}] ${x.direccion === "debo" ? "debo a" : "me debe"} ${x.persona} · saldo ${fmtUSD(x.saldo_cents)} de ${fmtUSD(x.monto_total_cents)}${x.fecha_limite ? ` · límite ${x.fecha_limite}` : ""}`,
      );
    const prox = pendientes.length > 0 ? pendientes.join("\n") : null;
    const ctx = [
      `Hoy es ${todayLocal()}. Mes en vista: ${monthLabel(mes)}.`,
      `Ingresos cobrados: ${fmtUSD(s.ingresos_cents)} · Gastos pagados: ${fmtUSD(s.gastos_cents)} · Balance: ${fmtUSD(s.balance_cents)} (${s.count} movimientos).`,
      `Por cobrar: ${fmtUSD(d.por_cobrar_cents)} · Por pagar: ${fmtUSD(d.por_pagar_cents)} (${d.activas} deudas vivas).`,
      prox ? `Próximos pagos pendientes:\n${prox}` : "Sin pagos pendientes.",
    ].join("\n");
    return { ctx, pendientes, deudas: abiertas };
  }

  function matchCategoria(nombre: string | null): {
    id: number | null;
    nombre: string | null;
  } {
    if (!nombre) return { id: null, nombre: null };
    const c = cats.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
    return c ? { id: c.id, nombre: c.nombre } : { id: null, nombre: null };
  }

  async function enviar(texto?: string) {
    const mensaje = (texto ?? input).trim();
    if (!mensaje || busy || !cfg) return;
    if (!isAiConfigured(cfg)) {
      setError("Configura tu endpoint y modelo primero.");
      return;
    }
    setInput("");
    setError(null);
    setPend(null);
    push("user", mensaje);
    setBusy(true);
    try {
      const a = await contextoAura();
      const historial: ChatMsg[] = msgs
        .slice(-8)
        .map((x) => ({ role: x.de, content: x.texto }));
      const r = await chatCompletion(
        cfg,
        [
          {
            role: "system",
            content: promptAuraSistema({
              contexto: a.ctx,
              categorias: cats.map((c) => c.nombre),
              pendientes: a.pendientes,
              deudas: a.deudas,
            }),
          },
          ...historial,
          { role: "user", content: mensaje },
        ],
        { maxTokens: 700, temperature: 0.3 },
      );
      const { texto, accion } = extraerAccionRespuesta(r.text);
      if (texto.trim()) push("assistant", texto.trim(), r.usage);
      if (accion) await prepararAccion(accion, r.usage);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function prepararAccion(acc: AccionIA, uso?: ChatUsage) {
    if (acc.accion === "registrar_pago") {
      const m = matchCategoria(acc.params.categoria);
      setPend({
        kind: "pago",
        pago: acc.params,
        categoriaId: m.id,
        categoriaNombre: m.nombre,
      });
      push("assistant", "Revisa y confirma para guardar:", uso);
      return;
    }
    if (acc.accion === "crear_deuda") {
      setPend({ kind: "deuda", deuda: acc.params });
      push("assistant", "Revisa y confirma para crear la deuda:", uso);
      return;
    }
    if (acc.accion === "abonar_deuda") {
      const lista = await listDebts({ limite: 200 });
      const deuda = lista.find(
        (x) => x.id === acc.params.id && x.estado !== "saldada",
      );
      if (!deuda) {
        setError("Esa deuda ya no está abierta.");
        return;
      }
      setPend({
        kind: "abono",
        deuda,
        monto: acc.params.monto,
        fecha: acc.params.fecha,
      });
      push("assistant", "Revisa y confirma el abono:", uso);
      return;
    }
    if (acc.accion === "crear_recordatorio") {
      const p = acc.params;
      setPend({
        kind: "recordatorio",
        input: {
          titulo: p.titulo,
          detalle: p.detalle,
          fecha_hora: p.fecha_hora,
          repetir: p.repetir as Recurrence,
          payment_id: null,
          debt_id: null,
          sonido: p.sonido,
          persistente: p.persistente,
        },
      });
      push("assistant", "Revisa y confirma para crear el aviso:", uso);
      return;
    }
    if (acc.accion === "crear_contacto") {
      setPend({ kind: "contacto", contacto: acc.params });
      push("assistant", "Revisa y confirma para crear el contacto:", uso);
      return;
    }
    const lista = await listPayments({ estado: "pendiente", limite: 200 });
    const pago = lista.find((x) => x.id === acc.params.id);
    if (!pago) {
      setError("Ese pago ya no está pendiente.");
      return;
    }
    setPend({ kind: "marcar", pago });
    push("assistant", "Revisa y confirma para marcarlo pagado:", uso);
  }

  async function confirmar() {
    if (!pend || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pend.kind === "pago") {
        const p = pend.pago;
        await createPayment({
          tipo: p.tipo,
          monto: p.monto,
          fecha: p.fecha,
          categoria_id: pend.categoriaId,
          contacto_id: null,
          descripcion: p.descripcion,
          recurrente: "none",
          comprobante_path: "",
          estado: p.fecha > todayLocal() ? "pendiente" : "pagado",
        });
        push(
          "assistant",
          `Guardado: ${p.descripcion || p.tipo} por ${fmtUSD(Math.round(p.monto * 100))} el ${fmtFecha(p.fecha)}.`,
        );
      } else if (pend.kind === "deuda") {
        const x = pend.deuda;
        await createDebt({
          direccion: x.direccion,
          persona: x.persona,
          contacto_id: null,
          monto_total: x.monto_total,
          fecha_limite: x.fecha_limite,
          notas: x.notas,
        });
        push(
          "assistant",
          `Deuda creada: ${x.direccion === "debo" ? "le debes a" : "te debe"} ${x.persona} por ${fmtUSD(Math.round(x.monto_total * 100))}${x.fecha_limite ? ` · límite ${fmtFecha(x.fecha_limite)}` : ""}.`,
        );
      } else if (pend.kind === "abono") {
        const d = await addDebtPayment(pend.deuda.id, {
          monto: pend.monto,
          fecha: pend.fecha,
          nota: "",
        });
        push(
          "assistant",
          `Abono guardado: ${fmtUSD(Math.round(pend.monto * 100))} a ${pend.deuda.persona}. Saldo restante: ${fmtUSD(d.saldo_cents)}.`,
        );
      } else if (pend.kind === "recordatorio") {
        const r = await createReminder(pend.input);
        push(
          "assistant",
          `Aviso creado: ${r.titulo} para ${fmtFechaHora(r.fecha_hora)}.`,
        );
      } else if (pend.kind === "contacto") {
        const c = await createContact({
          nombre: pend.contacto.nombre,
          telefono: pend.contacto.telefono,
          nota: pend.contacto.nota,
        });
        push("assistant", `Contacto creado: ${c.nombre}.`);
      } else {
        await marcarPago(pend.pago.id, "pagado");
        push(
          "assistant",
          `Marcado como pagado: ${pend.pago.descripcion || "pago"} por ${fmtUSD(pend.pago.monto_cents)}.`,
        );
      }
      setPend(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revisarAhora() {
    if (!cfg || revisando) return;
    if (!isAiConfigured(cfg)) {
      setError("Configura tu endpoint y modelo primero.");
      return;
    }
    setRevisando(true);
    setError(null);
    try {
      const alertas = await pasarChequeo(cfg);
      setChequeo(alertas);
      const urg = alertas.filter((a) => a.nivel === "urgente");
      if (urg.length > 0) {
        beep(2);
        await avisar(
          "RemindPay",
          urg.length === 1
            ? urg[0].texto
            : `${urg.length} alertas urgentes en tu dinero`,
        );
      }
      if (alertas.length === 0) {
        push("assistant", "Chequeo listo: todo en orden, sin alertas.");
      } else {
        push(
          "assistant",
          `Chequeo listo: ${alertas.length} alerta(s). Las ves arriba.`,
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRevisando(false);
    }
  }

  const sinConfig = cfg && !isAiConfigured(cfg);

  function tituloPend(): string {
    if (!pend) return "";
    if (pend.kind === "pago") return "Confirmar pago";
    if (pend.kind === "deuda") return "Confirmar deuda";
    if (pend.kind === "abono") return "Confirmar abono";
    if (pend.kind === "recordatorio") return "Confirmar aviso";
    if (pend.kind === "contacto") return "Confirmar contacto";
    return "Confirmar pago realizado";
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <div>
        <h2 className="flex items-center gap-2 text-[26px] font-bold tracking-tight">
          <Icon name="sparkles" size={22} className="text-emerald-300" />
          Aura
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Tu asistente financiera: registra pagos, crea deudas y avisos, y
          vigila tu dinero. Nada se guarda sin tu confirmación.
        </p>
      </div>

      {sinConfig && (
        <div className={`${cardCls} mt-4 flex items-center justify-between gap-3 p-4`}>
          <p className="text-sm text-zinc-400">
            Conecta tu endpoint (OpenCode Go/Zen) para activar a Aura.
          </p>
          <button onClick={onIrConfig} className={`${btnSecondary} shrink-0 !text-xs`}>
            Ir a Configuración
          </button>
        </div>
      )}

      {chequeo.length > 0 && (
        <div className={`${cardCls} mt-4 space-y-2 p-4`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Chequeo de Aura
            </p>
            <button
              onClick={() => void revisarAhora()}
              disabled={revisando}
              className="text-xs font-medium text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
            >
              {revisando ? "Revisando…" : "Revisar ahora"}
            </button>
          </div>
          {chequeo.map((a, i) => (
            <p key={i} className="flex items-start gap-2 text-sm">
              <Badge tone={nivelTone[a.nivel]}>{a.nivel}</Badge>
              <span className="text-zinc-300">{a.texto}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {msgs.length === 0 && !pend && chequeo.length === 0 && (
          <Empty
            icon="sparkles"
            title="¿En qué te ayudo?"
            hint="Pídeme con tus palabras: registro, creo y marco por ti (tú confirmas)."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => setInput("Pagué $")}
                  className={btnSecondary}
                >
                  Registrar pago
                </button>
                <button
                  onClick={() => setInput("Le debo $")}
                  className={btnSecondary}
                >
                  Crear deuda
                </button>
                <button
                  onClick={() => setInput("Recuérdame ")}
                  className={btnSecondary}
                >
                  Crear aviso
                </button>
                <button
                  onClick={() => void enviar("¿Cómo voy este mes?")}
                  className={btnSecondary}
                >
                  ¿Cómo voy este mes?
                </button>
                <button
                  onClick={() => void revisarAhora()}
                  className={btnSecondary}
                >
                  Chequeo de mi dinero
                </button>
              </div>
            }
          />
        )}
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`anim-rise flex ${m.de === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.de === "user"
                  ? "bg-emerald-500 font-medium text-zinc-950"
                  : "border border-zinc-800/80 bg-zinc-900/70"
              }`}
            >
              {m.texto}
              {m.uso?.total_tokens != null && (
                <span className="mt-1 block text-[11px] opacity-60">
                  {m.uso.total_tokens} tokens
                </span>
              )}
            </div>
          </div>
        ))}
        {pend && (
          <div className="anim-pop rounded-2xl border border-emerald-800 bg-emerald-950/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              {tituloPend()}
            </p>
            {pend.kind === "pago" && (
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <Badge tone={pend.pago.tipo === "ingreso" ? "green" : "zinc"}>
                    {pend.pago.tipo}
                  </Badge>{" "}
                  <span className="tnum text-lg font-semibold">
                    {fmtUSD(Math.round(pend.pago.monto * 100))}
                  </span>
                </p>
                <p className="text-zinc-300">
                  {pend.pago.descripcion || "Sin descripción"}
                </p>
                <p className="tnum text-xs text-zinc-500">
                  {fmtFecha(pend.pago.fecha)} ·{" "}
                  {pend.categoriaNombre ?? "Sin categoría"} ·{" "}
                  {pend.pago.fecha > todayLocal() ? "pendiente" : "pagado"}
                </p>
              </div>
            )}
            {pend.kind === "deuda" && (
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <Badge tone={pend.deuda.direccion === "debo" ? "red" : "green"}>
                    {pend.deuda.direccion === "debo" ? "yo debo" : "me deben"}
                  </Badge>{" "}
                  <span className="tnum text-lg font-semibold">
                    {fmtUSD(Math.round(pend.deuda.monto_total * 100))}
                  </span>
                </p>
                <p className="text-zinc-300">{pend.deuda.persona}</p>
                <p className="tnum text-xs text-zinc-500">
                  {pend.deuda.fecha_limite
                    ? `límite ${fmtFecha(pend.deuda.fecha_limite)}`
                    : "sin fecha límite"}
                  {pend.deuda.notas ? ` · ${pend.deuda.notas}` : ""}
                </p>
              </div>
            )}
            {pend.kind === "abono" && (
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <span className="tnum text-lg font-semibold">
                    {fmtUSD(Math.round(pend.monto * 100))}
                  </span>{" "}
                  <span className="text-zinc-300">
                    a {pend.deuda.persona}
                  </span>
                </p>
                <p className="tnum text-xs text-zinc-500">
                  {fmtFecha(pend.fecha)} · saldo actual{" "}
                  {fmtUSD(pend.deuda.saldo_cents)} → queda{" "}
                  {fmtUSD(
                    Math.max(
                      0,
                      pend.deuda.saldo_cents - Math.round(pend.monto * 100),
                    ),
                  )}
                </p>
              </div>
            )}
            {pend.kind === "recordatorio" && (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-medium">{pend.input.titulo}</p>
                <p className="tnum text-xs text-zinc-500">
                  {fmtFechaHora(pend.input.fecha_hora)}
                  {pend.input.repetir !== "none"
                    ? ` · ${pend.input.repetir}`
                    : ""}
                </p>
                {pend.input.detalle && (
                  <p className="text-zinc-400">{pend.input.detalle}</p>
                )}
              </div>
            )}
            {pend.kind === "contacto" && (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-medium">{pend.contacto.nombre}</p>
                <p className="tnum text-xs text-zinc-500">
                  {pend.contacto.telefono || "sin teléfono"}
                  {pend.contacto.nota ? ` · ${pend.contacto.nota}` : ""}
                </p>
              </div>
            )}
            {pend.kind === "marcar" && (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-medium">
                  {pend.pago.descripcion || "Pago sin descripción"}
                </p>
                <p className="tnum text-xs text-zinc-500">
                  {fmtUSD(pend.pago.monto_cents)} · {fmtFecha(pend.pago.fecha)}
                </p>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void confirmar()}
                disabled={busy}
                className={`${btnPrimary} flex-1`}
              >
                Confirmar
              </button>
              <button
                onClick={() => setPend(null)}
                className={`${btnSecondary} flex-1`}
              >
                Descartar
              </button>
            </div>
          </div>
        )}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-2.5 text-sm text-zinc-500">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400 align-middle" />{" "}
              Pensando…
            </div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej. Pagué $45 de luz · Le debo $200 a Juan · Aboné $50…"
          aria-label="Mensaje"
          className="w-full rounded-xl border border-zinc-700/80 bg-zinc-800 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-500/70"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className={btnPrimary}
        >
          Enviar
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-zinc-600">
        Aura puede equivocarse: confirma montos y fechas antes de guardar.
      </p>
    </div>
  );
}
