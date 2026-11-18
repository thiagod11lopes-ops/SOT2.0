import { Capacitor, registerPlugin } from "@capacitor/core";

type SotIncomingCallPlugin = {
  show(opts: { title?: string; body?: string }): Promise<void>;
  dismiss(): Promise<void>;
  startRingtone(): Promise<void>;
  stopRingtone(): Promise<void>;
};

const SotIncomingCall = registerPlugin<SotIncomingCallPlugin>("SotIncomingCall");

export function canUseNativeIncomingCall(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** APK Android: notificação de chamada com full-screen + toque de telefone. */
export async function showNativeIncomingLocationCall(args: {
  placa: string;
}): Promise<void> {
  if (!canUseNativeIncomingCall()) return;
  try {
    await SotIncomingCall.show({
      title: "Chamada do HNMD",
      body: `Enviar localização · ${args.placa}`,
    });
  } catch {
    /* ignore — PWA / permissão */
  }
}

export async function dismissNativeIncomingLocationCall(): Promise<void> {
  if (!canUseNativeIncomingCall()) return;
  try {
    await SotIncomingCall.dismiss();
  } catch {
    /* ignore */
  }
}

/** Toca o toque padrão de ligações do Android (o mesmo das chamadas). */
export async function startNativeIncomingCallRingtone(): Promise<boolean> {
  if (!canUseNativeIncomingCall()) return false;
  try {
    await SotIncomingCall.startRingtone();
    return true;
  } catch {
    return false;
  }
}

export async function stopNativeIncomingCallRingtone(): Promise<void> {
  if (!canUseNativeIncomingCall()) return;
  try {
    await SotIncomingCall.stopRingtone();
  } catch {
    /* ignore */
  }
}
