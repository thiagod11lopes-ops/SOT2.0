const FALLBACK_MOTORISTA_LABEL = "Motorista escalado";

export function buildSiadDriverRequestSpeechText(motoristaEscalado: string | null | undefined): string {
  const nome = motoristaEscalado?.trim() || FALLBACK_MOTORISTA_LABEL;
  return `Motorista ${nome} Siadi solicitou viatura no bloco B`;
}

let speechPrimed = false;

/** Desbloqueia TTS no Chrome/Edge (exige interação prévia com a página). */
export function primeSiadDriverRequestSpeech(): void {
  if (speechPrimed) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechPrimed = true;
  try {
    const synth = window.speechSynthesis;
    synth.getVoices();
    const utter = new SpeechSynthesisUtterance(" ");
    utter.lang = "pt-BR";
    utter.volume = 0.01;
    synth.cancel();
    synth.speak(utter);
    window.setTimeout(() => {
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    }, 80);
  } catch {
    speechPrimed = false;
  }
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

export type SiadDriverRequestSpeechHandle = {
  stop: () => void;
  setText: (speechText: string) => void;
};

/** Repete a frase de alerta até `stop` ou retorno do cleanup. */
export function startSiadDriverRequestSpeechLoop(speechText: string): SiadDriverRequestSpeechHandle {
  const noop = () => undefined;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { stop: noop, setText: noop };
  }

  let cancelled = false;
  let retryTimeout: number | null = null;
  let resumeInterval: number | null = null;
  let voicesListener: (() => void) | null = null;
  let currentText = speechText.trim() || buildSiadDriverRequestSpeechText(null);
  let speakScheduled = false;

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
    speakScheduled = false;
    if (cancelled) return;

    const synth = window.speechSynthesis;
    try {
      synth.cancel();

      window.setTimeout(() => {
        if (cancelled) return;
        try {
          const utter = new SpeechSynthesisUtterance(currentText);
          utter.lang = "pt-BR";
          utter.rate = 0.23;
          utter.pitch = 1.08;
          const voice = pickFemalePortugueseVoice();
          if (voice) utter.voice = voice;
          utter.onend = () => scheduleNext(700);
          utter.onerror = () => scheduleNext(1200);
          synth.speak(utter);

          window.setTimeout(() => {
            if (cancelled) return;
            if (!synth.speaking && !synth.pending) {
              scheduleNext(900);
            }
          }, 900);
        } catch {
          scheduleNext(1200);
        }
      }, 50);
    } catch {
      scheduleNext(1200);
    }
  };

  const queueSpeak = () => {
    if (cancelled || speakScheduled) return;
    speakScheduled = true;
    window.setTimeout(speakOnce, 80);
  };

  const ensureVoicesReady = (onReady: () => void) => {
    const synth = window.speechSynthesis;
    if (synth.getVoices().length > 0) {
      onReady();
      return;
    }
    const onVoicesChanged = () => {
      synth.removeEventListener("voiceschanged", onVoicesChanged);
      voicesListener = null;
      onReady();
    };
    voicesListener = onVoicesChanged;
    synth.addEventListener("voiceschanged", onVoicesChanged);
    window.setTimeout(onReady, 500);
  };

  ensureVoicesReady(queueSpeak);

  resumeInterval = window.setInterval(() => {
    if (cancelled) return;
    try {
      const synth = window.speechSynthesis;
      if (synth.paused) synth.resume();
      if (!synth.speaking && !synth.pending && retryTimeout === null) {
        queueSpeak();
      }
    } catch {
      /* ignore */
    }
  }, 6000);

  return {
    setText(nextText: string) {
      currentText = nextText.trim() || buildSiadDriverRequestSpeechText(null);
    },
    stop() {
      cancelled = true;
      clearRetry();
      if (resumeInterval !== null) {
        window.clearInterval(resumeInterval);
        resumeInterval = null;
      }
      if (voicesListener) {
        try {
          window.speechSynthesis.removeEventListener("voiceschanged", voicesListener);
        } catch {
          /* ignore */
        }
        voicesListener = null;
      }
      stopSiadDriverRequestSpeech();
    },
  };
}
