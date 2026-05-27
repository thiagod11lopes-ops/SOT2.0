import { ShieldCheck, UserPlus } from "lucide-react";
import { CloudSyncIndicator } from "../components/cloud-sync-indicator";
import { SaidasHeaderEscalaPao } from "./saidas-header-escala-pao";
import { SaidasMobileHeaderStatus } from "./saidas-mobile-header-status";

type Props = {
  motoristaLogado: string | null;
  onLogout: () => void;
  onDetalheServico: () => void;
  onVistoria: () => void;
  onOcorrencias: () => void;
  onVistoriaAdministrativa: () => void;
  onCadastroMotorista: () => void;
};

/** Cabeçalho mobile reorganizado: marca, ferramentas, ações e sessão. */
export function SaidasMobileHeader({
  motoristaLogado,
  onLogout,
  onDetalheServico,
  onVistoria,
  onOcorrencias,
  onVistoriaAdministrativa,
  onCadastroMotorista,
}: Props) {
  return (
    <header
      className="saidas-mobile-header sticky top-0 z-20 w-full min-w-0 px-3 pt-[calc(0.35rem+var(--safe-top))] sm:px-4"
      style={{ paddingTop: "max(0.35rem, var(--safe-top))" }}
    >
      <div className="saidas-mobile-header-shell mx-auto max-w-lg">
        <div className="saidas-mobile-header-row saidas-mobile-header-row--top">
          <div className="saidas-mobile-header-brand">
            <span className="saidas-mobile-header-brand-kicker">SOT</span>
            <h1 className="saidas-mobile-header-brand-title">Saídas</h1>
          </div>
          <div className="saidas-mobile-header-toolbar" aria-label="Ferramentas">
            <SaidasHeaderEscalaPao />
            <button
              type="button"
              onClick={onVistoriaAdministrativa}
              className="saidas-mobile-header-icon-btn"
              aria-label="Vistoria administrativa — motorista e senha"
              title="Vistoria administrativa"
            >
              <ShieldCheck className="h-[1.05rem] w-[1.05rem] text-[hsl(var(--primary))]" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onCadastroMotorista}
              className="saidas-mobile-header-icon-btn"
              aria-label="Cadastro de motorista para acesso mobile"
              title="Cadastro de motorista (mobile)"
            >
              <UserPlus className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
            </button>
            <CloudSyncIndicator variant="iconOnly" />
          </div>
        </div>

        <nav className="saidas-mobile-header-row saidas-mobile-header-row--actions" aria-label="Ações rápidas">
          <button
            type="button"
            onClick={onDetalheServico}
            className="saidas-mobile-header-chip saidas-mobile-header-chip--detalhe"
          >
            Detalhe
          </button>
          <button
            type="button"
            onClick={onVistoria}
            className="saidas-mobile-header-chip saidas-mobile-header-chip--vistoria"
          >
            Vistoria
          </button>
          <button
            type="button"
            onClick={onOcorrencias}
            className="saidas-mobile-header-chip saidas-mobile-header-chip--ocorrencias"
          >
            Ocorrências
          </button>
        </nav>

        <div className="saidas-mobile-header-row saidas-mobile-header-row--session">
          <SaidasMobileHeaderStatus motoristaLogado={motoristaLogado} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
