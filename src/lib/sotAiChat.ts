import type { SotRagChunk } from "./sotRag";
import { RAG_BACKWARD_DAYS, RAG_FORWARD_DAYS, formatSotRagContext } from "./sotRag";
import { getSotAiOfflineIntro, getSotAiOfflineNoDataMessage, getSotAiSlangInstructions, SOT_AI_PERSONA_NAME } from "./sotAiPersona";

export type SotAiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? "";
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export function isSotAiChatConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

export function buildOfflineRagAnswer(chunks: SotRagChunk[]): string {
  if (!chunks.length) {
    return getSotAiOfflineNoDataMessage();
  }
  const lines = chunks.map((chunk) => `• **${chunk.category}:** ${chunk.text.replace(/\n/g, " ")}`);
  return [
    getSotAiOfflineIntro(),
    "",
    ...lines,
    "",
    isSotAiChatConfigured()
      ? ""
      : "_Pra resposta mais natural, configura `VITE_GEMINI_API_KEY` no `.env` — valeu!_",
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

  const systemPrompt = `Você é o ${SOT_AI_PERSONA_NAME}, assistente do SOT 2.0 (Sistema de Organização de Transporte).

${getSotAiSlangInstructions()}

Regras sobre os dados:
- Use APENAS as informações do contexto RAG abaixo (saídas, catálogos, escala do pão, avisos, resumos agregados da aba Estatística).
- As saídas detalhadas no contexto cobrem ${RAG_BACKWARD_DAYS} dias anteriores, hoje e ${RAG_FORWARD_DAYS} dias à frente, com cadastro completo de cada registro (horários de pedido e saída, motoristas, viaturas, setor, destino, KM, cancelamento, ocorrências, rubrica textual, etc.).
- Os resumos de Estatística trazem totais históricos, rankings, evolução mensal, destinos e fora do prazo (inclui baseline legado de jan–ago/2025 quando aplicável).
- Se não houver dados suficientes, diga isso de forma clara e sugira o que o usuário pode informar (data, motorista, viatura, setor).
- Nunca invente registros, horários, motoristas ou viaturas.

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
          temperature: 0.78,
          topP: 0.92,
          maxOutputTokens: 2048,
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
