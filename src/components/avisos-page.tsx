import { useAvisos } from "../context/avisos-context";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function AvisosPage() {
  const { avisoPrincipal, fainasTexto, setAvisoPrincipal, setFainasTexto } = useAvisos();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Aviso principal</CardTitle>
          <p className="text-sm font-normal text-[hsl(var(--muted-foreground))]">
            Se preenchido, o texto aparece numa faixa fixa na base da <strong>página inicial</strong>, acima do
            telão de avisos em movimento (estilo telejornal). Deixe em branco para ocultar.
          </p>
        </CardHeader>
        <CardContent>
          <label className="sr-only" htmlFor="aviso-principal">
            Aviso principal
          </label>
          <textarea
            id="aviso-principal"
            value={avisoPrincipal}
            onChange={(e) => setAvisoPrincipal(e.target.value)}
            rows={4}
            placeholder="Ex.: Reunião geral hoje às 14h no auditório."
            className="min-h-[100px] w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fainas gerais</CardTitle>
          <p className="text-sm font-normal text-[hsl(var(--muted-foreground))]">
            Uma linha por faina. Esses itens entram no <strong>telão inferior</strong> da página inicial (texto em
            movimento) e no card <strong>Fainas Gerais</strong> do painel.
          </p>
        </CardHeader>
        <CardContent>
          <label className="sr-only" htmlFor="fainas-texto">
            Fainas gerais
          </label>
          <textarea
            id="fainas-texto"
            value={fainasTexto}
            onChange={(e) => setFainasTexto(e.target.value)}
            rows={8}
            placeholder={"Ex.: Apoio ao evento na Cidade Alta — 08h.\nVistoria no 3º Batalhão — 14h."}
            className="min-h-[160px] w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 py-2 font-mono text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          />
        </CardContent>
      </Card>

      <Card className="border-dashed bg-[hsl(var(--card))]">
        <CardHeader>
          <CardTitle className="text-base">Telão automático</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[hsl(var(--muted-foreground))] space-y-2">
          <p>
            O rodapé da página inicial exibe, em movimento contínuo, informações de{" "}
            <strong>Viaturas na oficina</strong>, <strong>Próximas trocas de óleo</strong>,{" "}
            <strong>Viaturas com pendência de limpeza</strong> e das <strong>fainas gerais</strong> configuradas
            acima — sem necessidade de repetir aqui o que já está cadastrado no sistema.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
