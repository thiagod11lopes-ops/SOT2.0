type Props = {
  motoristaLogado: string | null;
  onLogout: () => void;
};

/** Faixa de sessão do motorista no cabeçalho mobile. */
export function SaidasMobileHeaderStatus({ motoristaLogado, onLogout }: Props) {
  const logado = motoristaLogado?.trim() ?? "";

  return (
    <div
      className={
        logado
          ? "saidas-mobile-header-session saidas-mobile-header-session--active"
          : "saidas-mobile-header-session"
      }
      aria-label="Estado da sessão"
      title={logado ? `Motorista logado: ${logado}` : "Nenhum motorista autenticado no mobile"}
    >
      <span className="saidas-mobile-header-session-dot" aria-hidden />
      <span className="saidas-mobile-header-session-label">Motorista</span>
      {logado ? (
        <>
          <span className="saidas-mobile-header-session-value">{logado}</span>
          <button type="button" className="saidas-mobile-header-session-logout" onClick={onLogout}>
            Sair
          </button>
        </>
      ) : (
        <span className="saidas-mobile-header-session-empty">Não logado</span>
      )}
    </div>
  );
}
