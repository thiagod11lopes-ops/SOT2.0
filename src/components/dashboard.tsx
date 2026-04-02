import { ClipboardCheck, Megaphone, Truck, Users, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const stats = [
  { title: "Viaturas em Missão", value: "--", icon: Truck },
  { title: "Viaturas Disponíveis", value: "--", icon: Users },
  { title: "Vistorias Pendentes Hoje", value: "--", icon: ClipboardCheck },
  { title: "Alertas de Manutenção", value: "--", icon: Wrench },
];

export function Dashboard() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title}>
              <CardContent className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{item.title}</p>
                  <p className="mt-3 text-4xl font-bold">{item.value}</p>
                </div>
                <div className="rounded-lg bg-[hsl(var(--muted))] p-3">
                  <Icon className="h-5 w-5 text-slate-600" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Últimas Movimentações</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viatura</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Horário de Saída</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                    Nenhuma movimentação registrada.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-[hsl(var(--primary))]" />
              Avisos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed bg-[hsl(var(--muted))] p-6 text-sm text-slate-500">
              Nenhum aviso publicado.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
