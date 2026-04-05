import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import paoImg from "../../pao.jpg";
import { EscalaPaoModal } from "../components/escala-pao-modal";
import { useEscalaPao } from "../context/escala-pao-context";
import { useMotoristaPao } from "../context/motorista-pao-context";
import { getProximoIntegranteEscalaAposHoje } from "../lib/escalaPaoStorage";
import { cn } from "../lib/utils";

/** Próximo a comprar pão (mesma lógica do cabeçalho principal); toque abre a Escala do Pão. */
export function SaidasHeaderEscalaPao() {
  const { nome } = useMotoristaPao();
  const { escala } = useEscalaPao();
  const [modalOpen, setModalOpen] = useState(false);

  const { linhaNome, dataRotulo, titulo } = useMemo(() => {
    const hoje = new Date();
    const prox = getProximoIntegranteEscalaAposHoje(escala, hoje);
    const fallback = nome.trim();
    if (prox) {
      const dataRotulo = format(prox.data, "dd/MM/yy", { locale: ptBR });
      return {
        linhaNome: prox.nome,
        dataRotulo,
        titulo: `${prox.nome} · ${dataRotulo}`,
      };
    }
    const linhaNome = fallback || "—";
    return { linhaNome, dataRotulo: null as string | null, titulo: linhaNome !== "—" ? linhaNome : undefined };
  }, [escala, nome]);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={modalOpen}
        aria-label="Próximo a comprar pão — abrir calendário"
        title={titulo}
        className={cn(
          "flex min-h-11 w-full max-w-[13rem] min-w-0 shrink flex-row items-center gap-1.5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 px-2 py-1.5 text-left transition active:scale-[0.98] min-[400px]:max-w-[15rem] min-[400px]:gap-2 min-[400px]:px-2.5",
        )}
      >
        <img
          src={paoImg}
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 shrink-0 object-contain min-[400px]:h-7 min-[400px]:w-7"
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-row flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="min-w-0 flex-1 break-words text-xs font-semibold leading-tight text-[hsl(var(--primary))] min-[400px]:text-sm">
            {linhaNome}
          </span>
          {dataRotulo ? (
            <span className="shrink-0 text-[0.65rem] font-medium tabular-nums leading-none text-[hsl(var(--muted-foreground))] min-[400px]:text-xs">
              {dataRotulo}
            </span>
          ) : null}
        </div>
      </button>
      <EscalaPaoModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
