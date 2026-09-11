// RemindPay — barra de título propia (ventana sin decoración nativa).
// Arrastre MANUAL con Pointer Capture: los eventos siguen llegando aunque
// el mouse salga de la ventana, y el drag termina siempre en pointerup.
// En vista previa web no se muestra.
import { useEffect, useState } from "react";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPreview } from "../lib/api";
import { Icon, Logo } from "./ui";

function WinBtn({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon: "minus" | "square" | "restore" | "x";
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      tabIndex={-1}
      className={`grid h-8 w-11 place-items-center rounded-md text-zinc-400 transition-colors ${
        danger
          ? "hover:bg-red-600 hover:text-white"
          : "hover:bg-zinc-700/70 hover:text-zinc-100"
      }`}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

interface DragState {
  startX: number;
  startY: number;
  winX: number;
  winY: number;
  scale: number;
}

export default function Titlebar() {
  const [max, setMax] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    if (isPreview()) return;
    const sync = async () => {
      try {
        setMax(await getCurrentWindow().isMaximized());
      } catch {
        /* sin ventana nativa */
      }
    };
    void sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  if (isPreview()) return null;

  const win = () => getCurrentWindow();

  async function toggleMax() {
    try {
      await win().toggleMaximize();
      setMax(await win().isMaximized());
    } catch {
      /* sin ventana nativa */
    }
  }

  async function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    try {
      const w = win();
      if (await w.isMaximized()) return;
      const pos = await w.outerPosition();
      const scale = await w.scaleFactor();
      setDrag({
        startX: e.screenX,
        startY: e.screenY,
        winX: pos.x,
        winY: pos.y,
        scale,
      });
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sin ventana nativa */
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    // Seguridad: si el botón ya no está presionado, terminar.
    if ((e.buttons & 1) === 0) {
      setDrag(null);
      return;
    }
    const x = Math.round(drag.winX + (e.screenX - drag.startX) * drag.scale);
    const y = Math.round(drag.winY + (e.screenY - drag.startY) * drag.scale);
    void win()
      .setPosition(new PhysicalPosition(x, y))
      .catch(() => {});
  }

  function terminarDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    setDrag(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ya liberado */
    }
  }

  return (
    <div
      data-tauri-drag-region
      onPointerDown={(e) => void onPointerDown(e)}
      onPointerMove={onPointerMove}
      onPointerUp={terminarDrag}
      onPointerCancel={terminarDrag}
      onDoubleClick={() => void toggleMax()}
      className="flex h-10 shrink-0 touch-none select-none items-center gap-2 border-b border-zinc-800/80 bg-zinc-900/70 py-1 pl-3 pr-1.5"
    >
      <span data-tauri-drag-region className="flex items-center gap-2">
        <Logo size={20} />
        <span
          data-tauri-drag-region
          className="text-xs font-semibold tracking-wide text-zinc-300"
        >
          RemindPay
        </span>
      </span>
      <div data-tauri-drag-region className="flex-1 self-stretch" />
      <div className="flex items-center">
        <WinBtn
          label="Minimizar"
          icon="minus"
          onClick={() => win().minimize().catch(() => {})}
        />
        <WinBtn
          label={max ? "Restaurar" : "Maximizar"}
          icon={max ? "restore" : "square"}
          onClick={() => void toggleMax()}
        />
        <WinBtn
          label="Cerrar"
          icon="x"
          danger
          onClick={() => win().close().catch(() => {})}
        />
      </div>
    </div>
  );
}
