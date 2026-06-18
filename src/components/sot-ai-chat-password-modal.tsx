import { LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  isSotAiChatPasswordRequired,
  unlockSotAiChatSession,
  verifySotAiChatPassword,
} from "../lib/sotAiChatAccess";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function SotAiChatPasswordModal({ open, onClose, onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSotAiChatPasswordRequired()) {
      onSuccess();
      onClose();
      return;
    }
    if (!verifySotAiChatPassword(password)) {
      setError("Senha incorreta. Tenta de novo, marinheiro.");
      return;
    }
    unlockSotAiChatSession();
    onSuccess();
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[370] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sot-ai-password-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
            <LockKeyhole className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="sot-ai-password-title" className="text-lg font-semibold text-white">
              Assistente IA
            </h2>
            <p className="text-sm text-slate-400">Digite a senha para abrir o chat.</p>
          </div>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            autoComplete="current-password"
            placeholder="Senha"
            className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          />
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="text-slate-300 hover:text-white" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Entrar</Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
