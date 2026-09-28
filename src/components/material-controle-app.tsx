import {
  ArrowDownCircle,
  ArrowUpCircle,
  Bell,
  Boxes,
  CircleHelp,
  ClipboardList,
  Handshake,
  History,
  Moon,
  MoreHorizontal,
  Plus,
  Download,
  RotateCcw,
  Search,
  Settings,
  Sun,
  Table2,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMaterialControle } from "../context/material-controle-context";
import { formatMaterialDateTime } from "../lib/materialControleFormat";
import { downloadMaterialControleBalancoPdf } from "../lib/materialControlePdf";
import {
  emprestimoVencido,
  emprestimosAbertos,
  materialMovimentoIsoFromDateAndTime,
  quantidadeEmprestada,
  type MaterialEmprestimo,
  type MaterialItem,
} from "../lib/materialControleStorage";
import { sotFormInputClass, sotFormSelectClass, sotFormTextareaClass } from "../lib/sotFormFieldClasses";
import { cn } from "../lib/utils";
import { MaterialBalancoPane } from "./material-balanco-pane";

const UNIDADES = ["UN", "QTD", "KG", "PAR"] as const;

type Tab = "estoque" | "historico" | "balanco";

type Sheet =
  | { kind: "ajuda" }
  | { kind: "config" }
  | { kind: "devolucoes" }
  | { kind: "planilhas" }
  | { kind: "add-item" }
  | { kind: "item"; item: MaterialItem }
  | { kind: "edit"; item: MaterialItem }
  | { kind: "entrada"; item: MaterialItem }
  | { kind: "saida"; item: MaterialItem }
  | { kind: "baixa"; item: MaterialItem }
  | { kind: "emprestimo"; item: MaterialItem };

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

function itemAlarmeEmprestimo(item: MaterialItem, nowMs: number): number | null {
  if (item.status !== "ativo") return null;
  let earliest: number | null = null;
  for (const emprestimo of emprestimosAbertos(item)) {
    if (!emprestimoVencido(emprestimo, nowMs) || !emprestimo.devolverEm) continue;
    const at = new Date(emprestimo.devolverEm).getTime();
    if (!Number.isFinite(at)) continue;
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

function parseQty(value: string) {
  return Math.max(0, Number.parseFloat(value.replace(",", ".")) || 0);
}

type MaterialTheme = "light" | "dark";
const MATERIAL_THEME_KEY = "sot-material-avulso-theme";
const BELL_LATER_KEY = "sot-material-avulso-bell-later";

function readBellLater(): string[] {
  try {
    const raw = localStorage.getItem(BELL_LATER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

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
    emprestarItem,
    devolverEmprestimo,
    restoreDoc,
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
  const [formDevolverData, setFormDevolverData] = useState("");
  const [formDevolverHora, setFormDevolverHora] = useState("");
  const [loanError, setLoanError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [backupMessage, setBackupMessage] = useState("");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [bellLater, setBellLater] = useState<string[]>(readBellLater);

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
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!sheet || !("item" in sheet)) return;
    const fresh = doc.planilhas.flatMap((p) => p.items).find((it) => it.id === sheet.item.id);
    if (!fresh || fresh === sheet.item) return;
    setSheet((current) =>
      current && "item" in current && current.item.id === fresh.id ? { ...current, item: fresh } : current,
    );
  }, [doc, sheet]);

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
    const items = activePlanilha.items.filter((it) => {
      if (!showBaixados && it.status === "baixa") return false;
      if (!q) return true;
      return (
        it.nome.toLowerCase().includes(q) ||
        it.unidade.toLowerCase().includes(q) ||
        it.observacao.toLowerCase().includes(q)
      );
    });
    return items
      .map((item, index) => ({
        item,
        index,
        dueAt: itemAlarmeEmprestimo(item, nowMs),
      }))
      .sort((a, b) => {
        if (a.dueAt !== b.dueAt) {
          if (a.dueAt === null) return 1;
          if (b.dueAt === null) return -1;
          return a.dueAt - b.dueAt;
        }
        return a.index - b.index;
      })
      .map(({ item }) => item);
  }, [activePlanilha, search, showBaixados, nowMs]);

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

  const historico = useMemo(() => {
    if (!activePlanilha) return [];
    const rows: HistoryRow[] = [];
    for (const item of activePlanilha.items) {
      for (const movimento of item.movimentos) {
        rows.push({
          id: movimento.id,
          itemNome: item.nome,
          unidade: item.unidade || "UN",
          at: movimento.at,
          quantidade: movimento.quantidade,
          responsavel: movimento.responsavel,
          kind: movimento.tipo,
          detalhe: movimento.observacao,
        });
      }
      for (const emprestimo of item.emprestimos) {
        rows.push({
          id: emprestimo.id,
          itemNome: item.nome,
          unidade: item.unidade || "UN",
          at: emprestimo.emprestadoEm,
          quantidade: emprestimo.quantidade,
          responsavel: emprestimo.responsavel,
          kind: "emprestimo",
          detalhe: emprestimo.devolverEm ? `Entrega ${formatMaterialDateTime(emprestimo.devolverEm)}` : "",
        });
        if (emprestimo.devolvidoEm) {
          rows.push({
            id: `${emprestimo.id}-devolucao`,
            itemNome: item.nome,
            unidade: item.unidade || "UN",
            at: emprestimo.devolvidoEm,
            quantidade: emprestimo.quantidade,
            responsavel: emprestimo.responsavel,
            kind: "devolucao",
            detalhe: "",
          });
        }
      }
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [activePlanilha]);

  const dueLoans = useMemo(() => {
    const alerts: { planilhaId: string; item: MaterialItem; emprestimo: MaterialEmprestimo }[] = [];
    for (const planilha of doc.planilhas) {
      for (const item of planilha.items) {
        if (item.status !== "ativo") continue;
        for (const emprestimo of item.emprestimos) {
          if (emprestimoVencido(emprestimo, nowMs)) alerts.push({ planilhaId: planilha.id, item, emprestimo });
        }
      }
    }
    return alerts;
  }, [doc.planilhas, nowMs]);

  const bellLoans = useMemo(
    () => dueLoans.filter((alert) => !bellLater.includes(alert.emprestimo.id)),
    [dueLoans, bellLater],
  );

  useEffect(() => {
    try {
      localStorage.setItem(BELL_LATER_KEY, JSON.stringify(bellLater));
    } catch {
      /* ignore */
    }
  }, [bellLater]);

  function closeSheet() {
    setSheet(null);
    setRenameId(null);
  }

  function postponeReturns() {
    setBellLater((prev) => [...new Set([...prev, ...bellLoans.map((alert) => alert.emprestimo.id)])]);
    closeSheet();
  }

  async function downloadBackup() {
    const { buildMaterialBackup } = await import("../lib/materialControleBackup");
    const blob = buildMaterialBackup(doc);
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `estoque-${stamp}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupMessage("Backup baixado.");
  }

  async function loadBackup(file: File) {
    if (!window.confirm("Este arquivo substitui todo o estoque atual. Deseja continuar?")) return;
    try {
      const { parseMaterialBackup } = await import("../lib/materialControleBackup");
      restoreDoc(await parseMaterialBackup(await file.arrayBuffer()));
      setBackupMessage("Estoque recuperado a partir do backup.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    }
  }

  function confirmReturn(planilhaId: string, itemId: string, emprestimoId: string) {
    devolverEmprestimo(planilhaId, itemId, emprestimoId);
    setBellLater((prev) => prev.filter((id) => id !== emprestimoId));
    if (bellLoans.filter((alert) => alert.emprestimo.id !== emprestimoId).length === 0) closeSheet();
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

  function openLoan(item: MaterialItem) {
    setFormQty("1");
    setFormResponsavel("");
    setFormData(todayIso());
    setFormDevolverData("");
    setFormDevolverHora("");
    setLoanError("");
    setSheet({ kind: "emprestimo", item });
  }

  function openAdd() {
    setFormNome("");
    setFormQty("1");
    setFormUnidade("UN");
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
    } else if (sheet.kind === "emprestimo") {
      if (qty <= 0 || !formResponsavel.trim() || !formData) {
        setLoanError("Informe a quantidade, o nome e a data.");
        return;
      }
      const dataDev = formDevolverData.trim();
      const horaDev = formDevolverHora.trim();
      if ((dataDev && !horaDev) || (!dataDev && horaDev)) {
        setLoanError("A devolução é opcional. Se preencher, use a data e a hora juntas.");
        return;
      }
      const devolverEm = dataDev && horaDev ? materialMovimentoIsoFromDateAndTime(dataDev, horaDev) : null;
      if (dataDev && horaDev && !devolverEm) {
        setLoanError("Data ou hora de devolução inválida.");
        return;
      }
      const ok = emprestarItem(activePlanilhaId, sheet.item.id, {
        quantidade: qty,
        responsavel: formResponsavel,
        dataIso: formData,
        devolverEm,
      });
      if (!ok) {
        setLoanError("Não há quantidade suficiente para este empréstimo.");
        return;
      }
    } else if (sheet.kind === "baixa") {
      darBaixaItem(activePlanilhaId, sheet.item.id, formMotivo);
    }
    closeSheet();
  }

  const sheetTitle =
    sheet?.kind === "ajuda"
      ? "Como usar"
      : sheet?.kind === "config"
        ? "Configurações"
        : sheet?.kind === "devolucoes"
        ? "Registrar devolução"
        : sheet?.kind === "planilhas"
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
                : sheet?.kind === "emprestimo"
                  ? "Empréstimo"
                  : sheet?.kind === "item"
                  ? sheet.item.nome
                  : "";

  return (
    <div className="material-app relative flex h-full min-h-0 flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <img
        src={`${import.meta.env.BASE_URL}alianca-ebenezer-logo.png`}
        alt=""
        aria-hidden="true"
        className="material-app__watermark"
      />
      <header className="relative z-[15] shrink-0 px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <img
            src={`${import.meta.env.BASE_URL}alianca-ebenezer-logo.png`}
            alt="Aliança Ebenézer"
            className="h-11 w-11 shrink-0 rounded-full object-cover shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              Estoque
            </p>
            {activePlanilha ? (
              <h1 className="truncate text-lg font-semibold leading-tight">{activePlanilha.nome}</h1>
            ) : null}
          </div>
          {bellLoans.length > 0 ? (
            <button
              type="button"
              className="material-loan-bell flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
              onClick={() => setSheet({ kind: "devolucoes" })}
              aria-label="Devoluções pendentes"
              title="Devoluções pendentes"
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}
          <button
            type="button"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
            onClick={() => setSheet({ kind: "planilhas" })}
            aria-label="Planilhas"
            title="Planilhas"
          >
            <Table2 className="h-5 w-5" strokeWidth={1.75} />
            <Plus className="absolute bottom-1 right-1 h-3 w-3" strokeWidth={2.75} />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
            onClick={() => setSheet({ kind: "ajuda" })}
            aria-label="Como usar"
            title="Como usar"
          >
            <CircleHelp className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
            onClick={() => setSheet({ kind: "config" })}
            aria-label="Configurações"
            title="Configurações"
          >
            <Settings className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        {doc.planilhas.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {doc.planilhas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePlanilhaId(p.id)}
                className={cn(
                  "material-planilha-tab shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                  p.id === activePlanilhaId
                    ? "is-active"
                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                )}
              >
                {p.nome}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-4 pb-28">
        {!initialLoadComplete ? (
          <p className="py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">A preparar o estoque…</p>
        ) : doc.planilhas.length === 0 ? (
          <EmptyState
            title="Nenhuma organização ainda"
            text="Gere a primeira organização para começar a controlar o material."
            action="Gerar organização"
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
            nowMs={nowMs}
            onEntrada={(item) => openMove("entrada", item)}
            onSaida={(item) => openMove("saida", item)}
            onEmprestimo={openLoan}
            onMore={(item) => setSheet({ kind: "item", item })}
          />
        ) : tab === "historico" ? (
          <HistoricoPane rows={historico} />
        ) : (
          <MaterialBalancoPane planilhas={doc.planilhas} nowMs={nowMs} onPdf={() => downloadMaterialControleBalancoPdf(doc)} />
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
        <div
          className={cn(
            "material-app__sheet-backdrop",
            sheet.kind === "add-item" && "material-app__sheet-backdrop--top",
          )}
          onClick={closeSheet}
          role="presentation"
        >
          <div
            className={cn("material-app__sheet", sheet.kind === "add-item" && "material-app__sheet--top")}
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

            {sheet.kind === "ajuda" ? <HelpGuide /> : null}

            {sheet.kind === "config" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Tema</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Claro ou escuro</p>
                  </div>
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
                <div className="rounded-2xl border border-[hsl(var(--border))] px-3 py-3">
                  <p className="text-sm font-semibold">Backup</p>
                  <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                    Gera um Excel com organizações, materiais, movimentos e empréstimos. O mesmo arquivo recupera o estoque inteiro.
                  </p>
                  <div className="mt-3 grid gap-2">
                    <button type="button" className="material-app__primary w-full" onClick={() => void downloadBackup()}>
                      <Download className="h-4 w-4" /> Baixar backup .xlsx
                    </button>
                    <button type="button" className="material-app__ghost w-full" onClick={() => backupInputRef.current?.click()}>
                      <Upload className="h-4 w-4" /> Carregar backup .xlsx
                    </button>
                  </div>
                  <input
                    ref={backupInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void loadBackup(file);
                    }}
                  />
                  {backupMessage ? <p className="mt-2 text-xs font-medium">{backupMessage}</p> : null}
                </div>
              </div>
            ) : null}

            {sheet.kind === "devolucoes" ? (
              <div className="space-y-3">
                {bellLoans.map((alert) => (
                  <div key={alert.emprestimo.id} className="material-loan-note">
                    <p>{alert.emprestimo.responsavel}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {alert.emprestimo.devolverEm ? formatMaterialDateTime(alert.emprestimo.devolverEm) : ""}
                    </p>
                    <button
                      type="button"
                      className="material-loan-chip mt-3 w-full"
                      onClick={() => confirmReturn(alert.planilhaId, alert.item.id, alert.emprestimo.id)}
                    >
                      Registrar devolução
                    </button>
                  </div>
                ))}
                <button type="button" className="material-app__ghost w-full" onClick={postponeReturns}>
                  Registrar devolução depois
                </button>
              </div>
            ) : null}

            {sheet.kind === "planilhas" ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2">
                  <input
                    value={novaPlanilhaNome}
                    onChange={(e) => setNovaPlanilhaNome(e.target.value)}
                    placeholder="Sala, Armário, Prateleira..."
                    className={cn(sotFormInputClass, "text-base")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreatePlanilha();
                    }}
                  />
                  <button type="button" className="material-app__primary w-full" onClick={handleCreatePlanilha}>
                    Gerar organização
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
                {emprestimosAbertos(sheet.item).length > 0 ? (
                  <div className="mb-2 space-y-2">
                    {emprestimosAbertos(sheet.item).map((emprestimo) => (
                      <div key={emprestimo.id} className="material-loan-note">
                        <p>
                          Emprestado: {emprestimo.quantidade} {sheet.item.unidade || "UN"} · {emprestimo.responsavel}
                        </p>
                        <p className="mt-0.5 text-xs font-medium opacity-80">
                          {emprestimo.devolverEm
                            ? `Devolver em ${formatMaterialDateTime(emprestimo.devolverEm)}`
                            : "Sem data de devolução"}
                        </p>
                        <button
                          type="button"
                          className="material-app__ghost mt-2 w-full"
                          onClick={() => {
                            if (!activePlanilhaId) return;
                            devolverEmprestimo(activePlanilhaId, sheet.item.id, emprestimo.id);
                          }}
                        >
                          Registrar devolução
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {sheet.item.status === "ativo" ? (
                  <>
                    <button type="button" className="material-app__primary" onClick={() => openMove("entrada", sheet.item)}>
                      <ArrowDownCircle className="h-4 w-4" /> Entrada
                    </button>
                    <button type="button" className="material-app__warn" onClick={() => openMove("saida", sheet.item)}>
                      <ArrowUpCircle className="h-4 w-4" /> Retirada
                    </button>
                    <button type="button" className="material-loan-chip" onClick={() => openLoan(sheet.item)}>
                      <Handshake className="h-4 w-4" /> Empréstimo
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
                    <select
                      value={formUnidade}
                      onChange={(e) => setFormUnidade(e.target.value)}
                      className={cn(sotFormSelectClass, "text-base")}
                    >
                      {UNIDADES.map((unidade) => (
                        <option key={unidade} value={unidade}>
                          {unidade}
                        </option>
                      ))}
                      {formUnidade && !UNIDADES.includes(formUnidade as (typeof UNIDADES)[number]) ? (
                        <option value={formUnidade}>{formUnidade}</option>
                      ) : null}
                    </select>
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

            {sheet.kind === "emprestimo" ? (
              <div className="space-y-3">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Disponível para empréstimo: {Math.max(0, sheet.item.quantidade - quantidadeEmprestada(sheet.item))}{" "}
                  {sheet.item.unidade || "UN"}
                </p>
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
                <Field label="Quem pegou emprestado">
                  <input value={formResponsavel} onChange={(e) => setFormResponsavel(e.target.value)} className={cn(sotFormInputClass, "text-base")} autoFocus />
                </Field>
                <Field label="Data">
                  <input type="date" value={formData} onChange={(e) => setFormData(e.target.value)} className={cn(sotFormInputClass, "text-base")} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Devolução (opcional)">
                    <input type="date" value={formDevolverData} onChange={(e) => setFormDevolverData(e.target.value)} className={cn(sotFormInputClass, "text-base")} />
                  </Field>
                  <Field label="Hora (opcional)">
                    <input type="time" value={formDevolverHora} onChange={(e) => setFormDevolverHora(e.target.value)} className={cn(sotFormInputClass, "text-base")} />
                  </Field>
                </div>
                {loanError ? <p className="text-sm font-medium text-orange-600">{loanError}</p> : null}
                <button type="button" className="material-loan-chip w-full" onClick={confirmSheet}>
                  <Handshake className="h-4 w-4" /> Confirmar empréstimo
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

const GUIDE_STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Table2,
    title: "Crie o lugar",
    text: "Toque na planilha com + e dê um nome: sala, armário ou prateleira.",
  },
  {
    icon: Plus,
    title: "Inclua o material",
    text: "Na aba Estoque, toque no + e informe o nome e a quantidade.",
  },
  {
    icon: ArrowDownCircle,
    title: "Registre a entrada",
    text: "Quando chegar material, abra o item e toque em Entrada.",
  },
  {
    icon: ArrowUpCircle,
    title: "Registre a retirada",
    text: "Quando alguém levar, toque em Retirada e informe quem levou.",
  },
  {
    icon: Handshake,
    title: "Empreste",
    text: "Toque em Empréstimo, diga quem pegou, a data e a quantidade. A hora de devolver é opcional.",
  },
  {
    icon: Boxes,
    title: "Dê baixa",
    text: "Se acabou ou saiu de uso, dê baixa. O item sai da lista e pode voltar depois.",
  },
  {
    icon: ClipboardList,
    title: "Acompanhe",
    text: "Histórico mostra cada movimento. Balanço mostra o que resta e gera o PDF.",
  },
];

function HelpGuide() {
  return (
    <div className="material-guide">
      <div className="material-guide__lead">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          Guia rápido
        </p>
        <p className="mt-1 text-sm leading-relaxed">
          Controle o que entra, o que sai e o que ainda resta. Cada passo abaixo é um toque.
        </p>
      </div>
      {GUIDE_STEPS.map((step, index) => {
        const Icon = step.icon;
        return (
          <div key={step.title} className="material-guide__step">
            <span className="material-guide__mark" aria-hidden="true">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="text-sm font-semibold leading-tight">{step.title}</p>
              <p className="mt-0.5 text-sm leading-snug text-[hsl(var(--muted-foreground))]">{step.text}</p>
            </div>
          </div>
        );
      })}
    </div>
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
  nowMs,
  onEntrada,
  onSaida,
  onEmprestimo,
  onMore,
}: {
  search: string;
  onSearch: (value: string) => void;
  showBaixados: boolean;
  onToggleBaixados: () => void;
  stats: { ativos: number; baixados: number; totalQty: number; zerados: number };
  items: MaterialItem[];
  nowMs: number;
  onEntrada: (item: MaterialItem) => void;
  onSaida: (item: MaterialItem) => void;
  onEmprestimo: (item: MaterialItem) => void;
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
          {items.map((item) => {
            const abertos = emprestimosAbertos(item);
            const emprestado = abertos.reduce((sum, e) => sum + e.quantidade, 0);
            const due = abertos.some((e) => emprestimoVencido(e, nowMs));
            return (
            <li
              key={item.id}
              className={cn(
                "material-item-card rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.78)] p-3.5 shadow-sm",
                due && "material-item-card--due",
              )}
            >
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
              {emprestado > 0 ? (
                <p className="material-item-card__loan">
                  Emprestado: {emprestado} {item.unidade || "UN"}
                </p>
              ) : null}
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
                  <button type="button" className="material-loan-chip col-span-3" onClick={() => onEmprestimo(item)}>
                    <Handshake className="h-4 w-4" /> Empréstimo
                  </button>
                </div>
              ) : (
                <button type="button" className="material-app__ghost mt-3 w-full" onClick={() => onMore(item)}>
                  Ver baixa
                </button>
              )}
            </li>
            );
          })}
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

type HistoryKind = "entrada" | "saida" | "emprestimo" | "devolucao";

type HistoryRow = {
  id: string;
  itemNome: string;
  unidade: string;
  at: string;
  quantidade: number;
  responsavel: string;
  kind: HistoryKind;
  detalhe: string;
};

function historyKindLabel(kind: HistoryKind): string {
  if (kind === "entrada") return "Entrada";
  if (kind === "saida") return "Retirada";
  if (kind === "emprestimo") return "Empréstimo";
  return "Devolução";
}

function HistoricoPane({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Sem movimentação"
        text="Entradas, retiradas, empréstimos e devoluções desta planilha aparecem aqui."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="flex gap-3 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3.5">
          <div
            className={cn(
              "material-history-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
              row.kind === "entrada" && "material-history-mark--in",
              row.kind === "saida" && "material-history-mark--out",
              row.kind === "emprestimo" && "material-history-mark--loan",
              row.kind === "devolucao" && "material-history-mark--back",
            )}
          >
            {row.kind === "entrada" ? "+" : row.kind === "saida" ? "−" : ""}
            {row.quantidade}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{row.itemNome}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {historyKindLabel(row.kind)} · {row.quantidade} {row.unidade} · {row.responsavel}
            </p>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              {row.kind === "emprestimo"
                ? new Date(row.at).toLocaleDateString("pt-BR")
                : formatMaterialDateTime(row.at)}
            </p>
            {row.detalhe ? <p className="mt-1 text-xs">{row.detalhe}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

