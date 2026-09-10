import { useState } from "react";
import { setPin, verifyPin } from "../lib/api";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-center text-lg tracking-[0.5em] text-zinc-100 outline-none focus:border-emerald-500";

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
    <div className="flex h-full items-center justify-center bg-zinc-950">
      <form
        className="w-full max-w-xs rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <h1 className="text-xl font-bold tracking-tight">
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
          className={`${inputCls} mt-6`}
        />
        {modo === "crear" && (
          <input
            type="password"
            value={conf}
            onChange={(e) => setConf(digitos(e.target.value))}
            placeholder="Confirma"
            inputMode="numeric"
            className={`${inputCls} mt-2`}
          />
        )}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? "Verificando…" : modo === "crear" ? "Crear PIN" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
