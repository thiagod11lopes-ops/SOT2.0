import { ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { AlarmeDiarioItem } from "../context/avisos-context";
import { useAvisos } from "../context/avisos-context";
import { getCurrentDatePtBr, normalizeDatePtBr, parsePtBrToDate } from "../lib/dateFormat";
import { cn } from "../lib/utils";
import type { AvisoGeralItem } from "../types/aviso-geral";
import { normalize24hTime, parseHhMm } from "../lib/timeInput";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

function sortAlarmesPorHora(rows: AlarmeDiarioItem[]): AlarmeDiarioItem[] {
  return [...rows].sort((a, b) => {
    const pa = parseHhMm(a.hora);
    const pb = parseHhMm(b.hora);
    const ma = pa ? pa.h * 60 + pa.m : 9999;
    const mb = pb ? pb.h * 60 + pb.m : 9999;
    if (ma !== mb) return ma - mb;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

function AvisosCollapsibleCard({
  title,
  open,
  onToggle,
  children,
  className,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-[hsl(var(--muted))]/45"
        aria-expanded={open}
        aria-label={open ? `Recolher: ${title}` : `Expandir: ${title}`}
      >
        <span className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</span>
        <ChevronRight
          className={cn("h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200", open && "rotate-90")}
          aria-hidden
        />
      </button>
      {open ? (
        <CardContent className="border-t border-[hsl(var(--border))] pt-5">{children}</CardContent>
      ) : null}
    </Card>
  );
}

export function AvisosPage() {
  const {
    avisoPrincipal,
    fainasTexto,
    avisosGeraisItens,
    setAvisoPrincipal,
    setFainasTexto,
    setAvisosGeraisItens,
    alarmesDiarios,
    addAlarmeDiario,
    updateAlarmeDiario,
    removeAlarmeDiario,
  } = useAvisos();

  const [open, setOpen] = useState({
    avisoPrincipal: false,
    fainas: false,
    alarmeDiario: false,
    alarmesAtivos: false,
    avisosGerais: false,
  });

  const [draftNome, setDraftNome] = useState("");
  const [draftHora, setDraftHora] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editHora, setEditHora] = useState("");

  const [draftAgTexto, setDraftAgTexto] = useState("");
  const [draftAgIni, setDraftAgIni] = useState(() => getCurrentDatePtBr());
  const [draftAgFim, setDraftAgFim] = useState("");
  const [editingAgId, setEditingAgId] = useState<string | null>(null);
  const [editAgTexto, setEditAgTexto] = useState("");
  const [editAgIni, setEditAgIni] = useState("");
  const [editAgFim, setEditAgFim] = useState("");

  const toggle = useCallback((key: keyof typeof open) => {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }, []);

  const podeAtivarNovo = useMemo(
    () => draftNome.trim().length > 0 && parseHhMm(draftHora) !== null,
    [draftNome, draftHora],
  );

  const alarmesOrdenados = useMemo(() => sortAlarmesPorHora(alarmesDiarios), [alarmesDiarios]);

  const handleAtivar = useCallback(() => {
    if (!podeAtivarNovo) return;
    addAlarmeDiario(draftNome, draftHora);
    setDraftNome("");
    setDraftHora("");
  }, [podeAtivarNovo, draftNome, draftHora, addAlarmeDiario]);

  const iniciarEdicao = useCallback((a: AlarmeDiarioItem) => {
    setEditingId(a.id);
    setEditNome(a.nome);
    setEditHora(a.hora);
  }, []);

  const cancelarEdicao = useCallback(() => {
    setEditingId(null);
  }, []);

  const salvarEdicao = useCallback(() => {
    if (!editingId) return;
    if (!editNome.trim() || parseHhMm(editHora) === null) return;
    updateAlarmeDiario(editingId, { nome: editNome, hora: editHora });
    setEditingId(null);
  }, [editingId, editNome, editHora, updateAlarmeDiario]);

  const handleExcluir = useCallback(
    (id: string, nome: string) => {
      if (!window.confirm(`Excluir o alarme "${nome}"?`)) return;
      if (editingId === id) setEditingId(null);
      removeAlarmeDiario(id);
    },
    [editingId, removeAlarmeDiario],
  );

  const podeIncluirAvisoGeral = useMemo(() => {
    const t = draftAgTexto.trim();
    if (!t) return false;
    const ini = draftAgIni.trim();
    if (!ini || !parsePtBrToDate(ini)) return false;
    const f = draftAgFim.trim();
    if (f && !parsePtBrToDate(f)) return false;
    return true;
  }, [draftAgTexto, draftAgIni, draftAgFim]);

  const incluirAvisoGeralNaTabela = useCallback(() => {
    if (!podeIncluirAvisoGeral) return;
    const ini = normalizeDatePtBr(draftAgIni.trim());
    const f = draftAgFim.trim();
    setAvisosGeraisItens((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        texto: draftAgTexto.trim(),
        dataInicio: ini,
        dataFim: f ? normalizeDatePtBr(f) : "",
      },
    ]);
    setDraftAgTexto("");
    setDraftAgFim("");
    setDraftAgIni(getCurrentDatePtBr());
  }, [podeIncluirAvisoGeral, draftAgTexto, draftAgIni, draftAgFim, setAvisosGeraisItens]);

  const iniciarEdicaoAvisoGeral = useCallback((ag: AvisoGeralItem) => {
    setEditingAgId(ag.id);
    setEditAgTexto(ag.texto);
    setEditAgIni(ag.dataInicio);
    setEditAgFim(ag.dataFim);
  }, []);

  const cancelarEdicaoAvisoGeral = useCallback(() => {
    setEditingAgId(null);
  }, []);

  const salvarEdicaoAvisoGeral = useCallback(() => {
    if (!editingAgId) return;
    const t = editAgTexto.trim();
    if (!t) return;
    const ini = editAgIni.trim();
    const f = editAgFim.trim();
    if (!ini && !f) {
      setAvisosGeraisItens((prev) =>
        prev.map((x) => (x.id === editingAgId ? { ...x, texto: t, dataInicio: "", dataFim: "" } : x)),
      );
      setEditingAgId(null);
      return;
    }
    if (!ini || !parsePtBrToDate(ini)) return;
    if (f && !parsePtBrToDate(f)) return;
    setAvisosGeraisItens((prev) =>
      prev.map((x) =>
        x.id === editingAgId
          ? {
              ...x,
              texto: t,
              dataInicio: normalizeDatePtBr(ini),
              dataFim: f ? normalizeDatePtBr(f) : "",
            }
          : x,
      ),
    );
    setEditingAgId(null);
  }, [editingAgId, editAgTexto, editAgIni, editAgFim, setAvisosGeraisItens]);

  const removeAvisoGeral = useCallback(
    (id: string) => {
      if (editingAgId === id) setEditingAgId(null);
      setAvisosGeraisItens((prev) => prev.filter((x) => x.id !== id));
    },
    [editingAgId, setAvisosGeraisItens],
  );

  const handleExcluirAvisoGeral = useCallback(
    (id: string, trecho: string) => {
      const label = trecho.trim().slice(0, 48) || "este aviso";
      if (!window.confirm(`Excluir o aviso "${label}${trecho.trim().length > 48 ? "…" : ""}"?`)) return;
      removeAvisoGeral(id);
    },
    [removeAvisoGeral],
  );

  return (
    <div className="space-y-4">
      <AvisosCollapsibleCard
        title="Aviso principal"
        open={open.avisoPrincipal}
        onToggle={() => toggle("avisoPrincipal")}
      >
        <p className="mb-4 text-sm font-normal text-[hsl(var(--muted-foreground))]">
          Se preenchido, o texto aparece numa faixa fixa na base da <strong>página inicial</strong>, acima do telão
          de avisos em movimento (estilo telejornal). Deixe em branco para ocultar.
        </p>
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
      </AvisosCollapsibleCard>

      <AvisosCollapsibleCard
        title="Avisos Gerais"
        open={open.avisosGerais}
        onToggle={() => toggle("avisosGerais")}
        className="border-dashed bg-[hsl(var(--card))]"
      >
        <p className="mb-4 text-sm font-normal text-[hsl(var(--muted-foreground))]">
          Preencha o formulário abaixo e clique em <strong>Adicionar à tabela</strong>. O texto só aparece no telão da
          página inicial entre a <strong>data inicial</strong> e a <strong>data final</strong> (inclusive); se a final
          estiver vazia, vale só o dia da inicial. Itens <strong>sem datas</strong> (cadastro antigo) continuam sempre no
          telão. Após o último dia do período, o aviso é <strong>removido automaticamente</strong> desta lista.
        </p>

        <div className="mb-6 space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">Incluir novo aviso</p>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="ag-novo-texto">
              Texto no telão
            </label>
            <textarea
              id="ag-novo-texto"
              value={draftAgTexto}
              onChange={(e) => setDraftAgTexto(e.target.value)}
              rows={3}
              placeholder="Ex.: Reunião de coordenação — 15h."
              className="min-h-[72px] w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ag-novo-ini">
                Data inicial (dd/mm/aaaa)
              </label>
              <input
                id="ag-novo-ini"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draftAgIni}
                onChange={(e) => setDraftAgIni(normalizeDatePtBr(e.target.value))}
                placeholder="dd/mm/aaaa"
                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 font-mono text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ag-novo-fim">
                Data final (opcional)
              </label>
              <input
                id="ag-novo-fim"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draftAgFim}
                onChange={(e) => setDraftAgFim(normalizeDatePtBr(e.target.value))}
                placeholder="Mesmo dia se vazio"
                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 font-mono text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={!podeIncluirAvisoGeral}
            title={podeIncluirAvisoGeral ? undefined : "Informe o texto e datas válidas (dd/mm/aaaa)."}
            onClick={incluirAvisoGeralNaTabela}
          >
            Adicionar à tabela
          </Button>
        </div>

        {avisosGeraisItens.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum aviso na tabela.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Texto</TableHead>
                  <TableHead className="w-[9.5rem] whitespace-nowrap">Data inicial</TableHead>
                  <TableHead className="w-[9.5rem] whitespace-nowrap">Data final</TableHead>
                  <TableHead className="w-[14rem] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {avisosGeraisItens.map((ag) => {
                  const editando = editingAgId === ag.id;
                  return (
                    <TableRow key={ag.id}>
                      <TableCell className="max-w-[min(28rem,55vw)] align-top">
                        {editando ? (
                          <textarea
                            value={editAgTexto}
                            onChange={(e) => setEditAgTexto(e.target.value)}
                            rows={3}
                            className="min-h-[72px] w-full min-w-[12rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 text-sm"
                          />
                        ) : (
                          <span className="whitespace-pre-wrap text-sm leading-snug">{ag.texto || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {editando ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editAgIni}
                            onChange={(e) => setEditAgIni(normalizeDatePtBr(e.target.value))}
                            className="h-9 w-full min-w-[7.5rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 font-mono text-sm tabular-nums"
                          />
                        ) : (
                          <span className="font-mono text-sm tabular-nums">{ag.dataInicio.trim() || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {editando ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editAgFim}
                            onChange={(e) => setEditAgFim(normalizeDatePtBr(e.target.value))}
                            className="h-9 w-full min-w-[7.5rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 font-mono text-sm tabular-nums"
                          />
                        ) : (
                          <span className="font-mono text-sm tabular-nums">{ag.dataFim.trim() || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {editando ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button type="button" size="sm" variant="default" onClick={salvarEdicaoAvisoGeral}>
                              Salvar
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={cancelarEdicaoAvisoGeral}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button type="button" size="sm" variant="outline" onClick={() => iniciarEdicaoAvisoGeral(ag)}>
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-red-700 hover:bg-red-50"
                              onClick={() => handleExcluirAvisoGeral(ag.id, ag.texto)}
                            >
                              Excluir
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </AvisosCollapsibleCard>

      <AvisosCollapsibleCard
        title="Alarme diário"
        open={open.alarmeDiario}
        onToggle={() => toggle("alarmeDiario")}
      >
        <p className="mb-4 text-sm font-normal text-[hsl(var(--muted-foreground))]">
          Monte <strong>novos</strong> alarmes aqui. Ao clicar em <strong>Ativar</strong>, o alarme passa para a
          planilha abaixo e aparece na página inicial. Reeditar um alarme na planilha{" "}
          <strong>zera o ocultar de hoje</strong>, permitindo alertar de novo no mesmo dia.
        </p>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="alarm-nome-novo">
                Nome do alarme
              </label>
              <input
                id="alarm-nome-novo"
                type="text"
                value={draftNome}
                onChange={(e) => setDraftNome(e.target.value)}
                placeholder="Ex.: Passagem de serviço"
                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="alarm-hora-novo">
                Hora (24h)
              </label>
              <input
                id="alarm-hora-novo"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="HH:MM"
                value={draftHora}
                onChange={(e) => setDraftHora(normalize24hTime(e.target.value))}
                className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 font-mono text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!podeAtivarNovo}
              title={podeAtivarNovo ? undefined : "Informe nome e hora (HH:MM) válidos."}
              onClick={handleAtivar}
            >
              Ativar
            </Button>
          </div>
        </div>
      </AvisosCollapsibleCard>

      <AvisosCollapsibleCard
        title="Alarmes ativos"
        open={open.alarmesAtivos}
        onToggle={() => toggle("alarmesAtivos")}
      >
        <p className="mb-4 text-sm font-normal text-[hsl(var(--muted-foreground))]">
          Controle dos alarmes que disparam na página inicial. Desmarque <strong>Ativo</strong> para pausar sem
          apagar.
        </p>
        {alarmesOrdenados.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Nenhum alarme na planilha. Configure em <strong>Alarme diário</strong> e clique em <strong>Ativar</strong>.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-[7rem]">Hora</TableHead>
                  <TableHead className="w-[5rem] text-center">Ativo</TableHead>
                  <TableHead className="w-[12rem] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alarmesOrdenados.map((a) => {
                  const editando = editingId === a.id;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        {editando ? (
                          <input
                            type="text"
                            value={editNome}
                            onChange={(e) => setEditNome(e.target.value)}
                            className="h-9 w-full min-w-[12rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-sm"
                          />
                        ) : (
                          <span className="font-medium">{a.nome}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editando ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editHora}
                            onChange={(e) => setEditHora(normalize24hTime(e.target.value))}
                            className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 font-mono text-sm tabular-nums"
                          />
                        ) : (
                          <span className="font-mono tabular-nums">{a.hora}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                          checked={a.ativo}
                          disabled={editando}
                          onChange={(e) => updateAlarmeDiario(a.id, { ativo: e.target.checked })}
                          aria-label={`Alarme ativo: ${a.nome}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {editando ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button type="button" size="sm" variant="default" onClick={salvarEdicao}>
                              Salvar
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={cancelarEdicao}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button type="button" size="sm" variant="outline" onClick={() => iniciarEdicao(a)}>
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-red-700 hover:bg-red-50"
                              onClick={() => handleExcluir(a.id, a.nome)}
                            >
                              Excluir
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </AvisosCollapsibleCard>

      <AvisosCollapsibleCard title="Fainas gerais" open={open.fainas} onToggle={() => toggle("fainas")}>
        <p className="mb-4 text-sm font-normal text-[hsl(var(--muted-foreground))]">
          Uma linha por faina. Esses itens entram no <strong>telão inferior</strong> da página inicial (texto em
          movimento) e no card <strong>Fainas Gerais</strong> do painel.
        </p>
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
      </AvisosCollapsibleCard>
    </div>
  );
}
