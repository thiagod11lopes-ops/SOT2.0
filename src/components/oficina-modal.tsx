import { Search, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { normalizeDatePtBr } from "../lib/dateFormat";
import {
  mergeVisitasOficinaPreservandoDataSaida,
  migrarRegistroOficina,
  type RegistroOficina,
} from "../lib/oficinaVisits";
import { Button } from "./ui/button";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Destaca em negrito cada palavra da busca encontrada no texto. */
function ManutencaoComDestaque({ texto, busca }: { texto: string; busca: string }) {
  const palavras = busca.trim().split(/\s+/).filter((w) => w.length > 0);
  if (palavras.length === 0 || !texto) {
    return <span className="whitespace-pre-wrap">{texto}</span>;
  }
  const pattern = palavras.map(escapeRegExp).join("|");
  const re = new RegExp(`(${pattern})`, "gi");
  const partes = texto.split(re);
  return (
    <span className="whitespace-pre-wrap">
      {partes.map((parte, i) => {
        const ehTrecho = palavras.some((p) => p.toLowerCase() === parte.toLowerCase());
        return (
          <Fragment key={i}>
            {ehTrecho ? (
              <strong className="font-bold text-[hsl(var(--foreground))]">{parte}</strong>
            ) : (
              parte
            )}
          </Fragment>
        );
      })}
    </span>
  );
}

type Rascunho = {
  dataEntrada: string;
  dataSaida: string;
  manutencao: string;
};

const rascunhoVazio = (): Rascunho => ({
  dataEntrada: "",
  dataSaida: "",
  manutencao: "",
});

type OficinaModalProps = {
  placa: string | null;
  visitas: RegistroOficina[];
  onChange: (next: RegistroOficina[]) => void;
  onClose: () => void;
};

function copiarVisitas(list: RegistroOficina[]): RegistroOficina[] {
  return list.map((v) => ({ ...v }));
}

/** Garante strings e formato dd/mm/aaaa antes de gravar no contexto / IndexedDB / Firestore. */
function visitasParaPersistir(list: RegistroOficina[]): RegistroOficina[] {
  return list.map((v) => migrarRegistroOficina({ ...v }));
}

function visitasIguais(a: RegistroOficina[], b: RegistroOficina[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function OficinaModal({ placa, visitas, onChange, onClose }: OficinaModalProps) {
  const open = placa !== null;
  const [buscaManutencao, setBuscaManutencao] = useState("");
  const [rascunho, setRascunho] = useState<Rascunho>(rascunhoVazio);
  /** Rascunho do histórico — gravado no contexto ao clicar em Atualizar ou ao fechar o modal. */
  const [draftVisitas, setDraftVisitas] = useState<RegistroOficina[]>([]);
  const lastPlacaRef = useRef<string | null>(null);
  const lastVisitasKeyRef = useRef<string>("");

  useEffect(() => {
    setBuscaManutencao("");
    setRascunho(rascunhoVazio());
  }, [placa]);

  useEffect(() => {
    if (!placa) return;
    const key = JSON.stringify(visitas);
    if (lastPlacaRef.current !== placa) {
      lastPlacaRef.current = placa;
      lastVisitasKeyRef.current = key;
      setDraftVisitas(copiarVisitas(visitas));
      return;
    }
    if (key !== lastVisitasKeyRef.current) {
      lastVisitasKeyRef.current = key;
      setDraftVisitas((prev) => mergeVisitasOficinaPreservandoDataSaida(prev, visitas));
    }
  }, [placa, visitas]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const visitasFiltradas = useMemo(() => {
    const palavras = buscaManutencao.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return draftVisitas;
    return draftVisitas.filter((v) => {
      const t = v.manutencao.toLowerCase();
      return palavras.every((p) => t.includes(p));
    });
  }, [draftVisitas, buscaManutencao]);

  /** Mais recente (maior número) no topo; Registro 1 em baixo. */
  const visitasOrdenadasExibicao = useMemo(
    () => [...visitasFiltradas].reverse(),
    [visitasFiltradas],
  );

  const haAlteracoesPendentes = !visitasIguais(draftVisitas, visitas);

  if (!open || !placa) return null;

  function incluirRascunho() {
    if (!rascunho.dataEntrada.trim()) {
      window.alert("Informe a data de entrada para incluir o registro.");
      return;
    }
    setDraftVisitas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        dataEntrada: rascunho.dataEntrada.trim(),
        dataSaida: rascunho.dataSaida.trim(),
        manutencao: rascunho.manutencao,
      },
    ]);
    setRascunho(rascunhoVazio());
  }

  function atualizarCampo(id: string, patch: Partial<RegistroOficina>) {
    setDraftVisitas((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  function remover(id: string) {
    setDraftVisitas((prev) => prev.filter((v) => v.id !== id));
  }

  function handleSalvarAlteracoes() {
    onChange(visitasParaPersistir(draftVisitas));
  }

  function handleFechar() {
    if (haAlteracoesPendentes) {
      onChange(visitasParaPersistir(draftVisitas));
    }
    onClose();
  }

  const inputDataClass =
    "h-9 w-full rounded-md border border-[hsl(var(--border))] bg-white px-2 text-sm tabular-nums";

  const temBusca = buscaManutencao.trim().length > 0;
  const nenhumHistoricoCombina = draftVisitas.length > 0 && visitasFiltradas.length === 0 && temBusca;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oficina-modal-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[hsl(var(--border))] px-4 py-3">
          <h2 id="oficina-modal-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Oficina — {placa}
          </h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Preencha o registro no topo e clique em <strong>Incluir registro</strong> para adicioná-lo ao histórico
            abaixo. As alterações são guardadas ao clicar em <strong>Atualizar</strong> ou ao fechar o modal. O primeiro
            bloco fica sempre vazio para novas entradas.
          </p>
        </div>

        <div className="border-b border-[hsl(var(--border))] px-4 py-2">
          <label className="sr-only" htmlFor="oficina-busca-manutencao">
            Buscar em manutenções e serviços realizados
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
              aria-hidden
            />
            <input
              id="oficina-busca-manutencao"
              type="search"
              value={buscaManutencao}
              onChange={(e) => setBuscaManutencao(e.target.value)}
              placeholder="Buscar em manutenções e serviços realizados…"
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white py-2 pl-9 pr-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-4">
            {/* Sempre no topo: novo registro (rascunho) */}
            <div className="rounded-lg border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.06)] p-3">
              <div className="mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                  Novo registro
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor="oficina-rascunho-ent">
                    Data de entrada
                  </label>
                  <input
                    id="oficina-rascunho-ent"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="dd/mm/aaaa"
                    value={rascunho.dataEntrada}
                    onChange={(e) =>
                      setRascunho((p) => ({ ...p, dataEntrada: normalizeDatePtBr(e.target.value) }))
                    }
                    className={inputDataClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor="oficina-rascunho-sai">
                    Data de saída
                  </label>
                  <input
                    id="oficina-rascunho-sai"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="dd/mm/aaaa"
                    value={rascunho.dataSaida}
                    onChange={(e) =>
                      setRascunho((p) => ({ ...p, dataSaida: normalizeDatePtBr(e.target.value) }))
                    }
                    className={inputDataClass}
                  />
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Deixe em branco se ainda estiver na oficina.
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor="oficina-rascunho-man">
                  Manutenção / serviços realizados
                </label>
                {temBusca && rascunho.manutencao.trim() ? (
                  <div
                    className="mb-2 rounded-md border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm leading-relaxed text-[hsl(var(--foreground))]"
                    aria-live="polite"
                  >
                    <ManutencaoComDestaque texto={rascunho.manutencao} busca={buscaManutencao} />
                  </div>
                ) : null}
                <textarea
                  id="oficina-rascunho-man"
                  value={rascunho.manutencao}
                  onChange={(e) => setRascunho((p) => ({ ...p, manutencao: e.target.value }))}
                  rows={3}
                  placeholder="Ex.: troca de pastilhas, revisão geral, alinhamento…"
                  className="w-full resize-y rounded-md border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button type="button" size="sm" onClick={incluirRascunho}>
                  Incluir registro
                </Button>
              </div>
            </div>

            {draftVisitas.length > 0 ? (
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Histórico
              </p>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Nenhum registro no histórico ainda. Use o bloco <strong>Novo registro</strong> acima.
              </p>
            )}

            {nenhumHistoricoCombina ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Nenhum registro do histórico combina com a busca em manutenção/serviços.
              </p>
            ) : draftVisitas.length > 0 ? (
              <ul className="space-y-4">
                {visitasOrdenadasExibicao.map((v) => {
                  const indiceReal = draftVisitas.findIndex((x) => x.id === v.id) + 1;
                  return (
                    <li
                      key={v.id}
                      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.08)] p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                          Registro {indiceReal}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-600"
                          aria-label="Remover registro"
                          onClick={() => remover(v.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor={`ent-${v.id}`}>
                            Data de entrada
                          </label>
                          <input
                            id={`ent-${v.id}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="dd/mm/aaaa"
                            value={v.dataEntrada}
                            onChange={(e) =>
                              atualizarCampo(v.id, { dataEntrada: normalizeDatePtBr(e.target.value) })
                            }
                            className={inputDataClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor={`sai-${v.id}`}>
                            Data de saída
                          </label>
                          <input
                            id={`sai-${v.id}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="dd/mm/aaaa"
                            value={v.dataSaida}
                            onChange={(e) =>
                              atualizarCampo(v.id, { dataSaida: normalizeDatePtBr(e.target.value) })
                            }
                            className={inputDataClass}
                          />
                          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                            Deixe em branco se ainda estiver na oficina.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor={`man-${v.id}`}>
                          Manutenção / serviços realizados
                        </label>
                        {temBusca && v.manutencao.trim() ? (
                          <div
                            className="mb-2 rounded-md border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm leading-relaxed text-[hsl(var(--foreground))]"
                            aria-live="polite"
                          >
                            <ManutencaoComDestaque texto={v.manutencao} busca={buscaManutencao} />
                          </div>
                        ) : null}
                        <textarea
                          id={`man-${v.id}`}
                          value={v.manutencao}
                          onChange={(e) => atualizarCampo(v.id, { manutencao: e.target.value })}
                          rows={3}
                          placeholder="Ex.: troca de pastilhas, revisão geral, alinhamento…"
                          className="w-full resize-y rounded-md border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[hsl(var(--border))] px-4 py-3">
          {haAlteracoesPendentes ? (
            <p className="mr-auto text-xs text-amber-700 dark:text-amber-400">
              Alterações por guardar — clique em Atualizar para gravar.
            </p>
          ) : null}
          <Button type="button" variant="outline" onClick={handleFechar}>
            Fechar
          </Button>
          <Button type="button" disabled={!haAlteracoesPendentes} onClick={handleSalvarAlteracoes}>
            Atualizar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
