const FALLBACK_MOTORISTA_LABEL = "Motorista escalado";

export function buildSiadDriverRequestSpeechText(motoristaEscalado: string | null | undefined): string {
  const nome = motoristaEscalado?.trim() || FALLBACK_MOTORISTA_LABEL;
  return `Motorista (${nome}) SIAD solicitou viatura no bloco B`;
}

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
export function startSiadDriverRequestSpeechLoop(speechText: string): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return () => undefined;
  }

  let cancelled = false;
  let retryTimeout: number | null = null;
  let resumeInterval: number | null = null;
  let currentText = speechText.trim() || buildSiadDriverRequestSpeechText(null);

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
    const synth = window.speechSynthesis;
    try {
      if (synth.paused) synth.resume();
      if (synth.speaking) {
        scheduleNext(600);
        return;
      }

      const utter = new SpeechSynthesisUtterance(currentText);
      utter.lang = "pt-BR";
      utter.rate = 0.92;
      utter.pitch = 1.08;
      const voice = pickFemalePortugueseVoice();
      if (voice) utter.voice = voice;
      utter.onend = () => scheduleNext(500);
      utter.onerror = () => scheduleNext(1400);
      synth.speak(utter);
    } catch {
      scheduleNext(1400);
    }
  };

  const startSpeaking = () => {
    if (cancelled) return;
    currentText = speechText.trim() || buildSiadDriverRequestSpeechText(null);
    window.setTimeout(speakOnce, 120);
  };

  ensureVoicesReady(startSpeaking);

  resumeInterval = window.setInterval(() => {
    if (cancelled) return;
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
  }, 8000);

  return () => {
    cancelled = true;
    clearRetry();
    if (resumeInterval !== null) {
      window.clearInterval(resumeInterval);
      resumeInterval = null;
    }
    stopSiadDriverRequestSpeech();
  };
}
