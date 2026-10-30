import { useState, type FormEvent } from "react";
import { useSotDesktopAccess } from "../context/sot-desktop-access-context";
import { Button } from "./ui/button";

export function SettingsGestorSection({ panelClass }: { panelClass: string }) {
  const access = useSotDesktopAccess();
  const [email, setEmail] = useState("");
  const [nomeGuerra, setNomeGuerra] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setBusy(true);
    try {
      await access.adicionarEmail(email, nomeGuerra);
      setEmail("");
      setNomeGuerra("");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível autorizar o e-mail.");
    } finally {
      setBusy(false);
    }
  }

  async function remover(alvo: string) {
    setErro("");
    setBusy(true);
    try {
      await access.removerEmail(alvo);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível retirar o e-mail.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={panelClass} aria-labelledby="settings-heading-gestor">
      <h3 id="settings-heading-gestor" className="text-base font-semibold text-[hsl(var(--foreground))]">
        Gestor
      </h3>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        Autorize os e-mails que podem entrar no sistema do computador. O nome de guerra define a letra marcada nas
        saídas. Este acesso não altera o SOT mobile.
      </p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          Nome de guerra
          <input
            value={nomeGuerra}
            onChange={(event) => setNomeGuerra(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2"
            required
          />
        </label>
        <Button type="submit" disabled={busy}>
          Adicionar
        </Button>
      </form>
      {erro ? <p className="mt-3 text-sm text-red-600">{erro}</p> : null}
      <ul className="mt-4 divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))]">
        {access.doc.pessoas.map((pessoa) => (
          <li key={pessoa.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              <strong>{pessoa.nomeGuerra}</strong> · {pessoa.email}
              {pessoa.email === access.doc.gestorEmail ? " · gestor" : pessoa.senhaCriada ? " · senha criada" : " · aguardando senha"}
            </span>
            {pessoa.email === access.doc.gestorEmail ? null : (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void remover(pessoa.email)}>
                Retirar
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
