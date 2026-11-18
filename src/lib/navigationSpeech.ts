/**
 * TTS da navegação do SOT — voz pt-BR mais natural e frases estilo Google Maps.
 * Usa a Web Speech API (melhor voz disponível no dispositivo).
 */

import { maneuverToPortuguese, type RouteStep } from "./navigationRouting";

const NAV_SPEECH_RATE = 0.98;
const NAV_SPEECH_PITCH = 1.02;

export type NavigationGuidanceStage = "far" | "near" | "now";

let voicesWarm = false;

/** Preferência de vozes brasileiras / portuguesas mais naturais. */
function scorePortugueseVoice(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;
  if (lang === "pt-br" || lang.startsWith("pt-br")) score += 40;
  else if (lang.startsWith("pt")) score += 20;
  else return -1;
  if (/google/.test(name)) score += 30;
  if (/microsoft/.test(name)) score += 22;
  if (/luciana|maria|francisca|helo[ií]sa|vit[oó]ria|fernanda|daniela|raquel|camila|neural|natural|online/.test(name)) {
    score += 18;
  }
  if (/female|feminina|mulher/.test(name)) score += 8;
  if (voice.localService) score += 2;
  return score;
}

export function pickNavigationPortugueseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = scorePortugueseVoice(voice);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best;
}

/** Carrega a lista de vozes (Chrome atrasa `getVoices` até `voiceschanged`). */
export function warmNavigationSpeechVoices(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (voicesWarm) return;
  voicesWarm = true;
  try {
    window.speechSynthesis.getVoices();
    const onChange = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
    };
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
  } catch {
    voicesWarm = false;
  }
}

/** Desbloqueia TTS após gesto do utilizador (necessário em Chrome/iOS). */
export function primeNavigationSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  warmNavigationSpeechVoices();
  try {
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(" ");
    utter.volume = 0.01;
    utter.lang = "pt-BR";
    const voice = pickNavigationPortugueseVoice();
    if (voice) utter.voice = voice;
    synth.speak(utter);
    window.setTimeout(() => {
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    }, 60);
  } catch {
    /* ignore */
  }
}

export function stopNavigationSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export type SpeakNavigationOptions = {
  /** Se true, cancela a fala actual antes (default true). */
  interrupt?: boolean;
};

/** Fala uma frase de navegação com a melhor voz pt-BR disponível. */
export function speakNavigation(text: string, options?: SpeakNavigationOptions): void {
  const phrase = text.trim();
  if (!phrase) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  warmNavigationSpeechVoices();
  try {
    const synth = window.speechSynthesis;
    if (options?.interrupt !== false) synth.cancel();
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.lang = "pt-BR";
    utter.rate = NAV_SPEECH_RATE;
    utter.pitch = NAV_SPEECH_PITCH;
    const voice = pickNavigationPortugueseVoice();
    if (voice) {
      utter.voice = voice;
      if (voice.lang) utter.lang = voice.lang;
    }
    // Pequeno atraso evita o bug do Chrome que engole a primeira sílaba após cancel().
    window.setTimeout(() => {
      try {
        if (synth.paused) synth.resume();
        synth.speak(utter);
      } catch {
        /* ignore */
      }
    }, 40);
  } catch {
    /* ignore */
  }
}

/** Distância falada de forma natural ("200 metros", "um quilômetro"). */
export function formatDistanceForSpeech(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "";
  if (meters < 45) return "";
  if (meters < 1000) {
    const rounded =
      meters < 100 ? Math.round(meters / 10) * 10 : Math.round(meters / 50) * 50;
    return `${rounded} metros`;
  }
  const km = meters / 1000;
  if (km < 1.05) return "um quilômetro";
  const roundedKm = Math.round(km * 10) / 10;
  const label =
    Number.isInteger(roundedKm) || Math.abs(roundedKm - Math.round(roundedKm)) < 0.05
      ? String(Math.round(roundedKm))
      : roundedKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${label} quilômetros`;
}

/**
 * Frase de voz estilo Google Maps, com distância quando faz sentido.
 * Ex.: "Em 200 metros, vire à direita na Rua X."
 */
export function buildNavigationGuidanceSpeech(
  step: RouteStep,
  distanceM: number,
  stage: NavigationGuidanceStage,
): string {
  const base = maneuverToPortuguese(step).replace(/\.$/, "");
  if (!base) return "";
  if (step.maneuver?.type === "arrive") {
    return stage === "now" ? "Você chegou ao destino." : "O destino está à frente.";
  }
  if (step.maneuver?.type === "depart") {
    return "Siga em frente.";
  }
  const action = `${base.charAt(0).toLowerCase()}${base.slice(1)}`;
  if (stage === "now" || distanceM < 45) {
    return `${base}.`;
  }
  const distLabel = formatDistanceForSpeech(distanceM);
  if (!distLabel) return `${base}.`;
  if (stage === "far") return `Em ${distLabel}, ${action}.`;
  return `Aproximando-se, ${action}.`;
}
