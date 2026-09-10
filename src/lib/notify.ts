// RemindPay — notificación nativa de Windows (plugin Tauri).
// En vista previa web no hace nada: el panel persistente basta.
import { isPreview } from "./api";

export async function avisar(titulo: string, cuerpo: string): Promise<void> {
  if (isPreview()) return;
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === "granted";
    if (ok) n.sendNotification({ title: titulo, body: cuerpo });
  } catch {
    /* sin notificaciones disponibles */
  }
}
