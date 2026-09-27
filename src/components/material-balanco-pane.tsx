import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileDown } from "lucide-react";
import { emprestimoVencido, quantidadeEmprestada, type MaterialPlanilha } from "../lib/materialControleStorage";

const UNIDADES = ["UN", "QTD", "KG", "PAR"] as const;
const ITEM_COLORS = ["#38bdf8", "#94a3b8", "#f97316", "#10b981", "#818cf8", "#fbbf24", "#e2e8f0", "#64748b"];

type Slice = { name: string; value: number; color: string };

function ChartCard({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.78)] p-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{kicker}</p>
      <h2 className="mt-1 text-sm font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Legend({ items }: { items: Slice[] }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
      {items.map((item) => (
        <li key={item.name} className="flex min-w-0 items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="min-w-0 flex-1 truncate text-[hsl(var(--muted-foreground))]">{item.name}</span>
          <span className="font-semibold tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div className="rounded-xl bg-[hsl(var(--foreground))] px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--background))] shadow-lg">
      {row?.name}: {row?.value}
    </div>
  );
}

function Ring({ data, center }: { data: Slice[]; center: string }) {
  const slices = data.filter((slice) => slice.value > 0);
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Sem dados ainda.</p>;
  }
  return (
    <div>
      <div className="relative h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="64%"
              outerRadius="90%"
              paddingAngle={3}
              cornerRadius={7}
              stroke="transparent"
            >
              {slices.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums leading-none">{total}</span>
          <span className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
            {center}
          </span>
        </div>
      </div>
      <Legend items={data} />
    </div>
  );
}

function HBars({ rows }: { rows: { nome: string; quantidade: number; color: string }[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Sem dados ainda.</p>;
  }
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="nome"
            width={92}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
          <Bar dataKey="quantidade" name="Quantidade" radius={[0, 8, 8, 0]} barSize={12}>
            {rows.map((row) => (
              <Cell key={row.nome} fill={row.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function dayStamp(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function MaterialBalancoPane({
  planilhas,
  nowMs,
  onPdf,
}: {
  planilhas: MaterialPlanilha[];
  nowMs: number;
  onPdf: () => void;
}) {
  const charts = useMemo(() => {
    const items = planilhas.flatMap((planilha) => planilha.items);
    const ativos = items.filter((item) => item.status === "ativo" && item.quantidade > 0).length;
    const zerados = items.filter((item) => item.status === "ativo" && item.quantidade <= 0).length;
    const baixas = items.filter((item) => item.status === "baixa").length;

    const ranked = items
      .filter((item) => item.status === "ativo")
      .map((item) => ({ nome: item.nome, quantidade: item.quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
    const top = ranked.slice(0, 6);
    const resto = ranked.slice(6).reduce((sum, item) => sum + item.quantidade, 0);
    const itemBars = [
      ...top.map((item, index) => ({
        nome: item.nome.length > 14 ? `${item.nome.slice(0, 13)}…` : item.nome,
        quantidade: item.quantidade,
        color: ITEM_COLORS[index % ITEM_COLORS.length]!,
      })),
      ...(resto > 0 ? [{ nome: "Outros", quantidade: resto, color: "#64748b" }] : []),
    ];

    const unitBars = UNIDADES.map((unidade, index) => ({
      nome: unidade,
      quantidade: items
        .filter((item) => item.status === "ativo" && (item.unidade || "UN") === unidade)
        .reduce((sum, item) => sum + item.quantidade, 0),
      color: ITEM_COLORS[index % ITEM_COLORS.length]!,
    }));

    let entradas = 0;
    let retiradas = 0;
    let emprestimos = 0;
    let devolucoes = 0;
    let noPrazo = 0;
    let vencidos = 0;
    let devolvidoQty = 0;
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(nowMs);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return date;
    });
    const byDay = new Map(days.map((date) => [dayStamp(date), { entrada: 0, retirada: 0 }]));

    for (const item of items) {
      for (const movimento of item.movimentos) {
        if (movimento.tipo === "entrada") entradas += 1;
        else retiradas += 1;
        const bucket = byDay.get(dayStamp(new Date(movimento.at)));
        if (!bucket) continue;
        if (movimento.tipo === "entrada") bucket.entrada += movimento.quantidade;
        else bucket.retirada += movimento.quantidade;
      }
      for (const emprestimo of item.emprestimos) {
        emprestimos += 1;
        if (emprestimo.devolvidoEm) {
          devolucoes += 1;
          devolvidoQty += emprestimo.quantidade;
        } else if (emprestimoVencido(emprestimo, nowMs)) vencidos += emprestimo.quantidade;
        else noPrazo += emprestimo.quantidade;
      }
    }

    const emEstoque = items.filter((item) => item.status === "ativo").reduce((sum, item) => sum + item.quantidade, 0);
    const emprestado = items.reduce((sum, item) => sum + quantidadeEmprestada(item), 0);
    const semana = days.map((date) => {
      const bucket = byDay.get(dayStamp(date))!;
      return {
        nome: date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        entrada: bucket.entrada,
        retirada: bucket.retirada,
      };
    });
    const lugares = planilhas.map((planilha, index) => ({
      nome: planilha.nome.length > 14 ? `${planilha.nome.slice(0, 13)}…` : planilha.nome,
      quantidade: planilha.items
        .filter((item) => item.status === "ativo")
        .reduce((sum, item) => sum + item.quantidade, 0),
      color: ITEM_COLORS[index % ITEM_COLORS.length]!,
    }));

    return {
      status: [
        { name: "Com stock", value: ativos, color: "#10b981" },
        { name: "Zerados", value: zerados, color: "#f59e0b" },
        { name: "Baixa", value: baixas, color: "#94a3b8" },
      ] satisfies Slice[],
      itemBars,
      unitBars,
      movimentos: [
        { name: "Entradas", value: entradas, color: "#10b981" },
        { name: "Retiradas", value: retiradas, color: "#f59e0b" },
        { name: "Empréstimos", value: emprestimos, color: "#f97316" },
        { name: "Devoluções", value: devolucoes, color: "#38bdf8" },
      ] satisfies Slice[],
      emprestimos: [
        { name: "No prazo", value: noPrazo, color: "#38bdf8" },
        { name: "Vencidos", value: vencidos, color: "#f97316" },
        { name: "Devolvidos", value: devolvidoQty, color: "#10b981" },
      ] satisfies Slice[],
      comparacao: [
        { nome: "Em estoque", quantidade: emEstoque, color: "#94a3b8" },
        { nome: "Emprestado", quantidade: emprestado, color: "#f97316" },
      ],
      emprestado,
      semana,
      lugares,
    };
  }, [planilhas, nowMs]);

  if (planilhas.length === 0) {
    return null;
  }

  const semanaVazia = charts.semana.every((day) => day.entrada === 0 && day.retirada === 0);

  return (
    <div className="space-y-3">
      <button type="button" className="material-app__primary w-full" onClick={onPdf}>
        <FileDown className="h-4 w-4" /> Gerar PDF
      </button>

      <ChartCard kicker="Situação" title="Itens do estoque">
        <Ring data={charts.status} center="itens" />
      </ChartCard>

      <ChartCard kicker="Quantidade" title="Maiores materiais">
        <HBars rows={charts.itemBars} />
      </ChartCard>

      <ChartCard kicker="Unidades" title="Total por unidade">
        <HBars rows={charts.unitBars.filter((row) => row.quantidade > 0)} />
      </ChartCard>

      <ChartCard kicker="Movimentos" title="Tudo o que foi registrado">
        <Ring data={charts.movimentos} center="registros" />
      </ChartCard>

      <ChartCard kicker="7 dias" title="Entradas e retiradas">
        {semanaVazia ? (
          <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Sem movimentos nesta semana.</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.semana} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
                <XAxis dataKey="nome" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
                <Bar dataKey="entrada" name="Entrada" fill="#10b981" radius={[6, 6, 0, 0]} barSize={10} />
                <Bar dataKey="retirada" name="Retirada" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <Legend
          items={[
            { name: "Entrada", value: charts.semana.reduce((sum, day) => sum + day.entrada, 0), color: "#10b981" },
            { name: "Retirada", value: charts.semana.reduce((sum, day) => sum + day.retirada, 0), color: "#f59e0b" },
          ]}
        />
      </ChartCard>

      <ChartCard kicker="Empréstimos" title={`${charts.emprestado} fora agora`}>
        <HBars rows={charts.comparacao} />
        <Ring data={charts.emprestimos} center="qtd" />
      </ChartCard>

      {charts.lugares.length > 1 ? (
        <ChartCard kicker="Lugares" title="Stock por organização">
          <HBars rows={charts.lugares} />
        </ChartCard>
      ) : null}
    </div>
  );
}
