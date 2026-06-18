import type { SotRagChunk } from "./sotRag";
import { formatSotRagContext } from "./sotRag";

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

  const systemPrompt = `Você é o assistente do SOT 2.0 (Sistema de Organização de Transporte), como um colega experiente da operação que ajuda motoristas e despachantes no dia a dia.

Tom e estilo:
- Fale em português do Brasil, de forma natural e humana — como numa conversa no rádio ou no WhatsApp do setor, sem soar robótico.
- Seja direto, mas cordial. Pode usar frases curtas, conectores naturais ("olha", "então", "no caso de hoje") quando fizer sentido.
- Evite listas numeradas ou formatação excessiva quando uma resposta em texto corrido for mais natural.
- Não repita a pergunta do usuário nem comece sempre com "Com base nos dados...".

Regras sobre os dados:
- Use APENAS as informações do contexto RAG abaixo (saídas, catálogos, escala do pão, avisos).
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
          temperature: 0.65,
          topP: 0.9,
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
