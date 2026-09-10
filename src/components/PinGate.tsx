import { useState } from "react";
import { setPin, verifyPin } from "../lib/api";
import { ErrorBox, Logo, btnPrimary } from "./ui";

const pinCls =
  "w-full rounded-xl border border-zinc-700/80 bg-zinc-800 px-3 py-2.5 text-center text-xl tracking-[0.5em] text-zinc-100 outline-none transition-colors focus:border-emerald-500/70";

/** Pantalla de bloqueo PIN (4–8 dígitos). */
export default function PinGate({
  modo,
  onOk,
}: {
  modo: "crear" | "pedir";
  onOk: () => void;
}) {
  const [pin, setPinVal] = useState("");
  const [conf, setConf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const digitos = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  async function enviar() {
    if (!/^\d{4,8}$/.test(pin)) {
      setError("El PIN debe tener de 4 a 8 dígitos");
      return;
    }
    if (modo === "crear" && pin !== conf) {
      setError("Los PIN no coinciden");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (modo === "crear") {
        await setPin(pin);
      } else if (!(await verifyPin(pin))) {
        setError("PIN incorrecto");
        setBusy(false);
        return;
      }
      onOk();
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }

  return (
    <div className="flex h-full items-center justify-center bg-zinc-950 p-4">
      <form
        className="anim-pop w-full max-w-xs rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-8 text-center shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <div className="flex justify-center">
          <Logo size={48} />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight">
          Remind<span className="text-emerald-400">Pay</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {modo === "crear"
            ? "Crea tu PIN de 4 a 8 dígitos"
            : "Escribe tu PIN para entrar"}
        </p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPinVal(digitos(e.target.value))}
          placeholder="••••"
          inputMode="numeric"
          autoFocus
          aria-label="PIN"
          className={`${pinCls} mt-6`}
        />
        {modo === "crear" && (
          <input
            type="password"
            value={conf}
            onChange={(e) => setConf(digitos(e.target.value))}
            placeholder="Confirma"
            inputMode="numeric"
            aria-label="Confirmar PIN"
            className={`${pinCls} mt-2`}
          />
        )}
        {error && (
          <div className="mt-3">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
        <button type="submit" disabled={busy} className={`${btnPrimary} mt-4 w-full`}>
          {busy ? "Verificando…" : modo === "crear" ? "Crear PIN" : "Entrar"}
        </button>
        <p className="mt-4 text-[11px] text-zinc-600">
          Tus datos nunca salen de este PC
        </p>
      </form>
    </div>
  );
}
