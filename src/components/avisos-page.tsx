import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppTab } from "../context/app-tab-context";
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
  const { avisosFainasFocusKey } = useAppTab();
  const fainasGeraisSectionRef = useRef<HTMLDivElement>(null);
  const lastScrolledFainasKeyRef = useRef(0);

  const {
    avisoPrincipal,
    fainasTexto,
    avisosGeraisItens,
    avisosGeraisDraftNovo,
    avisosGeraisDraftEdicao,
    setAvisoPrincipal,
    setFainasTexto,
    setAvisosGeraisItens,
    setAvisosGeraisDraftNovo,
    setAvisosGeraisDraftEdicao,
    alarmesDiarios,
    addAlarmeDiario,
    updateAlarmeDiario,
    removeAlarmeDiario,
    alarmDiarioDraftNovo,
    alarmDiarioDraftEdicao,
    setAlarmDiarioDraftNovo,
    setAlarmDiarioDraftEdicao,
  } = useAvisos();

  const [open, setOpen] = useState({
    avisoPrincipal: false,
    fainas: false,
    alarmeDiario: false,
    avisosGerais: false,
  });

  const toggle = useCallback((key: keyof typeof open) => {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }, []);

  useEffect(() => {
    if (avisosFainasFocusKey <= 0) return;
    setOpen((o) => ({ ...o, fainas: true }));
  }, [avisosFainasFocusKey]);

  useLayoutEffect(() => {
    if (!open.fainas || avisosFainasFocusKey <= 0) return;
    if (avisosFainasFocusKey <= lastScrolledFainasKeyRef.current) return;
    lastScrolledFainasKeyRef.current = avisosFainasFocusKey;
    fainasGeraisSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [avisosFainasFocusKey, open.fainas]);

  const podeAtivarNovo = useMemo(
    () =>
      alarmDiarioDraftNovo.nome.trim().length > 0 && parseHhMm(alarmDiarioDraftNovo.hora) !== null,
    [alarmDiarioDraftNovo],
  );

  const alarmesOrdenados = useMemo(() => sortAlarmesPorHora(alarmesDiarios), [alarmesDiarios]);

  const handleAtivar = useCallback(() => {
    if (!podeAtivarNovo) return;
    addAlarmeDiario(alarmDiarioDraftNovo.nome, alarmDiarioDraftNovo.hora);
    setAlarmDiarioDraftNovo({ nome: "", hora: "" });
  }, [podeAtivarNovo, alarmDiarioDraftNovo, addAlarmeDiario, setAlarmDiarioDraftNovo]);

  const iniciarEdicao = useCallback(
    (a: AlarmeDiarioItem) => {
      setAlarmDiarioDraftEdicao({ id: a.id, nome: a.nome, hora: a.hora });
    },
    [setAlarmDiarioDraftEdicao],
  );

  const cancelarEdicao = useCallback(() => {
    setAlarmDiarioDraftEdicao(null);
  }, [setAlarmDiarioDraftEdicao]);

  const salvarEdicao = useCallback(() => {
    if (!alarmDiarioDraftEdicao) return;
    if (!alarmDiarioDraftEdicao.nome.trim() || parseHhMm(alarmDiarioDraftEdicao.hora) === null) return;
    updateAlarmeDiario(alarmDiarioDraftEdicao.id, {
      nome: alarmDiarioDraftEdicao.nome,
      hora: alarmDiarioDraftEdicao.hora,
    });
    setAlarmDiarioDraftEdicao(null);
  }, [alarmDiarioDraftEdicao, updateAlarmeDiario, setAlarmDiarioDraftEdicao]);

  const handleExcluir = useCallback(
    (id: string, nome: string) => {
      if (!window.confirm(`Excluir o alarme "${nome}"?`)) return;
      if (alarmDiarioDraftEdicao?.id === id) setAlarmDiarioDraftEdicao(null);
      removeAlarmeDiario(id);
    },
    [alarmDiarioDraftEdicao?.id, setAlarmDiarioDraftEdicao, removeAlarmeDiario],
  );

  const podeIncluirAvisoGeral = useMemo(() => {
    const t = avisosGeraisDraftNovo.texto.trim();
    if (!t) return false;
    const ini = avisosGeraisDraftNovo.dataInicio.trim();
    if (!ini || !parsePtBrToDate(ini)) return false;
    const f = avisosGeraisDraftNovo.dataFim.trim();
    if (f && !parsePtBrToDate(f)) return false;
    return true;
  }, [avisosGeraisDraftNovo]);

  const incluirAvisoGeralNaTabela = useCallback(() => {
    if (!podeIncluirAvisoGeral) return;
    const ini = normalizeDatePtBr(avisosGeraisDraftNovo.dataInicio.trim());
    const f = avisosGeraisDraftNovo.dataFim.trim();
    setAvisosGeraisItens((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        texto: avisosGeraisDraftNovo.texto.trim(),
        dataInicio: ini,
        dataFim: f ? normalizeDatePtBr(f) : "",
      },
    ]);
    setAvisosGeraisDraftNovo({ texto: "", dataInicio: getCurrentDatePtBr(), dataFim: "" });
  }, [podeIncluirAvisoGeral, avisosGeraisDraftNovo, setAvisosGeraisItens, setAvisosGeraisDraftNovo]);

  const iniciarEdicaoAvisoGeral = useCallback(
    (ag: AvisoGeralItem) => {
      setAvisosGeraisDraftEdicao({
        id: ag.id,
        texto: ag.texto,
        dataInicio: ag.dataInicio,
        dataFim: ag.dataFim,
      });
    },
    [setAvisosGeraisDraftEdicao],
  );

  const cancelarEdicaoAvisoGeral = useCallback(() => {
    setAvisosGeraisDraftEdicao(null);
  }, [setAvisosGeraisDraftEdicao]);

  const salvarEdicaoAvisoGeral = useCallback(() => {
    if (!avisosGeraisDraftEdicao) return;
    const editingAgId = avisosGeraisDraftEdicao.id;
    const t = avisosGeraisDraftEdicao.texto.trim();
    if (!t) return;
    const ini = avisosGeraisDraftEdicao.dataInicio.trim();
    const f = avisosGeraisDraftEdicao.dataFim.trim();
    if (!ini && !f) {
      setAvisosGeraisItens((prev) =>
        prev.map((x) => (x.id === editingAgId ? { ...x, texto: t, dataInicio: "", dataFim: "" } : x)),
      );
      setAvisosGeraisDraftEdicao(null);
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
    setAvisosGeraisDraftEdicao(null);
  }, [avisosGeraisDraftEdicao, setAvisosGeraisItens, setAvisosGeraisDraftEdicao]);

  const removeAvisoGeral = useCallback(
    (id: string) => {
      if (avisosGeraisDraftEdicao?.id === id) setAvisosGeraisDraftEdicao(null);
      setAvisosGeraisItens((prev) => prev.filter((x) => x.id !== id));
    },
    [avisosGeraisDraftEdicao?.id, setAvisosGeraisDraftEdicao, setAvisosGeraisItens],
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
          Se preenchido, o texto aparece na <strong>faixa laranja</strong> na base da página inicial. Os{" "}
          <strong>Avisos gerais</strong> do período seguem no <strong>telão escuro</strong> com texto em movimento
          abaixo. Deixe em branco para ocultar.
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
              value={avisosGeraisDraftNovo.texto}
              onChange={(e) => setAvisosGeraisDraftNovo((d) => ({ ...d, texto: e.target.value }))}
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
                value={avisosGeraisDraftNovo.dataInicio}
                onChange={(e) =>
                  setAvisosGeraisDraftNovo((d) => ({ ...d, dataInicio: normalizeDatePtBr(e.target.value) }))
                }
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
                value={avisosGeraisDraftNovo.dataFim}
                onChange={(e) =>
                  setAvisosGeraisDraftNovo((d) => ({ ...d, dataFim: normalizeDatePtBr(e.target.value) }))
                }
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
                  const editando = avisosGeraisDraftEdicao?.id === ag.id;
                  return (
                    <TableRow key={ag.id}>
                      <TableCell className="max-w-[min(28rem,55vw)] align-top">
                        {editando && avisosGeraisDraftEdicao ? (
                          <textarea
                            value={avisosGeraisDraftEdicao.texto}
                            onChange={(e) =>
                              setAvisosGeraisDraftEdicao((prev) =>
                                prev && prev.id === ag.id ? { ...prev, texto: e.target.value } : prev,
                              )
                            }
                            rows={3}
                            className="min-h-[72px] w-full min-w-[12rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 text-sm"
                          />
                        ) : (
                          <span className="whitespace-pre-wrap text-sm leading-snug">{ag.texto || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {editando && avisosGeraisDraftEdicao ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={avisosGeraisDraftEdicao.dataInicio}
                            onChange={(e) =>
                              setAvisosGeraisDraftEdicao((prev) =>
                                prev && prev.id === ag.id
                                  ? { ...prev, dataInicio: normalizeDatePtBr(e.target.value) }
                                  : prev,
                              )
                            }
                            className="h-9 w-full min-w-[7.5rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 font-mono text-sm tabular-nums"
                          />
                        ) : (
                          <span className="font-mono text-sm tabular-nums">{ag.dataInicio.trim() || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {editando && avisosGeraisDraftEdicao ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={avisosGeraisDraftEdicao.dataFim}
                            onChange={(e) =>
                              setAvisosGeraisDraftEdicao((prev) =>
                                prev && prev.id === ag.id
                                  ? { ...prev, dataFim: normalizeDatePtBr(e.target.value) }
                                  : prev,
                              )
                            }
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
          planilha abaixo e aparece na página inicial.           Desativar o alarme na página inicial desliga o <strong>Ativo</strong> aqui; no dia seguinte o alarme volta a
          ficar ativo sozinho. Editar nome ou hora aqui não altera esse comportamento.
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
                value={alarmDiarioDraftNovo.nome}
                onChange={(e) => setAlarmDiarioDraftNovo((d) => ({ ...d, nome: e.target.value }))}
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
                value={alarmDiarioDraftNovo.hora}
                onChange={(e) =>
                  setAlarmDiarioDraftNovo((d) => ({ ...d, hora: normalize24hTime(e.target.value) }))
                }
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

        <div className="mt-8 border-t border-[hsl(var(--border))] pt-6">
          <h3 className="mb-3 text-base font-semibold text-[hsl(var(--foreground))]">Alarmes ativos</h3>
          <p className="mb-4 text-sm font-normal text-[hsl(var(--muted-foreground))]">
            Controle dos alarmes que disparam na página inicial. Desmarque <strong>Ativo</strong> para pausar sem
            apagar.
          </p>
          {alarmesOrdenados.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Nenhum alarme na planilha. Preencha o formulário acima e clique em <strong>Ativar</strong>.
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
                  const editando = alarmDiarioDraftEdicao?.id === a.id;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        {editando && alarmDiarioDraftEdicao ? (
                          <input
                            type="text"
                            value={alarmDiarioDraftEdicao.nome}
                            onChange={(e) =>
                              setAlarmDiarioDraftEdicao((prev) =>
                                prev && prev.id === a.id ? { ...prev, nome: e.target.value } : prev,
                              )
                            }
                            className="h-9 w-full min-w-[12rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-sm"
                          />
                        ) : (
                          <span className="font-medium">{a.nome}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editando && alarmDiarioDraftEdicao ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={alarmDiarioDraftEdicao.hora}
                            onChange={(e) =>
                              setAlarmDiarioDraftEdicao((prev) =>
                                prev && prev.id === a.id
                                  ? { ...prev, hora: normalize24hTime(e.target.value) }
                                  : prev,
                              )
                            }
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
                          onChange={(e) => {
                            const ativo = e.target.checked;
                            updateAlarmeDiario(a.id, {
                              ativo,
                              pausaAteDia: null,
                            });
                          }}
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
        </div>
      </AvisosCollapsibleCard>

      <div ref={fainasGeraisSectionRef} id="avisos-fainas-gerais" className="scroll-mt-4">
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
    </div>
  );
}
