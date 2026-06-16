export const SIAD_DRIVER_REQUEST_SPEECH_TEXT =
  "Motorista (Motorista escalado) SIAD solicitou viatura no bloco B";

let voicesReady = false;

function ensureVoicesReady(onReady: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    voicesReady = true;
    onReady();
    return;
  }
  const onVoicesChanged = () => {
    voicesReady = true;
    window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
    onReady();
  };
  window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
  window.setTimeout(() => {
    if (!voicesReady) onReady();
  }, 400);
}

function pickFemalePortugueseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const ptVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("pt"));
  const femaleHint =
    /female|feminina|mulher|maria|luciana|vit[oó]ria|amanda|francisca|helo[ií]sa|fernanda|daniela|monica|m[oô]nica|raquel|camila/i;
  return ptVoices.find((voice) => femaleHint.test(voice.name)) ?? ptVoices[0] ?? null;
}

export function stopSiadDriverRequestSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/** Repete a frase de alerta até `stopSiadDriverRequestSpeech` ou retorno do cleanup. */
export function startSiadDriverRequestSpeechLoop(): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return () => undefined;
  }

  let cancelled = false;
  let retryTimeout: number | null = null;

  const clearRetry = () => {
    if (retryTimeout !== null) {
      window.clearTimeout(retryTimeout);
      retryTimeout = null;
    }
  };

  const scheduleNext = (delayMs: number) => {
    clearRetry();
    if (cancelled) return;
    retryTimeout = window.setTimeout(speakOnce, delayMs);
  };

  const speakOnce = () => {
    if (cancelled) return;
    try {
      const utter = new SpeechSynthesisUtterance(SIAD_DRIVER_REQUEST_SPEECH_TEXT);
      utter.lang = "pt-BR";
      utter.rate = 0.92;
      utter.pitch = 1.08;
      const voice = pickFemalePortugueseVoice();
      if (voice) utter.voice = voice;
      utter.onend = () => scheduleNext(500);
      utter.onerror = () => scheduleNext(1400);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {
      scheduleNext(1400);
    }
  };

  ensureVoicesReady(speakOnce);

  return () => {
    cancelled = true;
    clearRetry();
    stopSiadDriverRequestSpeech();
  };
}
