import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import paoImg from "../../pao.jpg";
import { useEscalaPao } from "../context/escala-pao-context";
import { useMotoristaPao } from "../context/motorista-pao-context";
import { getProximoIntegranteEscalaAposHoje } from "../lib/escalaPaoStorage";
import { cn } from "../lib/utils";

/** Próximo a comprar pão: só a imagem visível; detalhes ao tocar na imagem. */
export function SaidasHeaderEscalaPao() {
  const { nome } = useMotoristaPao();
  const { escala } = useEscalaPao();
  const [detalhesVisiveis, setDetalhesVisiveis] = useState(false);

  const { linhaNome, dataRotulo, diaSemana, titulo } = useMemo(() => {
    const hoje = new Date();
    const prox = getProximoIntegranteEscalaAposHoje(escala, hoje);
    const fallback = nome.trim();
    if (prox) {
      const dataRotulo = format(prox.data, "dd/MM/yy", { locale: ptBR });
      const diaSemana = format(prox.data, "EEEE", { locale: ptBR });
      return {
        linhaNome: prox.nome,
        dataRotulo,
        diaSemana,
        titulo: `${prox.nome} · ${dataRotulo} · ${diaSemana}`,
      };
    }
    const linhaNome = fallback || "—";
    return {
      linhaNome,
      dataRotulo: null as string | null,
      diaSemana: null as string | null,
      titulo: linhaNome !== "—" ? linhaNome : undefined,
    };
  }, [escala, nome]);

  return (
    <div className="flex min-w-0 max-w-[min(100%,18rem)] shrink-0 flex-row items-start gap-1.5 min-[400px]:gap-2">
        <button
          type="button"
          onClick={() => setDetalhesVisiveis((v) => !v)}
          aria-expanded={detalhesVisiveis}
          aria-label={detalhesVisiveis ? "Ocultar detalhes da escala do pão" : "Mostrar detalhes da escala do pão"}
          title={titulo}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 transition active:scale-[0.98]",
            detalhesVisiveis && "ring-1 ring-[hsl(var(--primary))]/40",
          )}
        >
          <img
            src={paoImg}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain min-[400px]:h-8 min-[400px]:w-8"
            aria-hidden
          />
        </button>

        {detalhesVisiveis ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25 px-2 py-1.5 text-left min-[400px]:px-2.5">
            <div className="flex flex-row flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="min-w-0 flex-1 break-words text-xs font-semibold leading-tight text-[hsl(var(--primary))] min-[400px]:text-sm">
                {linhaNome}
              </span>
              {dataRotulo ? (
                <span className="shrink-0 text-[0.65rem] font-medium tabular-nums leading-none text-[hsl(var(--muted-foreground))] min-[400px]:text-xs">
                  {dataRotulo}
                </span>
              ) : null}
            </div>
            {diaSemana ? (
              <span className="text-[0.65rem] font-medium leading-none text-[hsl(var(--muted-foreground))] min-[400px]:text-xs">
                {diaSemana}
              </span>
            ) : null}
          </div>
        ) : null}
    </div>
  );
}
