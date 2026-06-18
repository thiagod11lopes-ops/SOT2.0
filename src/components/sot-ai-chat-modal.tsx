import { Bot, Loader2, SendHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSotRagKnowledge } from "../hooks/useSotRagKnowledge";
import { askSotAiChat, isSotAiChatConfigured, type SotAiChatMessage } from "../lib/sotAiChat";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const SUGGESTED_QUESTIONS = [
  "Quais saídas existem hoje?",
  "Quem leva o pão em seguida?",
  "Liste os motoristas cadastrados",
  "Resumo das saídas administrativas recentes",
];

function newMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SotAiChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rag = useSotRagKnowledge();
  const [messages, setMessages] = useState<SotAiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const geminiReady = isSotAiChatConfigured();

  const welcomeMessage = useMemo<SotAiChatMessage>(
    () => ({
      id: "welcome",
      role: "assistant",
      content: geminiReady
        ? "Olá! Sou a IA do SOT 2.0. Pergunte sobre saídas, motoristas, viaturas, escala do pão ou avisos — consulto o banco de dados do sistema em tempo real."
        : "Olá! Sou a IA do SOT 2.0. Posso buscar dados no sistema (modo RAG). Para respostas em linguagem natural, configure `VITE_GEMINI_API_KEY` no `.env`.",
    }),
    [geminiReady],
  );

  useEffect(() => {
    if (!open) return;
    setMessages([welcomeMessage]);
    setInput("");
    setError(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open, welcomeMessage]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  async function sendQuestion(raw: string) {
    const question = raw.trim();
    if (!question || loading) return;

    const userMessage: SotAiChatMessage = { id: newMessageId(), role: "user", content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const ragChunks = rag.retrieve(question, 10);
      const history = [...messages, userMessage].filter((m) => m.id !== "welcome");
      const answer = await askSotAiChat({
        question,
        ragChunks,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages((prev) => [...prev, { id: newMessageId(), role: "assistant", content: answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao consultar a IA.";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: "assistant",
          content: `Não consegui processar a pergunta: ${msg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[360] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sot-ai-chat-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
        aria-label="Fechar assistente IA"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex h-[min(92dvh,52rem)] w-full max-w-3xl flex-col overflow-hidden",
          "rounded-t-[1.75rem] border border-white/10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 shadow-[0_40px_120px_-20px_rgba(56,189,248,0.35)] sm:rounded-[1.75rem]",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-20 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />

        <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-500 shadow-lg shadow-cyan-500/30">
              <Sparkles className="h-5 w-5 text-white" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="sot-ai-chat-title" className="truncate text-base font-bold text-white sm:text-lg">
                Assistente IA — SOT 2.0
              </h2>
              <p className="truncate text-xs text-cyan-100/80 sm:text-sm">
                {geminiReady ? "RAG + Gemini · dados ao vivo" : "RAG local · configure Gemini para NLU"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Fechar chat"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div ref={scrollRef} className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-2.5", message.role === "user" ? "justify-end" : "justify-start")}
            >
              {message.role === "assistant" ? (
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-cyan-200">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
              ) : null}
              <div
                className={cn(
                  "max-w-[min(100%,42rem)] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                  message.role === "user"
                    ? "bg-gradient-to-br from-cyan-500 to-sky-600 text-white"
                    : "border border-white/10 bg-white/[0.06] text-slate-100",
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-cyan-100/80">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Consultando banco de dados e gerando resposta…
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </div>

        <div className="relative shrink-0 border-t border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur sm:px-5">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => void sendQuestion(q)}
                className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendQuestion(input);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              disabled={loading}
              placeholder="Pergunte sobre saídas, motoristas, viaturas…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuestion(input);
                }
              }}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-600 text-white hover:brightness-110 disabled:opacity-50"
              aria-label="Enviar pergunta"
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
