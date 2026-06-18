import type { SotRagChunk } from "./sotRag";
import { formatSotRagContext } from "./sotRag";

export type SotAiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? "";
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL?.trim() || "gemini-2.0-flash";

export function isSotAiChatConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

export function buildOfflineRagAnswer(chunks: SotRagChunk[]): string {
  if (!chunks.length) {
    return "Não encontrei dados relevantes no banco do SOT para essa pergunta. Tente mencionar data, motorista, viatura ou setor.";
  }
  const lines = chunks.map((chunk) => `• **${chunk.category}:** ${chunk.text.replace(/\n/g, " ")}`);
  return [
    "Encontrei estes registros no sistema:",
    "",
    ...lines,
    "",
    isSotAiChatConfigured()
      ? ""
      : "_Para respostas em linguagem natural, configure `VITE_GEMINI_API_KEY` no arquivo `.env`._",
  ]
    .filter(Boolean)
    .join("\n");
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

export async function askSotAiChat(params: {
  question: string;
  ragChunks: SotRagChunk[];
  messages: SotRagChatTurn[];
}): Promise<string> {
  const ragContext = formatSotRagContext(params.ragChunks);

  if (!isSotAiChatConfigured()) {
    return buildOfflineRagAnswer(params.ragChunks);
  }

  const systemPrompt = `Você é o assistente de IA do SOT 2.0 (Sistema de Organização de Transporte).
Responda sempre em português do Brasil, de forma clara, objetiva e profissional.
Use APENAS as informações do contexto RAG abaixo sobre saídas, catálogos, escala do pão e avisos.
Se a pergunta não puder ser respondida com o contexto, diga explicitamente que não há dados suficientes no sistema.
Não invente registros, horários, motoristas ou viaturas.

=== CONTEXTO RAG (banco de dados do sistema) ===
${ragContext}
=== FIM DO CONTEXTO ===`;

  const contents = [
    ...params.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      })),
    { role: "user" as const, parts: [{ text: params.question }] },
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 1024,
        },
      }),
    },
  );

  const payload = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    const msg = payload.error?.message ?? `Erro HTTP ${response.status}`;
    throw new Error(msg);
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim();
  if (!text) {
    throw new Error("A IA não devolveu texto. Tente reformular a pergunta.");
  }
  return text;
}

export type SotRagChatTurn = Pick<SotAiChatMessage, "role" | "content">;
