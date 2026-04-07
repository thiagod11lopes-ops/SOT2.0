import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDeparturesReportEmail } from "../context/departures-report-email-context";
import { useMotoristaPao } from "../context/motorista-pao-context";
import { useDepartures } from "../context/departures-context";
import { useSyncPreference } from "../context/sync-preference-context";
import { getDepartureReferenceDate } from "../lib/dateFormat";
import type { DepartureRecord } from "../types/departure";
import type { DeparturesExportFile } from "../lib/adminDeparturesExport";
import { parseDeparturesFromImportFile } from "../lib/adminDeparturesExport";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type SavePeriodMode = "full" | "month" | "year";

function currentMonthInputValue() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function filterDeparturesForSave(
  rows: DepartureRecord[],
  mode: SavePeriodMode,
  year: number,
  month: number,
): { selected: DepartureRecord[]; skippedNoDate: number } {
  if (mode === "full") return { selected: rows, skippedNoDate: 0 };
  const selected: DepartureRecord[] = [];
  let skippedNoDate = 0;
  for (const r of rows) {
    const d = getDepartureReferenceDate(r);
    if (!d) {
      skippedNoDate++;
      continue;
    }
    if (mode === "year") {
      if (d.getFullYear() === year) selected.push(r);
    } else {
      if (d.getFullYear() === year && d.getMonth() + 1 === month) selected.push(r);
    }
  }
  return { selected, skippedNoDate };
}

export function SettingsPage() {
  const { items: catalogItems } = useCatalogItems();
  const { nome: motoristaPao, setNome: setMotoristaPao } = useMotoristaPao();
  const { departures, mergeDeparturesFromBackup, clearAllDepartures, cloudDeparturesSync } = useDepartures();
  const { firebaseOnlyEnabled, setFirebaseOnlyEnabled } = useSyncPreference();
  const { email: reportEmailStored, setEmail: setReportEmailStored } = useDeparturesReportEmail();
  const [reportEmailDest, setReportEmailDest] = useState(reportEmailStored);
  useEffect(() => {
    setReportEmailDest(reportEmailStored);
  }, [reportEmailStored]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savePeriodMode, setSavePeriodMode] = useState<SavePeriodMode>("full");
  const [saveMonthValue, setSaveMonthValue] = useState(currentMonthInputValue);
  const [saveYearValue, setSaveYearValue] = useState(() => String(new Date().getFullYear()));

  const administrativas = useMemo(
    () => departures.filter((d) => d.tipo === "Administrativa"),
    [departures],
  );
  const ambulancias = useMemo(
    () => departures.filter((d) => d.tipo === "Ambulância"),
    [departures],
  );

  function handleSalvarSaidas() {
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    if (savePeriodMode === "month") {
      const parts = saveMonthValue.split("-");
      year = Number(parts[0]);
      month = Number(parts[1]);
      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        window.alert("Selecione um mês/ano válidos.");
        return;
      }
    } else if (savePeriodMode === "year") {
      year = Number(saveYearValue);
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        window.alert("Informe um ano válido (2000–2100).");
        return;
      }
    }

    const { selected, skippedNoDate } = filterDeparturesForSave(
      departures,
      savePeriodMode,
      year,
      month,
    );

    if (selected.length === 0) {
      window.alert(
        "Nenhuma saída no período selecionado. Verifique o filtro ou se as datas de saída/pedido estão preenchidas.",
      );
      return;
    }

    const payload: DeparturesExportFile = {
      version: 1,
      tipo: "saidas",
      exportadoEm: new Date().toISOString(),
      saidas: selected,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    let name: string;
    if (savePeriodMode === "full") {
      name = `sot_saidas_completo_${stamp}.json`;
    } else if (savePeriodMode === "year") {
      name = `Saídas (${year}).json`;
    } else {
      name = `Saídas (${String(month).padStart(2, "0")}-${year}).json`;
    }
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);

    if (skippedNoDate > 0 && savePeriodMode !== "full") {
      window.alert(
        `${selected.length} saída(s) exportada(s). ${skippedNoDate} registro(s) sem data de saída/pedido foram ignorados pelo filtro.`,
      );
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as unknown;
        const rows = parseDeparturesFromImportFile(data);
        if (rows.length === 0) {
          window.alert("Nenhuma saída válida foi encontrada no arquivo.");
          return;
        }
        mergeDeparturesFromBackup(rows);
        window.alert(
          `${rows.length} registro(s) processado(s). Itens com id já existente foram mantidos; apenas entradas novas foram adicionadas.`,
        );
      } catch {
        window.alert("Não foi possível ler o arquivo. Verifique se é um JSON válido.");
      }
    };
    reader.readAsText(file);
  }

  function handleExcluirTodas() {
    if (
      !window.confirm(
        "Excluir TODAS as saídas (administrativas e ambulância)? Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    clearAllDepartures();
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Configurações</CardTitle>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Exportação e importação de saídas (administrativas e ambulância) e limpeza geral do cadastro.
        </p>
        {cloudDeparturesSync.enabled ? (
          <div
            className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25 px-3 py-2 text-sm"
            role="status"
          >
            <p className="font-semibold text-[hsl(var(--foreground))]">Nuvem (Firebase)</p>
            {cloudDeparturesSync.status === "connecting" ? (
              <p className="text-[hsl(var(--muted-foreground))]">A ligar e a sincronizar saídas…</p>
            ) : null}
            {cloudDeparturesSync.status === "live" ? (
              <p className="text-[hsl(var(--muted-foreground))]">
                Sincronização ativa: saídas e restantes dados da app (catálogo, avisos, oficina, limpeza, manutenções,
                escala do pão, cidades extras no formulário, etc.) são gravados no Firestore e partilhados entre
                dispositivos com as mesmas chaves Firebase.
              </p>
            ) : null}
            {cloudDeparturesSync.status === "error" ? (
              <p className="font-medium text-red-600 dark:text-red-400">
                {cloudDeparturesSync.message ?? "Erro ao sincronizar. Verifique rede, regras Firestore e login anónimo."}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Dados guardados só neste navegador (IndexedDB). Para sincronizar saídas e o restante estado da app na nuvem,
            configure as variáveis Firebase no build (ver{" "}
            <code className="rounded bg-[hsl(var(--muted))]/50 px-1">.env.example</code>).
          </p>
        )}
        <p className="text-[0.7rem] leading-snug text-[hsl(var(--muted-foreground))]">
          <span className="font-semibold text-[hsl(var(--foreground))]">Diagnóstico:</span>{" "}
          <code className="rounded bg-[hsl(var(--muted))]/40 px-1">VITE_FIREBASE_PROJECT_ID</code> neste site ={" "}
          {import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ? (
            <span className="font-mono text-[hsl(var(--foreground))]">
              {import.meta.env.VITE_FIREBASE_PROJECT_ID}
            </span>
          ) : (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              vazio — o site foi gerado sem Firebase; nada é gravado no Firestore. No GitHub: Configurações → Segredos e
              variáveis → Ações → crie os segredos <code className="font-mono">VITE_FIREBASE_*</code> e execute de novo o
              fluxo de implantação (ou envie um novo commit à ramo principal).
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Modo de sincronização</h3>
          <label className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] p-3">
            <input
              type="checkbox"
              checked={firebaseOnlyEnabled}
              onChange={(e) => setFirebaseOnlyEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">
              Usar somente dados do Firebase (local apenas como cache de leitura)
            </span>
          </label>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Quando ativo: o sistema lê/escreve na nuvem e não promove dados locais antigos para o Firebase no bootstrap.
            Quando desativado: funciona apenas com dados locais (IndexedDB/localStorage), sem sincronização com a nuvem.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Saídas</h3>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            <strong>Salvar</strong> gera um arquivo JSON com as saídas (administrativas e ambulância) conforme o{" "}
            <strong>período</strong> escolhido. O filtro usa a <strong>data da saída</strong>; se estiver vazia, usa a{" "}
            <strong>data do pedido</strong>.
          </p>
          <div className="flex max-w-xl flex-col gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="save-period-mode">
              Período do arquivo
            </label>
            <select
              id="save-period-mode"
              value={savePeriodMode}
              onChange={(e) => setSavePeriodMode(e.target.value as SavePeriodMode)}
              className="h-10 w-full max-w-sm rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
            >
              <option value="full">Completo (todas as saídas)</option>
              <option value="month">Por mês</option>
              <option value="year">Por ano</option>
            </select>
            {savePeriodMode === "month" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[hsl(var(--muted-foreground))]" htmlFor="save-month">
                  Mês e ano
                </label>
                <input
                  id="save-month"
                  type="month"
                  value={saveMonthValue}
                  onChange={(e) => setSaveMonthValue(e.target.value)}
                  className="h-10 w-full max-w-sm rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                />
              </div>
            ) : null}
            {savePeriodMode === "year" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[hsl(var(--muted-foreground))]" htmlFor="save-year">
                  Ano
                </label>
                <input
                  id="save-year"
                  type="number"
                  min={2000}
                  max={2100}
                  step={1}
                  value={saveYearValue}
                  onChange={(e) => setSaveYearValue(e.target.value)}
                  className="h-10 w-full max-w-sm rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                />
              </div>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            <strong>Carregar</strong> aceita o JSON exportado aqui, ou um <strong>backup completo do sistema</strong>{" "}
            (arquivo com <code className="text-xs">viaturasCadastradas</code>, ex. backup do navegador). Nesse caso
            importam-se <strong>todas</strong> as saídas reconhecidas (administrativa e ambulância). Só são{" "}
            <strong>adicionados</strong> registros cujo id ainda não existe; ids já presentes não são substituídos.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="default" onClick={handleSalvarSaidas}>
              Salvar saídas
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              Carregar saídas
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Saídas administrativas: <strong>{administrativas.length}</strong> · Ambulâncias:{" "}
            <strong>{ambulancias.length}</strong> · Total geral: <strong>{departures.length}</strong>
          </p>
        </section>

        <section className="space-y-3 border-t border-[hsl(var(--border))] pt-6">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Motorista do pão (cabeçalho)</h3>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            Se definir a <strong>Escala do Pão</strong> (clique no cartão com o ícone de padaria no canto superior
            direito), o cabeçalho mostra o <strong>próximo integrante</strong> a partir de{" "}
            <strong>amanhã</strong>, com a <strong>data</strong> desse dia à direita. Saltam-se sábados, domingos e dias
            marcados como Feriado, RD, Lic Pag, Recesso ou Licença até haver um nome atribuído. Se não houver ninguém
            previsto à frente na escala, usa-se o nome abaixo. Os integrantes da escala definem-se no modal{" "}
            <strong>Escala do Pão</strong>; aqui pode indicar um nome à mão para o cabeçalho ou escolher da lista de{" "}
            <strong>Motorista</strong> em <strong>Frota e Pessoal</strong>.
          </p>
          <div className="flex max-w-xl flex-col gap-2">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="motorista-pao-nome">
              Motorista
            </label>
            <input
              id="motorista-pao-nome"
              type="text"
              list="motoristas-pao-datalist"
              autoComplete="off"
              placeholder="Nome do motorista"
              value={motoristaPao}
              onChange={(e) => setMotoristaPao(e.target.value)}
              className="h-10 w-full max-w-md rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
            />
            <datalist id="motoristas-pao-datalist">
              {catalogItems.motoristas.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </section>

        <section className="space-y-3 border-t border-[hsl(var(--border))] pt-6">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">E-mail do relatório PDF</h3>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            Endereço usado pelo botão <strong>Enviar</strong>: abre o <strong>Gmail na Web</strong> (conta já iniciada no
            navegador) com este destinatário e o assunto <strong>Saídas</strong>. O PDF é descarregado em seguida — o
            Gmail <strong>não permite</strong> anexar ficheiros automaticamente por ligação; anexe o ficheiro descarregado
            (ícone de clip ou arrastar para a janela de novo e-mail).
          </p>
          <div className="flex max-w-xl flex-col gap-2">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="report-email-dest">
              E-mail de destino
            </label>
            <input
              id="report-email-dest"
              type="email"
              autoComplete="email"
              placeholder="exemplo@instituicao.pt"
              value={reportEmailDest}
              onChange={(e) => setReportEmailDest(e.target.value)}
              onBlur={() => setReportEmailStored(reportEmailDest)}
              className="h-10 w-full max-w-md rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
            />
          </div>
        </section>

        <section className="space-y-3 border-t border-[hsl(var(--border))] pt-6">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Zona de risco</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Remove todas as saídas da memória (incluindo ambulância). Não afeta o arquivo de backup estático
            do SOT, se existir.
          </p>
          <Button type="button" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={handleExcluirTodas}>
            Excluir todas as saídas
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}
