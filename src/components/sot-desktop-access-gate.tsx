import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSotDesktopAccess } from "../context/sot-desktop-access-context";
import { isPlausibleEmail, normalizeAccessEmail } from "../lib/sotDesktopAccess";
import { Button } from "./ui/button";

type PendingCadastro = { email: string; senha: string };

export function SotDesktopAccessGate() {
  const access = useSotDesktopAccess();
  const [email, setEmail] = useState("");
  const [nomeGuerra, setNomeGuerra] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingCadastro | null>(null);
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);

  const pessoa = useMemo(
    () => access.doc.pessoas.find((item) => item.email === normalizeAccessEmail(email)) ?? null,
    [access.doc.pessoas, email],
  );
  const sugestoes = access.sugestoes(email);
  useEffect(() => {
    if (access.locked && access.session?.email) setEmail(access.session.email);
  }, [access.locked, access.session?.email]);
  const primeiroAcesso = !access.doc.gestorEmail;
  const cadastrandoSenha = Boolean(pessoa && !pessoa.senhaCriada && !access.locked);
  const pedindoSenha = access.locked || Boolean(pessoa?.senhaCriada);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setInfo("");
    if (!isPlausibleEmail(email)) {
      setErro("Informe um e-mail válido.");
      return;
    }
    if (senha.trim().length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if ((primeiroAcesso || cadastrandoSenha) && senha !== confirma) {
      setErro("A confirmação da senha não confere.");
      return;
    }
    if (primeiroAcesso && !nomeGuerra.trim()) {
      setErro("Informe o nome de guerra.");
      return;
    }
    if (!primeiroAcesso && !pessoa) {
      setErro("Este e-mail não está autorizado a entrar.");
      return;
    }
    if (cadastrandoSenha) {
      setPending({ email: normalizeAccessEmail(email), senha });
      return;
    }
    setBusy(true);
    try {
      if (primeiroAcesso) await access.registrarGestor(email, nomeGuerra, senha);
      else await access.entrar(email, senha);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmarCadastro() {
    if (!pending) return;
    setBusy(true);
    setErro("");
    try {
      await access.cadastrarSenha(pending.email, pending.senha);
      setPending(null);
      setSenha("");
      setConfirma("");
    } catch (error) {
      setPending(null);
      setErro(error instanceof Error ? error.message : "Não foi possível criar a senha.");
    } finally {
      setBusy(false);
    }
  }

  async function recuperar() {
    setErro("");
    setInfo("");
    if (!isPlausibleEmail(email)) {
      setErro("Informe o e-mail para receber a recuperação.");
      return;
    }
    setBusy(true);
    try {
      await access.enviarRecuperacao(email);
      setInfo("Enviamos um link de recuperação para o e-mail informado.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível enviar a recuperação.");
    } finally {
      setBusy(false);
    }
  }

  if (access.session && !access.locked) return null;
  if (!access.ready) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 px-4">
        <p className="rounded-xl bg-[hsl(var(--card))] px-6 py-4 text-sm text-[hsl(var(--foreground))]">
          A preparar o acesso...
        </p>
      </div>
    );
  }
  if (access.loadError && !access.doc.gestorEmail) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 px-4">
        <div className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <p className="text-sm text-red-600">{access.loadError}</p>
          <Button type="button" className="mt-4" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
          {access.locked ? "Sessão bloqueada" : primeiroAcesso ? "Cadastrar gestor" : "Acesso ao sistema"}
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          {access.locked
            ? "O sistema ficou ocioso por mais de 10 minutos. Digite a senha para continuar. O e-mail permanece salvo."
            : primeiroAcesso
              ? "Ainda não há senha cadastrada. O primeiro e-mail criado será o gestor de todo o sistema."
              : cadastrandoSenha
                ? `E-mail autorizado. Cadastre a senha de ${pessoa?.nomeGuerra}. A primeira letra do nome de guerra identifica as alterações.`
                : "Digite o e-mail. Depois de 3 caracteres, os e-mails já usados aparecem para completar."}
        </p>
        {access.loadError ? <p className="mt-3 text-sm text-red-600">{access.loadError}</p> : null}

        <label className="mt-4 block text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="sot-access-email">
          E-mail
        </label>
        <input
          id="sot-access-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setSugestoesAbertas(true);
          }}
          onFocus={() => setSugestoesAbertas(true)}
          className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
          required
        />
        {sugestoesAbertas && sugestoes.length > 0 ? (
          <ul className="mt-1 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            {sugestoes.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))]/60"
                  onClick={() => {
                    setEmail(item);
                    setSugestoesAbertas(false);
                  }}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {primeiroAcesso ? (
          <>
            <label className="mt-3 block text-sm font-medium" htmlFor="sot-access-nome">
              Nome de guerra
            </label>
            <input
              id="sot-access-nome"
              value={nomeGuerra}
              onChange={(event) => setNomeGuerra(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              required
            />
          </>
        ) : null}

        <label className="mt-3 block text-sm font-medium" htmlFor="sot-access-senha">
          {pedindoSenha && !primeiroAcesso ? "Senha" : "Cadastrar senha"}
        </label>
        <input
          id="sot-access-senha"
          type="password"
          autoComplete={pedindoSenha && !primeiroAcesso ? "current-password" : "new-password"}
          value={senha}
          onChange={(event) => setSenha(event.target.value)}
          className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
          required
        />
        {primeiroAcesso || cadastrandoSenha ? (
          <>
            <label className="mt-3 block text-sm font-medium" htmlFor="sot-access-confirma">
              Confirmar senha
            </label>
            <input
              id="sot-access-confirma"
              type="password"
              autoComplete="new-password"
              value={confirma}
              onChange={(event) => setConfirma(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              required
            />
          </>
        ) : null}

        {erro ? <p className="mt-3 text-sm text-red-600">{erro}</p> : null}
        {info ? <p className="mt-3 text-sm text-[hsl(var(--foreground))]">{info}</p> : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {pedindoSenha && !primeiroAcesso ? (
            <Button type="button" variant="outline" onClick={() => void recuperar()} disabled={busy}>
              Esqueci a senha
            </Button>
          ) : null}
          <Button type="submit" disabled={busy || !access.ready}>
            {busy ? "Aguarde..." : primeiroAcesso || cadastrandoSenha ? "Cadastrar senha" : "Entrar"}
          </Button>
        </div>
      </form>

      {pending ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl">
            <p className="text-base font-semibold text-[hsl(var(--foreground))]">Email e senha autorizados</p>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => void confirmarCadastro()} disabled={busy}>
                {busy ? "Aguarde..." : "OK"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
