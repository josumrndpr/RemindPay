// RemindPay — exportar CSV. En vista previa descarga el archivo en el
// navegador; instalada, pide la ruta y lo escribe Rust.
import { save } from "@tauri-apps/plugin-dialog";
import { isPreview, writeTextFile } from "./api";
import { csvCell } from "./format";
import type { Debt, Payment, Reminder } from "./types";

function descargar(nombre: string, contenido: string): void {
  const blob = new Blob(["﻿" + contenido], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function guardarCsv(
  nombre: string,
  contenido: string,
): Promise<"ok" | "cancelado"> {
  if (isPreview()) {
    descargar(nombre, contenido);
    return "ok";
  }
  const ruta = await save({
    defaultPath: nombre,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!ruta) return "cancelado";
  await writeTextFile(ruta, contenido);
  return "ok";
}

const usd = (cents: number) => (cents / 100).toFixed(2);

export function pagosCsv(items: Payment[]): string {
  const head = "fecha;tipo;descripcion;categoria;monto_usd";
  const rows = items.map((p) =>
    [
      csvCell(p.fecha),
      csvCell(p.tipo),
      csvCell(p.descripcion),
      csvCell(p.categoria),
      usd(p.monto_cents),
    ].join(";"),
  );
  return [head, ...rows].join("\n");
}

export function deudasCsv(items: Debt[]): string {
  const head = "persona;direccion;total_usd;saldo_usd;fecha_limite;estado;notas";
  const rows = items.map((d) =>
    [
      csvCell(d.persona),
      csvCell(d.direccion),
      usd(d.monto_total_cents),
      usd(d.saldo_cents),
      csvCell(d.fecha_limite),
      csvCell(d.estado),
      csvCell(d.notas),
    ].join(";"),
  );
  return [head, ...rows].join("\n");
}

export function recordatoriosCsv(items: Reminder[]): string {
  const head = "titulo;fecha_hora;repetir;hecho;detalle";
  const rows = items.map((r) =>
    [
      csvCell(r.titulo),
      csvCell(r.fecha_hora),
      csvCell(r.repetir),
      r.hecho ? "si" : "no",
      csvCell(r.detalle),
    ].join(";"),
  );
  return [head, ...rows].join("\n");
}
