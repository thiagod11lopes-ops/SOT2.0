import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import paoImg from "../../pao.jpg";
import { Button } from "../components/ui/button";
import { useEscalaPao } from "../context/escala-pao-context";
import { useMotoristaPao } from "../context/motorista-pao-context";
import { getProximoIntegranteEscalaAposHoje } from "../lib/escalaPaoStorage";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";

/** Próximo a comprar pão: ícone fixo; toque abre modal com o nome (e data) e OK para fechar. */
export function SaidasHeaderEscalaPao() {
  const { nome } = useMotoristaPao();
  const { escala } = useEscalaPao();
  const [modalOpen, setModalOpen] = useState(false);

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
    <>
      <div className="flex min-w-0 shrink-0 flex-row items-center gap-1.5 min-[400px]:gap-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={modalOpen}
          aria-label="Abrir escala do pão"
          title={titulo}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 transition active:scale-[0.98]"
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
      </div>

      {modalOpen ? (
        <div
          className={`${MOBILE_MODAL_OVERLAY_CLASS} z-[450]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="escala-pao-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2
              id="escala-pao-modal-title"
              className="mb-3 text-lg font-semibold text-[hsl(var(--foreground))]"
            >
              Escala do pão
            </h2>
            <p className="text-base font-bold leading-snug text-[hsl(var(--primary))]">{linhaNome}</p>
            {dataRotulo ? (
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {dataRotulo}
                {diaSemana ? ` · ${diaSemana}` : ""}
              </p>
            ) : null}
            <Button
              type="button"
              className="mt-5 min-h-11 w-full rounded-xl font-semibold"
              onClick={() => setModalOpen(false)}
            >
              OK
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
