import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed bg-[hsl(var(--muted))] p-8 text-sm text-slate-500">
          Nenhum conteúdo cadastrado para esta seção.
        </div>
      </CardContent>
    </Card>
  );
}
