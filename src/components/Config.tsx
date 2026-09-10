import { useEffect, useState } from "react";
import { getDataDir, isAutostart, isPreview, setAutostart } from "../lib/api";

export default function Config() {
  const [auto, setAuto] = useState(false);
  const [dir, setDir] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setAuto(await isAutostart());
        setDir(await getDataDir());
      } catch (e) {
        setMsg(String(e));
      }
    })();
  }, []);

  async function toggle() {
    const next = !auto;
    try {
      await setAutostart(next);
      setAuto(next);
      setMsg(null);
    } catch (e) {
      setMsg(String(e));
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight">Configuración</h2>
      <p className="mt-1 text-sm text-zinc-500">Comportamiento de la app</p>

      {msg && (
        <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {msg}
        </p>
      )}

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div>
            <p className="font-medium">Iniciar con Windows</p>
            <p className="text-sm text-zinc-500">
              RemindPay arranca solo para revisar tus avisos
              {isPreview() ? " (solo funciona en la app instalada)" : ""}
            </p>
          </div>
          <button
            onClick={() => void toggle()}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              auto ? "bg-emerald-500" : "bg-zinc-700"
            }`}
            aria-label="Iniciar con Windows"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                auto ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="font-medium">Tus datos</p>
          <p className="mt-1 break-all font-mono text-xs text-zinc-400">{dir}</p>
          <p className="mt-2 text-sm text-zinc-500">
            Un solo archivo SQLite + copias de respaldo (Fase 4). Cerrar la
            ventana minimiza a la bandeja; para salir usa el menú del icono.
          </p>
        </div>

        {isPreview() && (
          <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-4">
            <p className="font-medium text-amber-200">Vista previa</p>
            <p className="mt-1 text-sm text-amber-200/70">
              Los datos de ejemplo viven en memoria.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
            >
              Reiniciar datos de ejemplo
            </button>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="font-medium">RemindPay 0.1.0</p>
          <p className="mt-1 text-sm text-zinc-500">
            100% local · SQLite · USD · Sin nube ni cuentas
          </p>
        </div>
      </div>
    </div>
  );
}
