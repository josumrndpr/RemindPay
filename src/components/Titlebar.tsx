// RemindPay — barra de título propia (ventana sin decoración nativa).
// Arrastre MANUAL (setPosition): el arrastre del SO falló en esta máquina,
// así no dependemos de él. En vista previa web no se muestra.
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

export default function Titlebar() {
  const [max, setMax] = useState(false);

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

  // Arrastre manual: guarda el punto inicial y mueve la ventana con el mouse.
  async function empezarArrastre(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    try {
      const w = win();
      if (await w.isMaximized()) return;
      const pos = await w.outerPosition();
      const scale = await w.scaleFactor();
      const startX = e.screenX;
      const startY = e.screenY;
      const mover = (ev: MouseEvent) => {
        const x = Math.round(pos.x + (ev.screenX - startX) * scale);
        const y = Math.round(pos.y + (ev.screenY - startY) * scale);
        void w
          .setPosition(new PhysicalPosition(x, y))
          .catch(() => {});
      };
      const soltar = () => {
        window.removeEventListener("mousemove", mover);
        window.removeEventListener("mouseup", soltar);
      };
      window.addEventListener("mousemove", mover);
      window.addEventListener("mouseup", soltar);
    } catch {
      /* sin ventana nativa */
    }
  }

  return (
    <div
      data-tauri-drag-region
      onMouseDown={(e) => void empezarArrastre(e)}
      onDoubleClick={() => void toggleMax()}
      className="flex h-10 shrink-0 select-none items-center gap-2 border-b border-zinc-800/80 bg-zinc-900/70 py-1 pl-3 pr-1.5"
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
