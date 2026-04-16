import { useEffect, useId, useState } from "react";
import { verifyKmEditPassword } from "../lib/kmEditPassword";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function KmEditPasswordModal({ open, onOpenChange, onSuccess }: Props) {
  const titleId = useId();
  const inputId = useId();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSenha("");
      setErro(null);
    }
  }, [open]);

  if (!open) return null;

  function fechar() {
    onOpenChange(false);
  }

  function handleConfirmar() {
    const t = senha.trim();
    if (!t) {
      setErro("Introduza a senha.");
      return;
    }
    if (!verifyKmEditPassword(t)) {
      setErro("Senha incorreta.");
      return;
    }
    onSuccess();
    fechar();
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[320] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        className={cn(
          "w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-xl",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Os dados da saída devem ser editados no aplicativo do celular
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Digite a senha para editar aqui</p>
        <label htmlFor={inputId} className="mt-4 block text-sm font-medium text-[hsl(var(--foreground))]">
          Senha
        </label>
        <input
          id={inputId}
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
            setErro(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirmar();
          }}
          className={cn(
            "mt-1.5 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 font-mono text-sm text-[hsl(var(--foreground))] shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          )}
        />
        {erro ? <p className="mt-2 text-sm text-red-600">{erro}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirmar}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
