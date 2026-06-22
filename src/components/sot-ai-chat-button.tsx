import { Sparkles } from "lucide-react";
import { useState } from "react";
import { isSotAiChatUnlocked } from "../lib/sotAiChatAccess";
import { cn } from "../lib/utils";
import { SotAiChatModal } from "./sot-ai-chat-modal";
import { SotAiChatPasswordModal } from "./sot-ai-chat-password-modal";

export function SotAiChatButton({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const isMobile = variant === "mobile";

  function requestOpenChat() {
    if (isSotAiChatUnlocked()) {
      setChatOpen(true);
      return;
    }
    setPasswordOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={requestOpenChat}
        aria-haspopup="dialog"
        aria-expanded={chatOpen || passwordOpen}
        aria-label="Abrir assistente de inteligência artificial do SOT"
        title="Assistente IA — perguntas ao banco de dados"
        className={cn(
          isMobile
            ? "saidas-mobile-header-icon-btn saidas-mobile-header-icon-btn--ai"
            : "flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-xl border border-violet-300/35 bg-gradient-to-br from-cyan-500/20 via-sky-500/15 to-violet-500/25 text-cyan-700 shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 sm:h-[37px] sm:w-[37px] sm:rounded-2xl dark:text-cyan-200",
        )}
      >
        <Sparkles className={cn(isMobile ? "h-[1.05rem] w-[1.05rem]" : "h-4 w-4 sm:h-[1.15rem] sm:w-[1.15rem]")} aria-hidden />
      </button>
      <SotAiChatPasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onSuccess={() => setChatOpen(true)}
      />
      <SotAiChatModal open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
