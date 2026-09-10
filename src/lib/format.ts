// RemindPay — formato USD + fechas locales (sin dependencias)

export function fmtUSD(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Hoy en hora local como yyyy-MM-dd (evita el corrimiento UTC de toISOString). */
export function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function monthLocal(): string {
  return todayLocal().slice(0, 7);
}

/** "2026-09" → "septiembre de 2026" */
export function monthLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  if (!y || !m) return mes;
  return new Date(y, m - 1, 1).toLocaleDateString("es-PR", {
    month: "long",
    year: "numeric",
  });
}

/** "2026-09-10" → "10 sep 2026" */
export function fmtFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Date(y, m - 1, d).toLocaleDateString("es-PR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Ahora en hora local como yyyy-MM-ddTHH:mm */
export function ahoraLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "2026-09-10T14:30" → "10 sep, 2:30 p. m." */
export function fmtFechaHora(fh: string): string {
  const m = fh.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return fh;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return (
    d.toLocaleDateString("es-PR", { day: "numeric", month: "short" }) +
    ", " +
    d.toLocaleTimeString("es-PR", { hour: "numeric", minute: "2-digit" })
  );
}

/** Suma minutos a un yyyy-MM-ddTHH:mm */
export function sumarMinutos(fh: string, min: number): string {
  const m = fh.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return fh;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + min);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Siguiente ocurrencia de un recordatorio repetitivo */
export function siguienteRepeticion(fh: string, repetir: string): string {
  const m = fh.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return fh;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (repetir === "daily") d.setDate(d.getDate() + 1);
  else if (repetir === "weekly") d.setDate(d.getDate() + 7);
  else if (repetir === "monthly") d.setMonth(d.getMonth() + 1);
  else return fh;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Para nombres de archivo: 2026-09-10-153022 */
export function ahoraArchivo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Segundos epoch → "10 sep 2026, 3:30 p. m." (0 → "—") */
export function fmtBackupFecha(secs: number): string {
  if (!secs) return "—";
  const d = new Date(secs * 1000);
  return (
    d.toLocaleDateString("es-PR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    d.toLocaleTimeString("es-PR", { hour: "numeric", minute: "2-digit" })
  );
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Celda CSV con comillas escapadas */
export function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
