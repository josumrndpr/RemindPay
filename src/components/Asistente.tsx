import { useEffect, useRef, useState } from "react";
import {
  createPayment,
  debtsSummary,
  listCategories,
  listPayments,
  paymentsSummary,
} from "../lib/api";
import {
  chatCompletion,
  getAiConfig,
  isAiConfigured,
  parsePagoJSON,
  type AiConfig,
  type ChatMsg,
  type ChatUsage,
  type PagoExtraido,
} from "../lib/ai";
import { fmtFecha, fmtUSD, monthLabel, monthLocal, todayLocal } from "../lib/format";
import type { Category } from "../lib/types";
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

interface Pendiente {
  pago: PagoExtraido;
  categoriaId: number | null;
  categoriaNombre: string | null;
}

let seq = 1;

export default function Asistente({ onIrConfig }: { onIrConfig: () => void }) {
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [msgs, setMsgs] = useState<Burbuja[]>([]);
  const [input, setInput] = useState("");
  const [modo, setModo] = useState<"chat" | "registro">("chat");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pend, setPend] = useState<Pendiente | null>(null);
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
  }, [msgs, pend]);

  function push(de: "user" | "assistant", texto: string, uso?: ChatUsage) {
    setMsgs((m) => [...m, { id: seq++, de, texto, uso }]);
  }

  async function contextoMes(): Promise<string> {
    const mes = monthLocal();
    const hoy = todayLocal();
    const [s, d, pends] = await Promise.all([
      paymentsSummary(mes),
      debtsSummary(),
      listPayments({ estado: "pendiente", limite: 50 }),
    ]);
    const prox = [...pends]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .slice(0, 8)
      .map(
        (p) =>
          `- ${p.descripcion || p.tipo} ${fmtUSD(p.monto_cents)} el ${p.fecha}`,
      )
      .join("\n");
    return [
      `Hoy es ${hoy}. Mes en vista: ${monthLabel(mes)}.`,
      `Ingresos cobrados: ${fmtUSD(s.ingresos_cents)} · Gastos pagados: ${fmtUSD(s.gastos_cents)} · Balance: ${fmtUSD(s.balance_cents)} (${s.count} movimientos).`,
      `Por cobrar: ${fmtUSD(d.por_cobrar_cents)} · Por pagar: ${fmtUSD(d.por_pagar_cents)} (${d.activas} deudas vivas).`,
      prox ? `Próximos pagos pendientes:\n${prox}` : "Sin pagos pendientes.",
    ].join("\n");
  }

  function promptRegistro(): string {
    const hoy = todayLocal();
    const dow = new Date().toLocaleDateString("es-PR", { weekday: "long" });
    const lista = cats.map((c) => c.nombre).join(", ");
    return [
      `Extrae UN pago del mensaje del usuario. Hoy es ${hoy} (${dow}).`,
      "Devuelve SOLO JSON válido, sin markdown ni explicaciones, con esta forma:",
      '{"tipo":"ingreso"|"gasto","monto":12.5,"fecha":"2026-09-11","categoria":"Comida"|null,"descripcion":"..."}',
      'Fechas relativas ("ayer", "hoy", "el lunes", "el 15", "la quincena") → fecha absoluta yyyy-MM-dd.',
      "Monto en dólares como número.",
      `Categoría: la más cercana de [${lista}] o null si no encaja.`,
      'Si falta el monto o no se entiende, devuelve {"error":"qué falta en una frase corta"}.',
    ].join("\n");
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
      if (modo === "registro") {
        const r = await chatCompletion(
          cfg,
          [
            { role: "system", content: promptRegistro() },
            { role: "user", content: mensaje },
          ],
          { maxTokens: 200, temperature: 0 },
        );
        const pago = parsePagoJSON(r.text);
        const m = matchCategoria(pago.categoria);
        setPend({ pago, categoriaId: m.id, categoriaNombre: m.nombre });
        push("assistant", "Revisa y confirma para guardar:", r.usage);
      } else {
        const ctx = await contextoMes();
        const historial: ChatMsg[] = msgs
          .slice(-8)
          .map((m) => ({ role: m.de, content: m.texto }));
        const r = await chatCompletion(
          cfg,
          [
            {
              role: "system",
              content: `Eres el asistente de RemindPay, app local de finanzas en USD. Respondes en español, breve y directo, sin adornos. Hablas SOLO de estos datos reales; no inventes cifras. Si te piden registrar un pago, pide monto y fecha en vez de adivinar.\n${ctx}`,
            },
            ...historial,
            { role: "user", content: mensaje },
          ],
          { maxTokens: 600, temperature: 0.4 },
        );
        push("assistant", r.text, r.usage);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    if (!pend) return;
    setBusy(true);
    setError(null);
    try {
      await createPayment({
        tipo: pend.pago.tipo,
        monto: pend.pago.monto,
        fecha: pend.pago.fecha,
        categoria_id: pend.categoriaId,
        contacto_id: null,
        descripcion: pend.pago.descripcion,
        recurrente: "none",
        comprobante_path: "",
        estado: pend.pago.fecha > todayLocal() ? "pendiente" : "pagado",
      });
      push(
        "assistant",
        `Guardado: ${pend.pago.descripcion || pend.pago.tipo} por ${fmtUSD(Math.round(pend.pago.monto * 100))} el ${fmtFecha(pend.pago.fecha)}.`,
      );
      setPend(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const sinConfig = cfg && !isAiConfigured(cfg);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <div>
        <h2 className="flex items-center gap-2 text-[26px] font-bold tracking-tight">
          <Icon name="sparkles" size={22} className="text-emerald-300" />
          Asistente
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Pregunta por tus datos o registra pagos con palabras. Solo habla con
          tu endpoint; nada sale de aquí sin tu config.
        </p>
      </div>

      {sinConfig && (
        <div className={`${cardCls} mt-4 flex items-center justify-between gap-3 p-4`}>
          <p className="text-sm text-zinc-400">
            Conecta tu endpoint (OpenAI-compatible) para activar el asistente.
          </p>
          <button onClick={onIrConfig} className={`${btnSecondary} shrink-0 !text-xs`}>
            Ir a Configuración
          </button>
        </div>
      )}

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {msgs.length === 0 && !pend && (
          <Empty
            icon="sparkles"
            title="¿En qué te ayudo?"
            hint="Prueba con una frase o toca un acceso rápido."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => {
                    setModo("registro");
                    setInput("Pagué ");
                  }}
                  className={btnSecondary}
                >
                  Registrar pago
                </button>
                <button
                  onClick={() => {
                    setModo("chat");
                    void enviar("¿Cómo voy este mes?");
                  }}
                  className={btnSecondary}
                >
                  ¿Cómo voy este mes?
                </button>
                <button
                  onClick={() => {
                    setModo("chat");
                    void enviar("¿Qué vence pronto?");
                  }}
                  className={btnSecondary}
                >
                  ¿Qué vence pronto?
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
              Confirmar pago
            </p>
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
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void confirmar()}
                disabled={busy}
                className={`${btnPrimary} flex-1`}
              >
                Confirmar y guardar
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

      <div className="mt-3 flex gap-1.5">
        {(["chat", "registro"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setModo(v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              modo === v
                ? "bg-emerald-500/15 text-emerald-300"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {v === "chat" ? "Conversar" : "Registrar pago"}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            modo === "registro"
              ? "Ej. Pagué $45 de luz ayer…"
              : "Ej. ¿Cuánto gasté en comida?…"
          }
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
        El asistente puede equivocarse: confirma montos y fechas antes de guardar.
      </p>
    </div>
  );
}
