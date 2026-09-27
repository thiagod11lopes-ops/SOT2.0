import {
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  ClipboardList,
  FileDown,
  History,
  Moon,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMaterialControle } from "../context/material-controle-context";
import {
  formatMaterialDateTime,
  materialMovimentoTipoLabel,
} from "../lib/materialControleFormat";
import { downloadMaterialControleBalancoPdf } from "../lib/materialControlePdf";
import type { MaterialItem, MaterialPlanilha } from "../lib/materialControleStorage";
import { sotFormInputClass, sotFormTextareaClass } from "../lib/sotFormFieldClasses";
import { cn } from "../lib/utils";

type Tab = "estoque" | "historico" | "balanco";

type Sheet =
  | { kind: "planilhas" }
  | { kind: "add-item" }
  | { kind: "item"; item: MaterialItem }
  | { kind: "edit"; item: MaterialItem }
  | { kind: "entrada"; item: MaterialItem }
  | { kind: "saida"; item: MaterialItem }
  | { kind: "baixa"; item: MaterialItem };

function todayIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nowTime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parseQty(value: string) {
  return Math.max(0, Number.parseFloat(value.replace(",", ".")) || 0);
}

type MaterialTheme = "light" | "dark";
const MATERIAL_THEME_KEY = "sot-material-avulso-theme";

function readMaterialTheme(): MaterialTheme {
  try {
    const stored = localStorage.getItem(MATERIAL_THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  return "light";
}

export function MaterialControlePage() {
  const [theme, setTheme] = useState<MaterialTheme>(readMaterialTheme);

  useEffect(() => {
    try {
      localStorage.setItem(MATERIAL_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return createPortal(
    <div className="material-phone-stage fixed inset-0 z-[120] flex" data-material-theme={theme}>
      <div className="material-phone">
        <span className="material-phone__btn material-phone__btn--silent" aria-hidden="true" />
        <span className="material-phone__btn material-phone__btn--vol-up" aria-hidden="true" />
        <span className="material-phone__btn material-phone__btn--vol-down" aria-hidden="true" />
        <span className="material-phone__btn material-phone__btn--power" aria-hidden="true" />
        <span className="material-phone__island" aria-hidden="true" />
        <div className="material-phone__screen bg-[hsl(var(--background))]">
          <MaterialControleApp theme={theme} onTheme={setTheme} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MaterialControleApp({
  theme,
  onTheme,
}: {
  theme: MaterialTheme;
  onTheme: (theme: MaterialTheme) => void;
}) {
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

  const [tab, setTab] = useState<Tab>("estoque");
  const [activePlanilhaId, setActivePlanilhaId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showBaixados, setShowBaixados] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [novaPlanilhaNome, setNovaPlanilhaNome] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formUnidade, setFormUnidade] = useState("");
  const [formObs, setFormObs] = useState("");
  const [formMotivo, setFormMotivo] = useState("");
  const [formResponsavel, setFormResponsavel] = useState("");
  const [formData, setFormData] = useState(todayIso);
  const [formHora, setFormHora] = useState(nowTime);

  const activePlanilha = useMemo(
    () => doc.planilhas.find((p) => p.id === activePlanilhaId) ?? null,
    [doc.planilhas, activePlanilhaId],
  );

  useEffect(() => {
    if (doc.planilhas.length === 0) {
      setActivePlanilhaId(null);
      return;
    }
    if (!activePlanilhaId || !doc.planilhas.some((p) => p.id === activePlanilhaId)) {
      setActivePlanilhaId(doc.planilhas[0]!.id);
    }
  }, [doc.planilhas, activePlanilhaId]);

  useEffect(() => {
    setRemoteSyncPaused(sheet !== null || renameId !== null);
  }, [sheet, renameId, setRemoteSyncPaused]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      void flushCloudWrite();
      setRemoteSyncPaused(false);
    };
  }, [flushCloudWrite, setRemoteSyncPaused]);

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
    if (!activePlanilha) return { ativos: 0, baixados: 0, totalQty: 0, zerados: 0 };
    let ativos = 0;
    let baixados = 0;
    let totalQty = 0;
    let zerados = 0;
    for (const it of activePlanilha.items) {
      if (it.status === "baixa") baixados += 1;
      else {
        ativos += 1;
        totalQty += it.quantidade;
        if (it.quantidade <= 0) zerados += 1;
      }
    }
    return { ativos, baixados, totalQty, zerados };
  }, [activePlanilha]);

  const movimentos = useMemo(() => {
    if (!activePlanilha) return [];
    return activePlanilha.items
      .flatMap((item) => item.movimentos.map((m) => ({ id: m.id, itemNome: item.nome, movimento: m })))
      .sort((a, b) => b.movimento.at.localeCompare(a.movimento.at));
  }, [activePlanilha]);

  function closeSheet() {
    setSheet(null);
    setRenameId(null);
  }

  function openMove(kind: "entrada" | "saida", item: MaterialItem) {
    setFormQty("1");
    setFormResponsavel("");
    setFormObs("");
    setFormData(todayIso());
    setFormHora(nowTime());
    setSheet({ kind, item });
  }

  function openEdit(item: MaterialItem) {
    setFormNome(item.nome);
    setFormQty(String(item.quantidade));
    setFormUnidade(item.unidade);
    setFormObs(item.observacao);
    setSheet({ kind: "edit", item });
  }

  function openAdd() {
    setFormNome("");
    setFormQty("1");
    setFormUnidade("");
    setFormObs("");
    setSheet({ kind: "add-item" });
  }

  function handleCreatePlanilha() {
    const nome = novaPlanilhaNome.trim();
    if (!nome) return;
    const id = addPlanilha(nome);
    setActivePlanilhaId(id);
    setNovaPlanilhaNome("");
    setTab("estoque");
    closeSheet();
  }

  function confirmSheet() {
    if (!sheet || !activePlanilhaId) return;
    const qty = parseQty(formQty);
    if (sheet.kind === "add-item") {
      if (!formNome.trim()) return;
      addItem(activePlanilhaId, { nome: formNome, quantidade: qty, unidade: formUnidade, observacao: formObs });
    } else if (sheet.kind === "edit") {
      if (!formNome.trim()) return;
      updateItem(activePlanilhaId, sheet.item.id, {
        nome: formNome,
        quantidade: qty,
        unidade: formUnidade,
        observacao: formObs,
      });
    } else if (sheet.kind === "entrada" || sheet.kind === "saida") {
      if (qty <= 0 || !formResponsavel.trim() || !formData || !formHora.trim()) return;
      const input = {
        quantidade: qty,
        responsavel: formResponsavel,
        dataIso: formData,
        hora: formHora,
        observacao: formObs,
      };
      if (sheet.kind === "entrada") entradaItem(activePlanilhaId, sheet.item.id, input);
      else saidaItem(activePlanilhaId, sheet.item.id, input);
    } else if (sheet.kind === "baixa") {
      darBaixaItem(activePlanilhaId, sheet.item.id, formMotivo);
    }
    closeSheet();
  }

  const sheetTitle =
    sheet?.kind === "planilhas"
      ? "Planilhas"
      : sheet?.kind === "add-item"
        ? "Novo material"
        : sheet?.kind === "edit"
          ? "Editar material"
          : sheet?.kind === "entrada"
            ? "Entrada"
            : sheet?.kind === "saida"
              ? "Retirada"
              : sheet?.kind === "baixa"
                ? "Dar baixa"
                : sheet?.kind === "item"
                  ? sheet.item.nome
                  : "";

  return (
    <div className="material-app relative flex h-full min-h-0 flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="shrink-0 px-4 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}alianca-ebenezer-logo.png`}
            alt="Aliança Ebenézer"
            className="h-11 w-11 shrink-0 rounded-full object-cover shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              Estoque
            </p>
            <h1 className="truncate text-lg font-semibold leading-tight">
              {activePlanilha?.nome ?? "Controle de material"}
            </h1>
          </div>
          <button
            type="button"
            className="rounded-full bg-[hsl(var(--muted))] px-3 py-2 text-xs font-semibold"
            onClick={() => setSheet({ kind: "planilhas" })}
          >
            Planilhas
          </button>
          <div className="material-theme-toggle" role="group" aria-label="Tema claro ou escuro">
            <button
              type="button"
              aria-pressed={theme === "light"}
              aria-label="Tema claro"
              className={theme === "light" ? "is-active" : undefined}
              onClick={() => onTheme("light")}
            >
              <Sun className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-pressed={theme === "dark"}
              aria-label="Tema escuro"
              className={theme === "dark" ? "is-active" : undefined}
              onClick={() => onTheme("dark")}
            >
              <Moon className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        {doc.planilhas.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {doc.planilhas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePlanilhaId(p.id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                  p.id === activePlanilhaId
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                )}
              >
                {p.nome}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
        {!initialLoadComplete ? (
          <p className="py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">A preparar o estoque…</p>
        ) : doc.planilhas.length === 0 ? (
          <EmptyState
            title="Nenhuma planilha ainda"
            text="Crie a primeira planilha para começar a controlar o material."
            action="Criar planilha"
            onAction={() => setSheet({ kind: "planilhas" })}
          />
        ) : tab === "estoque" ? (
          <EstoquePane
            search={search}
            onSearch={setSearch}
            showBaixados={showBaixados}
            onToggleBaixados={() => setShowBaixados((v) => !v)}
            stats={stats}
            items={filteredItems}
            onEntrada={(item) => openMove("entrada", item)}
            onSaida={(item) => openMove("saida", item)}
            onMore={(item) => setSheet({ kind: "item", item })}
          />
        ) : tab === "historico" ? (
          <HistoricoPane rows={movimentos} />
        ) : (
          <BalancoPane docPlanilhas={doc.planilhas} onPdf={() => downloadMaterialControleBalancoPdf(doc)} />
        )}
      </div>

      {tab === "estoque" && activePlanilha ? (
        <button
          type="button"
          className="material-app__fab"
          onClick={openAdd}
          aria-label="Adicionar material"
        >
          <Plus className="h-6 w-6" />
        </button>
      ) : null}

      <nav className="material-app__nav" aria-label="Secções do estoque">
        <NavButton active={tab === "estoque"} icon={<Boxes className="h-5 w-5" />} label="Estoque" onClick={() => setTab("estoque")} />
        <NavButton active={tab === "historico"} icon={<History className="h-5 w-5" />} label="Histórico" onClick={() => setTab("historico")} />
        <NavButton active={tab === "balanco"} icon={<ClipboardList className="h-5 w-5" />} label="Balanço" onClick={() => setTab("balanco")} />
      </nav>

      {sheet ? (
        <div className="material-app__sheet-backdrop" onClick={closeSheet} role="presentation">
          <div
            className="material-app__sheet"
            role="dialog"
            aria-label={sheetTitle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[hsl(var(--muted-foreground))]/30" />
            <div className="mb-4 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{sheetTitle}</h2>
              <button type="button" className="rounded-full p-2" onClick={closeSheet} aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            {sheet.kind === "planilhas" ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={novaPlanilhaNome}
                    onChange={(e) => setNovaPlanilhaNome(e.target.value)}
                    placeholder="Nome da planilha"
                    className={cn(sotFormInputClass, "text-base")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreatePlanilha();
                    }}
                  />
                  <button type="button" className="material-app__primary shrink-0 px-4" onClick={handleCreatePlanilha}>
                    Criar
                  </button>
                </div>
                {doc.planilhas.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-[hsl(var(--border))] p-3">
                    {renameId === p.id ? (
                      <div className="flex gap-2">
                        <input
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          className={cn(sotFormInputClass, "text-base")}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="material-app__primary shrink-0 px-3"
                          onClick={() => {
                            if (renameDraft.trim()) renamePlanilha(p.id, renameDraft);
                            setRenameId(null);
                          }}
                        >
                          Ok
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setActivePlanilhaId(p.id);
                          closeSheet();
                        }}
                      >
                        <p className="font-semibold">{p.nome}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {p.items.filter((it) => it.status === "ativo").length} ativos
                        </p>
                      </button>
                    )}
                    {renameId === p.id ? null : (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="material-app__ghost"
                          onClick={() => {
                            setRenameDraft(p.nome);
                            setRenameId(p.id);
                          }}
                        >
                          Renomear
                        </button>
                        <button
                          type="button"
                          className="material-app__ghost text-red-600"
                          onClick={() => {
                            if (window.confirm(`Excluir a planilha «${p.nome}» e todos os itens?`)) {
                              deletePlanilha(p.id);
                            }
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {sheet.kind === "item" ? (
              <div className="grid gap-2">
                <p className="mb-1 text-3xl font-semibold tabular-nums">{sheet.item.quantidade}</p>
                <p className="mb-2 text-sm text-[hsl(var(--muted-foreground))]">
                  {sheet.item.unidade || "unidades"} em stock
                  {sheet.item.observacao ? ` · ${sheet.item.observacao}` : ""}
                </p>
                {sheet.item.status === "ativo" ? (
                  <>
                    <button type="button" className="material-app__primary" onClick={() => openMove("entrada", sheet.item)}>
                      <ArrowDownCircle className="h-4 w-4" /> Entrada
                    </button>
                    <button type="button" className="material-app__warn" onClick={() => openMove("saida", sheet.item)}>
                      <ArrowUpCircle className="h-4 w-4" /> Retirada
                    </button>
                    <button type="button" className="material-app__ghost" onClick={() => openEdit(sheet.item)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="material-app__ghost"
                      onClick={() => {
                        setFormMotivo("");
                        setSheet({ kind: "baixa", item: sheet.item });
                      }}
                    >
                      Dar baixa
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="material-app__primary"
                    onClick={() => {
                      reativarItem(activePlanilhaId!, sheet.item.id);
                      closeSheet();
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Reativar
                  </button>
                )}
                <button
                  type="button"
                  className="material-app__ghost text-red-600"
                  onClick={() => {
                    if (window.confirm(`Excluir «${sheet.item.nome}» permanentemente?`)) {
                      deleteItem(activePlanilhaId!, sheet.item.id);
                      closeSheet();
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              </div>
            ) : null}

            {sheet.kind === "add-item" || sheet.kind === "edit" ? (
              <div className="space-y-3">
                <Field label="Nome">
                  <input value={formNome} onChange={(e) => setFormNome(e.target.value)} className={cn(sotFormInputClass, "text-base")} autoFocus />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantidade">
                    <input inputMode="decimal" value={formQty} onChange={(e) => setFormQty(e.target.value)} className={cn(sotFormInputClass, "text-base")} />
                  </Field>
                  <Field label="Unidade">
                    <input value={formUnidade} onChange={(e) => setFormUnidade(e.target.value)} placeholder="un, L, cx" className={cn(sotFormInputClass, "text-base")} />
                  </Field>
                </div>
                <Field label="Observação">
                  <textarea value={formObs} onChange={(e) => setFormObs(e.target.value)} rows={2} className={cn(sotFormTextareaClass, "text-base")} />
                </Field>
                <button type="button" className="material-app__primary w-full" onClick={confirmSheet}>
                  Guardar
                </button>
              </div>
            ) : null}

            {sheet.kind === "entrada" || sheet.kind === "saida" ? (
              <div className="space-y-3">
                <Field label="Quantidade">
                  <div className="flex items-center gap-2">
                    <button type="button" className="material-app__step" onClick={() => setFormQty(String(Math.max(1, parseQty(formQty) - 1)))}>
                      −
                    </button>
                    <input inputMode="decimal" value={formQty} onChange={(e) => setFormQty(e.target.value)} className={cn(sotFormInputClass, "text-center text-lg font-semibold")} />
                    <button type="button" className="material-app__step" onClick={() => setFormQty(String(parseQty(formQty) + 1))}>
                      +
                    </button>
                  </div>
                </Field>
                <Field label="Responsável">
                  <input value={formResponsavel} onChange={(e) => setFormResponsavel(e.target.value)} className={cn(sotFormInputClass, "text-base")} autoFocus />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Data">
                    <input type="date" value={formData} onChange={(e) => setFormData(e.target.value)} className={cn(sotFormInputClass, "text-base")} />
                  </Field>
                  <Field label="Hora">
                    <input type="time" value={formHora} onChange={(e) => setFormHora(e.target.value)} className={cn(sotFormInputClass, "text-base")} />
                  </Field>
                </div>
                {sheet.kind === "saida" ? (
                  <Field label="Observação">
                    <textarea value={formObs} onChange={(e) => setFormObs(e.target.value)} rows={2} className={cn(sotFormTextareaClass, "text-base")} />
                  </Field>
                ) : null}
                <button type="button" className={cn("w-full", sheet.kind === "entrada" ? "material-app__primary" : "material-app__warn")} onClick={confirmSheet}>
                  Confirmar {sheet.kind === "entrada" ? "entrada" : "retirada"}
                </button>
              </div>
            ) : null}

            {sheet.kind === "baixa" ? (
              <div className="space-y-3">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {sheet.item.nome} sai do stock ativo e a quantidade fica zerada.
                </p>
                <Field label="Motivo (opcional)">
                  <textarea value={formMotivo} onChange={(e) => setFormMotivo(e.target.value)} rows={2} className={cn(sotFormTextareaClass, "text-base")} />
                </Field>
                <button type="button" className="material-app__warn w-full" onClick={confirmSheet}>
                  Confirmar baixa
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-1 text-[0.65rem] font-semibold",
        active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-[hsl(var(--muted))]">
        <Boxes className="h-7 w-7 text-[hsl(var(--muted-foreground))]" />
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{text}</p>
      {action && onAction ? (
        <button type="button" className="material-app__primary mt-5 px-5" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

function EstoquePane({
  search,
  onSearch,
  showBaixados,
  onToggleBaixados,
  stats,
  items,
  onEntrada,
  onSaida,
  onMore,
}: {
  search: string;
  onSearch: (value: string) => void;
  showBaixados: boolean;
  onToggleBaixados: () => void;
  stats: { ativos: number; baixados: number; totalQty: number; zerados: number };
  items: MaterialItem[];
  onEntrada: (item: MaterialItem) => void;
  onSaida: (item: MaterialItem) => void;
  onMore: (item: MaterialItem) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Em stock" value={String(stats.totalQty)} />
        <Stat label="Ativos" value={String(stats.ativos)} />
        <Stat label="Zerados" value={String(stats.zerados)} />
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar material"
          className={cn(sotFormInputClass, "rounded-2xl pl-10 text-base")}
        />
      </div>
      <button
        type="button"
        onClick={onToggleBaixados}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-semibold",
          showBaixados ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
        )}
      >
        {showBaixados ? `Baixas visíveis (${stats.baixados})` : `Ocultar baixas (${stats.baixados})`}
      </button>
      {items.length === 0 ? (
        <EmptyState title="Nada por aqui" text="Adicione um material ou ajuste a busca." />
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3.5 shadow-sm">
              <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => onMore(item)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-semibold">{item.nome}</p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {item.unidade || "unidade"}
                    {item.status === "baixa" ? " · baixa" : item.quantidade <= 0 ? " · sem stock" : ""}
                  </p>
                </div>
                <p className={cn("text-2xl font-semibold tabular-nums leading-none", item.status === "baixa" && "text-[hsl(var(--muted-foreground))]")}>
                  {item.quantidade}
                </p>
              </button>
              {item.status === "ativo" ? (
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <button type="button" className="material-app__chip material-app__chip--in" onClick={() => onEntrada(item)}>
                    <ArrowDownCircle className="h-4 w-4" /> Entrada
                  </button>
                  <button type="button" className="material-app__chip material-app__chip--out" onClick={() => onSaida(item)}>
                    <ArrowUpCircle className="h-4 w-4" /> Saída
                  </button>
                  <button type="button" className="material-app__chip" onClick={() => onMore(item)} aria-label="Mais ações">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button type="button" className="material-app__ghost mt-3 w-full" onClick={() => onMore(item)}>
                  Ver baixa
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[hsl(var(--muted))]/70 px-2 py-2.5 text-center">
      <p className="text-lg font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[0.65rem] font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
    </div>
  );
}

function HistoricoPane({
  rows,
}: {
  rows: { id: string; itemNome: string; movimento: MaterialPlanilha["items"][number]["movimentos"][number] }[];
}) {
  if (rows.length === 0) {
    return <EmptyState title="Sem movimentação" text="Entradas e retiradas desta planilha aparecem aqui." />;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const entrada = row.movimento.tipo === "entrada";
        return (
          <li key={row.id} className="flex gap-3 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3.5">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
                entrada ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              {entrada ? "+" : "−"}
              {row.movimento.quantidade}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{row.itemNome}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {materialMovimentoTipoLabel(row.movimento.tipo)} · {row.movimento.responsavel}
              </p>
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{formatMaterialDateTime(row.movimento.at)}</p>
              {row.movimento.observacao ? (
                <p className="mt-1 text-xs">{row.movimento.observacao}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BalancoPane({
  docPlanilhas,
  onPdf,
}: {
  docPlanilhas: MaterialPlanilha[];
  onPdf: () => void;
}) {
  if (docPlanilhas.length === 0) {
    return <EmptyState title="Sem balanço" text="Crie uma planilha para ver o resumo do estoque." />;
  }
  return (
    <div className="space-y-4">
      <button type="button" className="material-app__primary w-full" onClick={onPdf}>
        <FileDown className="h-4 w-4" /> Gerar PDF
      </button>
      {docPlanilhas.map((planilha) => (
        <section key={planilha.id} className="overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <h2 className="border-b border-[hsl(var(--border))] px-4 py-3 text-sm font-semibold">{planilha.nome}</h2>
          {planilha.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[hsl(var(--muted-foreground))]">Sem itens.</p>
          ) : (
            <ul>
              {planilha.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 border-b border-[hsl(var(--border))]/60 px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.nome}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {it.status === "baixa" ? "Baixa" : "Ativo"}
                      {it.unidade ? ` · ${it.unidade}` : ""}
                    </p>
                  </div>
                  <p className="text-lg font-semibold tabular-nums">{it.quantidade}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
