import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Evita ecrã em branco na área RDV se algum sub-componente falhar na renderização.
 */
export class RdvRouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[RDV]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
          <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">Relatório Diário de Viaturas</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Ocorreu um erro ao mostrar esta área. Atualize a página (F5). Se voltar a acontecer, abra a consola (F12) e
            envie a mensagem abaixo.
          </p>
          <pre className="max-h-64 overflow-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 text-xs text-[hsl(var(--foreground))]">
            {this.state.error.message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
            <Button type="button" variant="outline" onClick={() => (window.location.hash = "")}>
              Voltar ao sistema
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
