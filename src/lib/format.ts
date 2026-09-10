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
