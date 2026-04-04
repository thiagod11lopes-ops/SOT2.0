import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import paoImg from "../../pao.jpg";
import { useEscalaPao } from "../context/escala-pao-context";
import { useMotoristaPao } from "../context/motorista-pao-context";
import { getProximoIntegranteEscalaAposHoje } from "../lib/escalaPaoStorage";
import { EscalaPaoModal } from "./escala-pao-modal";
import { HEADER_INFO_CARD_CLASS } from "./header-info-card";
import { cn } from "../lib/utils";

/** Cartão no cabeçalho: próximo integrante (a partir de amanhã, saltando fins de semana e dias especiais) + data. Clique abre a Escala do Pão. */
export function HeaderPaoMotorista() {
  const { nome } = useMotoristaPao();
  const { escala } = useEscalaPao();
  const [modalOpen, setModalOpen] = useState(false);

  const { linhaNome, dataRotulo, titulo } = useMemo(() => {
    const hoje = new Date();
    const prox = getProximoIntegranteEscalaAposHoje(escala, hoje);
    const fallback = nome.trim();
    if (prox) {
      const dataRotulo = format(prox.data, "dd/MM/yyyy", { locale: ptBR });
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
        aria-label="Abrir escala do pão"
        className={cn(
          HEADER_INFO_CARD_CLASS,
          "max-w-[min(100%,14rem)] cursor-pointer flex-row items-center gap-2 text-left transition-opacity hover:opacity-90 sm:max-w-[min(100%,18rem)] sm:gap-2.5 md:max-w-[20rem]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]",
        )}
      >
        <img
          src={paoImg}
          alt=""
          width={37}
          height={37}
          className="h-[31px] w-[31px] shrink-0 object-contain sm:h-[37px] sm:w-[37px]"
          aria-hidden
        />
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-[0.58rem] font-semibold uppercase leading-none tracking-wider text-[hsl(var(--muted-foreground))] sm:text-[0.6rem]">
            Pão
          </span>
          <span
            className="flex min-w-0 w-full items-baseline justify-between gap-2 text-sm font-semibold leading-tight text-[hsl(var(--primary))] sm:text-base [text-shadow:0_1px_3px_rgba(0,0,0,0.2)]"
            title={titulo}
          >
            <span className="min-w-0 truncate">{linhaNome}</span>
            {dataRotulo ? (
              <span className="shrink-0 text-xs font-medium tabular-nums text-[hsl(var(--muted-foreground))] sm:text-sm">
                {dataRotulo}
              </span>
            ) : null}
          </span>
        </div>
      </button>
      <EscalaPaoModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
