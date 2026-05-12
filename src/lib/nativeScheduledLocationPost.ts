import { registerPlugin } from "@capacitor/core";

export type NativeScheduledLocationPostStart = {
  url: string;
  token: string;
  placa: string;
  departureId: string;
  intervalMs: number;
};

export interface NativeScheduledLocationPostPlugin {
  start(opts: NativeScheduledLocationPostStart): Promise<void>;
  stop(): Promise<void>;
  updateToken(opts: { token: string }): Promise<void>;
}

/**
 * Android: envio HTTP periódico fora do WebView (AlarmManager + FusedLocation).
 * Só registado no MainActivity Android — não chamar em web/iOS.
 */
export const NativeScheduledLocationPost = registerPlugin<NativeScheduledLocationPostPlugin>(
  "NativeScheduledLocationPost",
);
