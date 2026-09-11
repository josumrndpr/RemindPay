// RemindPay — sistema de diseño compartido (iconos + primitivas).
// Solo zinc/emerald/red/amber para que el tema claro siga funcionando.
import type { ReactNode } from "react";

// ── Iconos (stroke 24px) ──

const P: Record<string, string> = {
  dashboard:
    "M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z",
  pagos:
    "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10.5h18M7 15h4",
  deudas: "M4 8h13l-3.5-3.5M20 16H7l3.5 3.5",
  bell: "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 19c.6-3 2.9-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.7c1.9.5 3.1 1.9 3.5 4.3",
  sliders:
    "M4 7h9M17 7h3M4 17h3M11 17h9M15 5.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM9 15.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z",
  lock: "M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V8a4 4 0 1 1 8 0v3",
  plus: "M12 5v14M5 12h14",
  check: "M4 12.5l5 5L20 7",
  clock:
    "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2",
  download: "M12 4v11m0 0l-4-4m4 4l4-4M4.5 20h15",
  shield:
    "M12 3l7 2.8v5.4c0 4.8-3.4 7.6-7 9.3-3.6-1.7-7-4.5-7-9.3V5.8zM9.5 11.5l2 2 3.5-4",
  database:
    "M12 3.5c4.4 0 8 1 8 2.5S16.4 8.5 12 8.5 4 7.5 4 6 7.6 3.5 12 3.5zM4 6v12c0 1.5 3.6 2.5 8 2.5s8-1 8-2.5V6M4 12c0 1.5 3.6 2.5 8 2.5s8-1 8-2.5",
  sun: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19",
  moon: "M20 13.5A8 8 0 1 1 10.5 4 6.5 6.5 0 0 0 20 13.5z",
  alert: "M12 4L2.5 20h19zM12 10v4.5M12 17.6v.4",
  x: "M6 6l12 12M18 6L6 18",
  calendar:
    "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8.5 3v4M15.5 3v4",
  search: "M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM16 16l5 5",
  sparkles:
    "M12 3l1.9 5.7 5.6 1.3-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.3zM19 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9zM5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  minus: "M6 12h12",
  square: "M6.5 6.5h11v11h-11z",
  restore: "M8 8h12v12H8zM4 16V4h12",
  trendingUp: "M3.5 17l5.5-5.5 3.5 3.5 7-7M14.5 8H19.5v5",
  wallet:
    "M4 7a2 2 0 0 1 2-2h13v4M4 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1M16.5 14h.5",
};

export function Icon({
  name,
  size = 17,
  className = "",
  sw = 1.8,
}: {
  name: keyof typeof P;
  size?: number;
  className?: string;
  sw?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600"
      style={{
        width: size,
        height: size,
        boxShadow: "0 8px 20px -6px rgb(16 185 129 / .55)",
      }}
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#052e1f"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={P.bell} />
      </svg>
    </span>
  );
}

// ── Clases compartidas ──

export const inputCls =
  "w-full rounded-xl border border-zinc-700/80 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 shadow-inner outline-none transition-colors focus:border-emerald-500/70 focus:bg-zinc-800";

export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-[0_8px_24px_-8px_rgb(16_185_129/.55)] transition-all hover:bg-emerald-400 active:scale-[.98] disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 active:scale-[.98] disabled:opacity-50";

export const btnGhostSm =
  "text-sm text-zinc-400 transition-colors hover:text-zinc-100";

export const btnDangerSm =
  "text-sm text-zinc-500 transition-colors hover:text-red-300";

export const cardCls =
  "rounded-2xl border border-zinc-800/80 bg-zinc-900/60";

export const tableWrapCls =
  "overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40";

export const thCls =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

// ── Primitivas ──

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

type Tone = "green" | "red" | "amber" | "zinc";

const badgeTones: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-300",
  red: "bg-red-500/15 text-red-300",
  amber: "bg-amber-500/15 text-amber-300",
  zinc: "bg-zinc-800 text-zinc-300",
};

export function Badge({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const statTiles: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-300",
  red: "bg-red-500/15 text-red-300",
  amber: "bg-amber-500/15 text-amber-300",
  zinc: "bg-zinc-800 text-zinc-300",
};

export function Stat({
  icon,
  tone = "zinc",
  title,
  value,
  hint,
  accent,
}: {
  icon: keyof typeof P;
  tone?: Tone;
  title: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`${cardCls} anim-rise p-5 transition-all hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-xl`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {title}
        </p>
        <span
          className={`grid h-9 w-9 place-items-center rounded-xl ${statTiles[tone]}`}
        >
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p
        className={`tnum mt-2 text-[28px] font-semibold leading-none tracking-tight ${
          accent ? "text-emerald-300" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon: keyof typeof P;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-800 text-zinc-500">
        <Icon name={icon} size={22} />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-zinc-500">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p className="anim-rise flex items-start gap-2 rounded-xl border border-red-900 bg-red-950/50 px-3 py-2.5 text-sm text-red-300">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function OkBox({ children }: { children: ReactNode }) {
  return (
    <p className="anim-rise flex items-start gap-2 rounded-xl border border-emerald-800 bg-emerald-950/40 px-3 py-2.5 text-sm text-emerald-200">
      <Icon name="check" size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
