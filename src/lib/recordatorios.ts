// RemindPay — completar un recordatorio. Si repite, crea la siguiente
// ocurrencia automáticamente. Compartido por el módulo y el panel de avisos.
import { createReminder, setReminderDone } from "./api";
import { siguienteRepeticion } from "./format";
import type { NewReminderInput, Reminder } from "./types";

export async function completarRecordatorio(r: Reminder): Promise<void> {
  await setReminderDone(r.id, true);
  if (r.repetir !== "none") {
    const input: NewReminderInput = {
      titulo: r.titulo,
      detalle: r.detalle,
      fecha_hora: siguienteRepeticion(r.fecha_hora, r.repetir),
      repetir: r.repetir,
      payment_id: r.payment_id,
      debt_id: r.debt_id,
      sonido: r.sonido,
      persistente: r.persistente,
    };
    await createReminder(input);
  }
}
