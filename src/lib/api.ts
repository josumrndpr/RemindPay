// RemindPay — wrappers tipados de comandos Tauri (Rust)
import { invoke } from "@tauri-apps/api/core";

/** Prueba del puente JS → Rust. */
export function ping(msg: string): Promise<string> {
  return invoke<string>("ping", { msg });
}
