import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Evita tela em branco quando algum componente falha na renderização;
 * o erro continua visível na consola (componentDidCatch).
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            boxSizing: "border-box",
            minHeight: "100vh",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "#f8fafc",
            color: "#0f172a",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", marginBottom: 12 }}>Erro ao carregar o SOT</h1>
          <p style={{ marginBottom: 8, color: "#475569" }}>
            Ocorreu um erro na interface. Atualize a página (F5). Se persistir, abra as ferramentas de programador (F12)
            → Consola e envie a mensagem de erro.
          </p>
          <pre
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#fff",
              border: "1px solid #e2e8f0",
              overflow: "auto",
              fontSize: 13,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
