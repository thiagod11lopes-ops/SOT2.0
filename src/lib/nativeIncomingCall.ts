import { Capacitor, registerPlugin } from "@capacitor/core";

type SotIncomingCallPlugin = {
  show(opts: { title?: string; body?: string }): Promise<void>;
  dismiss(): Promise<void>;
};

const SotIncomingCall = registerPlugin<SotIncomingCallPlugin>("SotIncomingCall");

export function canUseNativeIncomingCall(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** APK Android: notificação de chamada com full-screen (sem som). */
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
