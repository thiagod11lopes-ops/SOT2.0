import { useEffect, useId, useState } from "react";
import { DEPARTURE_EDIT_LOGINS, resolveDepartureEditLogin } from "../lib/departureEditAccess";
import { sotFormInputClass, sotFormSelectClass } from "../lib/sotFormFieldClasses";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (login: string) => void;
};

export function DepartureEditLoginModal({ open, onOpenChange, onSuccess }: Props) {
  const titleId = useId();
  const loginId = useId();
  const senhaId = useId();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLogin("");
      setSenha("");
      setErro(null);
    }
  }, [open]);

  if (!open) return null;

  function fechar() {
    onOpenChange(false);
  }

  function handleConfirmar() {
    if (!login.trim() || !senha.trim()) {
      setErro("Selecione o login e informe a senha.");
      return;
    }
    const resolved = resolveDepartureEditLogin(login, senha);
    if (!resolved) {
      setErro("Login ou senha incorretos.");
      return;
    }
    onSuccess(resolved);
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
        className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold leading-snug text-[hsl(var(--foreground))]">
          Editar saída
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Selecione o login e informe a senha para abrir a edição.
        </p>
        <label htmlFor={loginId} className="mt-4 block text-sm font-medium text-[hsl(var(--foreground))]">
          Login
        </label>
        <select
          id={loginId}
          value={login}
          onChange={(e) => {
            setLogin(e.target.value);
            setErro(null);
          }}
          className={cn(sotFormSelectClass, "mt-1.5")}
        >
          <option value="">Selecione…</option>
          {DEPARTURE_EDIT_LOGINS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <label htmlFor={senhaId} className="mt-4 block text-sm font-medium text-[hsl(var(--foreground))]">
          Senha
        </label>
        <input
          id={senhaId}
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
          className={cn(sotFormInputClass, "mt-1.5 font-mono")}
        />
        {erro ? <p className="mt-2 text-sm text-red-600">{erro}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirmar}>
            Entrar
          </Button>
        </div>
      </div>
    </div>
  );
}
