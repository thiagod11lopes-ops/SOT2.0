import {
  Archive,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  Check,
  Edit3,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useState } from "react";
import { useMaterialControle } from "../context/material-controle-context";
import type { MaterialItem, MaterialMovimento } from "../lib/materialControleStorage";
import { sotFormInputClass, sotFormTextareaClass } from "../lib/sotFormFieldClasses";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
};

type DialogMode =
  | { kind: "add-item" }
  | { kind: "edit-item"; item: MaterialItem }
  | { kind: "entrada"; item: MaterialItem }
  | { kind: "saida"; item: MaterialItem }
  | { kind: "baixa"; item: MaterialItem };

function formatBaixaDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatMovimentoLabel(m: MaterialMovimento) {
  const dataHora = formatBaixaDate(m.at);
  const acao = m.tipo === "entrada" ? "Entrada" : "Retirada";
  const obs = m.observacao.trim() ? ` · ${m.observacao.trim()}` : "";
  return `${acao} · ${m.quantidade} un. · ${m.responsavel} · ${dataHora}${obs}`;
}

export function MaterialControleModal({ open, onClose }: Props) {
  const titleId = useId();
  const {
    doc,
    initialLoadComplete,
    setRemoteSyncPaused,
    flushCloudWrite,
    addPlanilha,
    renamePlanilha,
    deletePlanilha,
    addItem,
    updateItem,
    deleteItem,
    entradaItem,
    saidaItem,
    darBaixaItem,
    reativarItem,
  } = useMaterialControle();

  const [activePlanilhaId, setActivePlanilhaId] = useState<string | null>(null);
  const [novaPlanilhaNome, setNovaPlanilhaNome] = useState("");
  const [renamingPlanilhaId, setRenamingPlanilhaId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [search, setSearch] = useState("");
  const [showBaixados, setShowBaixados] = useState(false);
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [formNome, setFormNome] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formUnidade, setFormUnidade] = useState("");
  const [formObs, setFormObs] = useState("");
  const [formMotivo, setFormMotivo] = useState("");
  const [formResponsavel, setFormResponsavel] = useState("");
  const [formDataMovimentoIso, setFormDataMovimentoIso] = useState("");
  const [formHoraMovimento, setFormHoraMovimento] = useState("");
  const [formObsMovimento, setFormObsMovimento] = useState("");

  const activePlanilha = useMemo(
    () => doc.planilhas.find((p) => p.id === activePlanilhaId) ?? null,
    [doc.planilhas, activePlanilhaId],
  );

  const filteredItems = useMemo(() => {
    if (!activePlanilha) return [];
    const q = search.trim().toLowerCase();
    return activePlanilha.items.filter((it) => {
      if (!showBaixados && it.status === "baixa") return false;
      if (!q) return true;
      return (
        it.nome.toLowerCase().includes(q) ||
        it.unidade.toLowerCase().includes(q) ||
        it.observacao.toLowerCase().includes(q)
      );
    });
  }, [activePlanilha, search, showBaixados]);

  const stats = useMemo(() => {
    if (!activePlanilha) return { ativos: 0, baixados: 0, totalQty: 0 };
    let ativos = 0;
    let baixados = 0;
    let totalQty = 0;
    for (const it of activePlanilha.items) {
      if (it.status === "baixa") baixados += 1;
      else {
        ativos += 1;
        totalQty += it.quantidade;
      }
    }
    return { ativos, baixados, totalQty };
  }, [activePlanilha]);

  useEffect(() => {
    if (!open) return;
    if (doc.planilhas.length === 0) {
      setActivePlanilhaId(null);
      return;
    }
    if (!activePlanilhaId || !doc.planilhas.some((p) => p.id === activePlanilhaId)) {
      setActivePlanilhaId(doc.planilhas[0]!.id);
    }
  }, [open, doc.planilhas, activePlanilhaId]);

  useEffect(() => {
    if (!open) return;
    setRemoteSyncPaused(dialog !== null || renamingPlanilhaId !== null);
  }, [open, dialog, renamingPlanilhaId, setRemoteSyncPaused]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dialog) setDialog(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      void flushCloudWrite();
      setRemoteSyncPaused(false);
    };
  }, [open, onClose, dialog, flushCloudWrite, setRemoteSyncPaused]);

  function resetForm() {
    setFormNome("");
    setFormQty("1");
    setFormUnidade("");
    setFormObs("");
    setFormMotivo("");
    setFormResponsavel("");
    setFormDataMovimentoIso("");
    setFormHoraMovimento("");
    setFormObsMovimento("");
  }

  function openDialog(mode: DialogMode) {
    resetForm();
    if (mode.kind === "edit-item" || mode.kind === "entrada" || mode.kind === "saida" || mode.kind === "baixa") {
      setFormNome(mode.item.nome);
      setFormUnidade(mode.item.unidade);
      setFormObs(mode.item.observacao);
      if (mode.kind === "edit-item") setFormQty(String(mode.item.quantidade));
      if (mode.kind === "baixa") setFormMotivo(mode.item.baixaMotivo);
    }
    setDialog(mode);
  }

  function handleCreatePlanilha() {
    const nome = novaPlanilhaNome.trim();
    if (!nome) return;
    const id = addPlanilha(nome);
    setActivePlanilhaId(id);
    setNovaPlanilhaNome("");
  }

  function handleConfirmDialog() {
    if (!activePlanilhaId || !dialog) return;
    const qty = Math.max(0, Number.parseFloat(formQty.replace(",", ".")) || 0);

    if (dialog.kind === "add-item") {
      if (!formNome.trim()) return;
      addItem(activePlanilhaId, {
        nome: formNome,
        quantidade: qty,
        unidade: formUnidade,
        observacao: formObs,
      });
    } else if (dialog.kind === "edit-item") {
      if (!formNome.trim()) return;
      updateItem(activePlanilhaId, dialog.item.id, {
        nome: formNome,
        quantidade: qty,
        unidade: formUnidade,
        observacao: formObs,
      });
    } else if (dialog.kind === "entrada") {
      if (qty <= 0 || !formResponsavel.trim() || !formDataMovimentoIso || !formHoraMovimento.trim()) return;
      entradaItem(activePlanilhaId, dialog.item.id, {
        quantidade: qty,
        responsavel: formResponsavel,
        dataIso: formDataMovimentoIso,
        hora: formHoraMovimento,
      });
    } else if (dialog.kind === "saida") {
      if (qty <= 0 || !formResponsavel.trim() || !formDataMovimentoIso || !formHoraMovimento.trim()) return;
      saidaItem(activePlanilhaId, dialog.item.id, {
        quantidade: qty,
        responsavel: formResponsavel,
        dataIso: formDataMovimentoIso,
        hora: formHoraMovimento,
        observacao: formObsMovimento,
      });
    } else if (dialog.kind === "baixa") {
      darBaixaItem(activePlanilhaId, dialog.item.id, formMotivo);
    }

    setDialog(null);
    resetForm();
  }

  if (!open) return null;

  const dialogTitle =
    dialog?.kind === "add-item"
      ? "Adicionar material"
      : dialog?.kind === "edit-item"
        ? "Editar item"
        : dialog?.kind === "entrada"
          ? "Entrada de material"
          : dialog?.kind === "saida"
            ? "Retirada de material"
            : dialog?.kind === "baixa"
              ? "Dar baixa no item"
              : "";

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !dialog) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex h-[min(92dvh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-[hsl(var(--primary))]/20",
          "bg-gradient-to-br from-[hsl(var(--card))] via-[hsl(var(--card))] to-[hsl(var(--muted))]/30",
          "shadow-[0_32px_80px_-16px_rgba(0,0,0,0.55),inset_0_1px_0_hsla(0,0%,100%,0.08)]",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-[hsl(var(--primary))]/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-[hsl(var(--primary))]/10 blur-3xl"
          aria-hidden
        />

        <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-[hsl(var(--border))]/50 bg-[hsl(var(--muted))]/25 px-4 py-2.5 sm:px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/10">
            <Boxes className="h-4 w-4 text-[hsl(var(--primary))]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-base">
              Controle de Material
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* Barra de abas horizontal — estilo Excel moderno */}
        <div
          className="relative z-20 shrink-0 border-b border-[hsl(var(--border))]/70 bg-[hsl(var(--muted))]/35 shadow-[inset_0_1px_0_hsla(0,0%,100%,0.05)]"
          role="tablist"
          aria-label="Planilhas de material"
        >
          <div className="flex min-h-[2.75rem] items-stretch gap-px overflow-x-auto px-2 pt-1.5 [scrollbar-width:thin] sm:px-3">
            {doc.planilhas.map((p, index) => {
              const active = p.id === activePlanilhaId;
              const itemCount = p.items.filter((it) => it.status === "ativo").length;
              const isRenaming = renamingPlanilhaId === p.id;
              const isFirst = index === 0;

              if (isRenaming) {
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "relative z-20 flex min-w-[10rem] max-w-[15rem] shrink-0 items-center gap-1 self-stretch border border-b-0 px-2",
                      "rounded-t-lg border-[hsl(var(--primary))]/45 bg-[hsl(var(--card))]",
                      "shadow-[0_-2px_12px_hsl(var(--primary)/0.1)]",
                    )}
                  >
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className={cn(sotFormInputClass, "h-7 min-w-0 flex-1 text-xs")}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renameDraft.trim()) {
                          renamePlanilha(p.id, renameDraft);
                          setRenamingPlanilhaId(null);
                        }
                        if (e.key === "Escape") setRenamingPlanilhaId(null);
                      }}
                    />
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10"
                      onClick={() => {
                        if (renameDraft.trim()) renamePlanilha(p.id, renameDraft);
                        setRenamingPlanilhaId(null);
                      }}
                      aria-label="Confirmar nome"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`planilha-panel-${p.id}`}
                  onClick={() => setActivePlanilhaId(p.id)}
                  onDoubleClick={() => {
                    setRenameDraft(p.nome);
                    setRenamingPlanilhaId(p.id);
                  }}
                  title={`${p.nome} — duplo clique para renomear`}
                  className={cn(
                    "group relative shrink-0 border text-left transition-[background-color,border-color,box-shadow,transform] duration-150",
                    "focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                    active
                      ? cn(
                          "z-20 -mb-px min-w-[7.5rem] max-w-[12rem] self-stretch",
                          "rounded-t-lg border-[hsl(var(--border))]/80 border-b-transparent bg-[hsl(var(--card))]",
                          "shadow-[0_-1px_0_hsl(var(--card)),0_-8px_20px_-6px_hsl(var(--primary)/0.18)]",
                          "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-lg",
                          "before:bg-gradient-to-r before:from-[hsl(142,55%,42%)] before:via-[hsl(var(--primary))] before:to-[hsl(142,55%,42%)]",
                        )
                      : cn(
                          "z-10 min-w-[6.5rem] max-w-[11rem] self-end",
                          "mb-0.5 rounded-t-md border-[hsl(var(--border))]/55 bg-[hsl(var(--muted))]/55",
                          "hover:z-20 hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/80",
                          isFirst && "ml-0",
                        ),
                  )}
                >
                  <span
                    className={cn(
                      "flex h-full items-center gap-2 px-3 py-2",
                      active ? "pb-2.5" : "py-1.5",
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[0.7rem] font-medium leading-tight sm:text-xs",
                        active
                          ? "font-semibold text-[hsl(var(--foreground))]"
                          : "text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]",
                      )}
                    >
                      {p.nome}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 py-px text-[0.55rem] font-bold tabular-nums leading-none",
                        active
                          ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))]"
                          : "bg-[hsl(var(--background))]/40 text-[hsl(var(--muted-foreground))]",
                      )}
                    >
                      {itemCount}
                    </span>
                  </span>
                </button>
              );
            })}

            <div
              className={cn(
                "z-10 mb-0.5 flex shrink-0 self-end items-center gap-0.5 rounded-t-md",
                "border border-dashed border-[hsl(var(--border))]/70 bg-[hsl(var(--muted))]/40",
              )}
            >
              <input
                type="text"
                value={novaPlanilhaNome}
                onChange={(e) => setNovaPlanilhaNome(e.target.value)}
                placeholder="+ Planilha"
                className={cn(
                  sotFormInputClass,
                  "h-8 w-[6.5rem] border-0 bg-transparent px-2 text-[0.7rem] shadow-none focus-visible:ring-0 sm:w-28 sm:text-xs",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreatePlanilha();
                }}
              />
              <button
                type="button"
                onClick={handleCreatePlanilha}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10"
                aria-label="Adicionar planilha"
                title="Nova planilha"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <main
          id={activePlanilha ? `planilha-panel-${activePlanilha.id}` : undefined}
          role="tabpanel"
          className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(var(--card))]"
        >
            {!activePlanilha ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Package className="h-12 w-12 text-[hsl(var(--muted-foreground))]/40" strokeWidth={1.25} />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {initialLoadComplete
                    ? doc.planilhas.length === 0
                      ? "Crie a primeira planilha na barra de abas acima."
                      : "Selecione uma planilha para gerir o material."
                    : "A carregar inventário…"}
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))]/40 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {stats.ativos} ativo(s) · {stats.totalQty} un. em stock
                      {stats.baixados > 0 ? ` · ${stats.baixados} baixa(s)` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRenameDraft(activePlanilha.nome);
                      setRenamingPlanilhaId(activePlanilha.id);
                    }}
                  >
                    <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                    Renomear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir a planilha «${activePlanilha.nome}» e todos os itens? Esta ação não pode ser anulada.`,
                        )
                      ) {
                        deletePlanilha(activePlanilha.id);
                      }
                    }}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Excluir
                  </Button>
                  <Button type="button" size="sm" onClick={() => openDialog({ kind: "add-item" })}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Adicionar
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-5">
                  <div className="relative min-w-[12rem] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Pesquisar material…"
                      className={cn(sotFormInputClass, "w-full pl-9 text-sm")}
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                    <input
                      type="checkbox"
                      checked={showBaixados}
                      onChange={(e) => setShowBaixados(e.target.checked)}
                      className="rounded border-[hsl(var(--border))]"
                    />
                    Mostrar itens com baixa
                  </label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
                  {filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[hsl(var(--border))] py-16 text-center">
                      <Archive className="h-10 w-10 text-[hsl(var(--muted-foreground))]/35" />
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        Nenhum item nesta planilha{search.trim() ? " para esta pesquisa" : ""}.
                      </p>
                    </div>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredItems.map((item) => (
                        <li
                          key={item.id}
                          className={cn(
                            "group relative overflow-hidden rounded-2xl border p-4 transition-all",
                            item.status === "baixa"
                              ? "border-[hsl(var(--muted-foreground))]/25 bg-[hsl(var(--muted))]/20 opacity-80"
                              : "border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 hover:border-[hsl(var(--primary))]/25 hover:shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.2)]",
                          )}
                        >
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="truncate font-semibold text-[hsl(var(--foreground))]">{item.nome}</h4>
                              {item.unidade ? (
                                <p className="text-xs text-[hsl(var(--muted-foreground))]">Unidade: {item.unidade}</p>
                              ) : null}
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
                                item.status === "baixa"
                                  ? "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                                  : "bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]",
                              )}
                            >
                              {item.status === "baixa" ? "Baixa" : "Ativo"}
                            </span>
                          </div>

                          <div className="mb-3 flex items-baseline gap-1">
                            <span className="font-mono text-2xl font-bold tabular-nums text-[hsl(var(--primary))]">
                              {item.quantidade}
                            </span>
                            <span className="text-xs text-[hsl(var(--muted-foreground))]">em stock</span>
                          </div>

                          {item.observacao ? (
                            <p className="mb-2 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">{item.observacao}</p>
                          ) : null}
                          {item.movimentos.length > 0 ? (
                            <ul className="mb-2 space-y-0.5 border-t border-[hsl(var(--border))]/50 pt-2">
                              {item.movimentos.slice(0, 3).map((m) => (
                                <li
                                  key={m.id}
                                  className={cn(
                                    "text-[0.65rem] leading-snug",
                                    m.tipo === "entrada"
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-amber-700 dark:text-amber-400",
                                  )}
                                >
                                  {formatMovimentoLabel(m)}
                                </li>
                              ))}
                              {item.movimentos.length > 3 ? (
                                <li className="text-[0.6rem] text-[hsl(var(--muted-foreground))]">
                                  +{item.movimentos.length - 3} registo(s) anterior(es)
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                          {item.status === "baixa" && item.baixaAt ? (
                            <p className="mb-2 text-[0.65rem] text-[hsl(var(--muted-foreground))]">
                              Baixa em {formatBaixaDate(item.baixaAt)}
                              {item.baixaMotivo ? ` · ${item.baixaMotivo}` : ""}
                            </p>
                          ) : null}

                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.status === "ativo" ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => openDialog({ kind: "entrada", item })}
                                  title="Entrada"
                                >
                                  <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => openDialog({ kind: "saida", item })}
                                  title="Retirada"
                                >
                                  <ArrowUpCircle className="h-3.5 w-3.5 text-amber-600" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => openDialog({ kind: "edit-item", item })}
                                  title="Editar"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => openDialog({ kind: "baixa", item })}
                                  title="Dar baixa"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => reativarItem(activePlanilha.id, item.id)}
                              >
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                Reativar
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (window.confirm(`Excluir «${item.nome}» permanentemente?`)) {
                                  deleteItem(activePlanilha.id, item.id);
                                }
                              }}
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
        </main>

        {dialog ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl">
              <h3 className="mb-4 text-base font-semibold">{dialogTitle}</h3>
              <div className="space-y-3">
                {(dialog.kind === "add-item" || dialog.kind === "edit-item") && (
                  <>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      Nome do material
                      <input
                        type="text"
                        value={formNome}
                        onChange={(e) => setFormNome(e.target.value)}
                        className={cn(sotFormInputClass, "mt-1 w-full")}
                        autoFocus
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        Quantidade
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formQty}
                          onChange={(e) => setFormQty(e.target.value)}
                          className={cn(sotFormInputClass, "mt-1 w-full")}
                        />
                      </label>
                      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        Unidade
                        <input
                          type="text"
                          value={formUnidade}
                          onChange={(e) => setFormUnidade(e.target.value)}
                          placeholder="un, cx, par…"
                          className={cn(sotFormInputClass, "mt-1 w-full")}
                        />
                      </label>
                    </div>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      Observação
                      <textarea
                        value={formObs}
                        onChange={(e) => setFormObs(e.target.value)}
                        rows={2}
                        className={cn(sotFormTextareaClass, "mt-1 w-full resize-none")}
                      />
                    </label>
                  </>
                )}
                {(dialog.kind === "entrada" || dialog.kind === "saida") && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        {dialog.kind === "entrada" ? "Data da entrada" : "Data da saída"}
                        <input
                          type="date"
                          value={formDataMovimentoIso}
                          onChange={(e) => setFormDataMovimentoIso(e.target.value)}
                          className={cn(sotFormInputClass, "mt-1 w-full")}
                          required
                          autoFocus
                        />
                      </label>
                      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        {dialog.kind === "entrada" ? "Horário da entrada" : "Horário da saída"}
                        <input
                          type="time"
                          value={formHoraMovimento}
                          onChange={(e) => setFormHoraMovimento(e.target.value)}
                          className={cn(sotFormInputClass, "mt-1 w-full")}
                          required
                        />
                      </label>
                    </div>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      Quantidade a {dialog.kind === "entrada" ? "adicionar" : "retirar"}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formQty}
                        onChange={(e) => setFormQty(e.target.value)}
                        className={cn(sotFormInputClass, "mt-1 w-full")}
                      />
                      <span className="mt-1 block text-[0.65rem]">
                        Stock atual: <strong>{dialog.item.quantidade}</strong>
                        {dialog.item.unidade ? ` ${dialog.item.unidade}` : ""}
                      </span>
                    </label>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      Responsável
                      <input
                        type="text"
                        value={formResponsavel}
                        onChange={(e) => setFormResponsavel(e.target.value)}
                        placeholder="Nome de quem fez a operação"
                        className={cn(sotFormInputClass, "mt-1 w-full")}
                      />
                    </label>
                    {dialog.kind === "saida" ? (
                      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        Observações
                        <textarea
                          value={formObsMovimento}
                          onChange={(e) => setFormObsMovimento(e.target.value)}
                          placeholder="Motivo, destino, viatura, etc."
                          rows={2}
                          className={cn(sotFormTextareaClass, "mt-1 w-full resize-none")}
                        />
                      </label>
                    ) : null}
                    {dialog.item.movimentos.length > 0 ? (
                      <div className="rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--muted))]/15 p-3">
                        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                          Histórico recente
                        </p>
                        <ul className="max-h-28 space-y-1 overflow-y-auto">
                          {dialog.item.movimentos.slice(0, 8).map((m) => (
                            <li
                              key={m.id}
                              className={cn(
                                "text-xs",
                                m.tipo === "entrada"
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-amber-700 dark:text-amber-400",
                              )}
                            >
                              {formatMovimentoLabel(m)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
                {dialog.kind === "baixa" && (
                  <>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      O item <strong>{dialog.item.nome}</strong> será marcado como baixa e o stock zerado.
                    </p>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      Motivo (opcional)
                      <textarea
                        value={formMotivo}
                        onChange={(e) => setFormMotivo(e.target.value)}
                        rows={2}
                        className={cn(sotFormTextareaClass, "mt-1 w-full resize-none")}
                        autoFocus
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmDialog}
                  disabled={
                    (dialog.kind === "entrada" || dialog.kind === "saida") &&
                    (!formResponsavel.trim() || !formDataMovimentoIso || !formHoraMovimento.trim())
                  }
                >
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
