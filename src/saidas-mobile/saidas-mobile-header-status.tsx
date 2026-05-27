import { CloudSyncIndicator } from "../components/cloud-sync-indicator";

type Props = {
  motoristaLogado: string | null;
  onLogout: () => void;
};

/** Painel compacto: sincronização + motorista logado (cabeçalho mobile). */
export function SaidasMobileHeaderStatus({ motoristaLogado, onLogout }: Props) {
  const logado = motoristaLogado?.trim() ?? "";

  return (
    <div className="saidas-mobile-header-status" aria-label="Estado da sessão">
      <CloudSyncIndicator variant="mobileStatus" />
      <div
        className={cnDriverRow(logado)}
        title={logado ? `Motorista logado: ${logado}` : "Nenhum motorista autenticado no mobile"}
      >
        <span className="saidas-mobile-header-status-driver-dot" aria-hidden />
        <span className="saidas-mobile-header-status-driver-label">Motorista</span>
        {logado ? (
          <>
            <span className="saidas-mobile-header-status-driver-value">{logado}</span>
            <button type="button" className="saidas-mobile-header-status-logout" onClick={onLogout}>
              Sair
            </button>
          </>
        ) : (
          <span className="saidas-mobile-header-status-driver-empty">Não logado</span>
        )}
      </div>
    </div>
  );
}

function cnDriverRow(logado: string): string {
  return logado
    ? "saidas-mobile-header-status-driver saidas-mobile-header-status-driver--active"
    : "saidas-mobile-header-status-driver";
}
