import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCatalogItems } from "../context/catalog-items-context";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { cn } from "../lib/utils";
import { downloadRelatorioDiarioViaturasPdf } from "../lib/relatorioDiarioViaturasPdf";
import {
  countResumoSituacao,
  createInitialRdvRows,
  emptyAdmRow,
  emptyAmbRow,
  RDV_STATUS_OPTIONS,
  type RdvRowAdm,
  type RdvRowAmb,
  type RdvStatus,
  weekdayPtBrFromIsoDate,
} from "../lib/relatorioDiarioViaturasModel";

function clearCarroQuebradoHash() {
  window.location.hash = "";
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const tableFrame = cn(
  "w-full border-collapse border border-slate-900 text-[9pt]",
  "[&_th]:border [&_td]:border [&_th]:border-slate-900 [&_td]:border-slate-900",
  "[&_th]:bg-[#e2f0d9]/90 [&_th]:p-1 [&_td]:p-1",
);

const sectionBar =
  "mt-4 border border-b-0 border-slate-900 bg-[#e2f0d9] px-2 py-1 text-left text-[9pt] font-bold";

const cellInput = cn(
  "w-full min-w-0 border-0 bg-transparent p-0.5 text-center text-[9pt] text-inherit outline-none",
  "focus:ring-1 focus:ring-blue-500/50",
);

const cellInputLeft = cn(cellInput, "text-left");

function situacaoCellClass(s: RdvStatus): string {
  if (s === "Operando") return "text-green-700 font-bold";
  if (s === "Inoperante") return "text-red-600 font-bold";
  if (s === "Destacada") return "text-orange-600 font-bold";
  return "";
}

function parseNonNegativeInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

export function RelatorioDiarioViaturasPage() {
  const assinaturaSelectId = useId();
  const { items: catalogItems } = useCatalogItems();
  const motoristasCadastrados = useMemo(
    () => catalogItems.motoristas.map((m) => m.trim()).filter(Boolean),
    [catalogItems.motoristas],
  );

  const initialRows = useMemo(() => createInitialRdvRows(), []);
  const [rowsAmb, setRowsAmb] = useState<RdvRowAmb[]>(() => initialRows.amb);
  const [rowsAdm, setRowsAdm] = useState<RdvRowAdm[]>(() => initialRows.adm);

  /** Nome na linha de assinatura do relatório (escolhido no select «Assinar»). */
  const [assinaturaNome, setAssinaturaNome] = useState("");

  useEffect(() => {
    if (assinaturaNome && !motoristasCadastrados.includes(assinaturaNome)) {
      setAssinaturaNome("");
    }
  }, [motoristasCadastrados, assinaturaNome]);

  const [reportDate, setReportDate] = useState(todayIsoLocal);
  const diaSemana = useMemo(() => weekdayPtBrFromIsoDate(reportDate), [reportDate]);

  const [efetivoAmb, setEfetivoAmb] = useState(10);
  const [efetivoAdm, setEfetivoAdm] = useState(14);
  const [resumoUti, setResumoUti] = useState(5);
  const [resumoUsb, setResumoUsb] = useState(4);

  const pdfRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const countAmb = useMemo(() => countResumoSituacao(rowsAmb), [rowsAmb]);
  const countAdm = useMemo(() => countResumoSituacao(rowsAdm), [rowsAdm]);

  const totalOperando = countAmb.Operando + countAdm.Operando;
  const totalInoperante = countAmb.Inoperante + countAdm.Inoperante;
  const totalDestacada = countAmb.Destacada + countAdm.Destacada;
  const efetivoTotal = efetivoAmb + efetivoAdm;

  function patchAmb(id: string, patch: Partial<RdvRowAmb>) {
    setRowsAmb((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function patchAdm(id: string, patch: Partial<RdvRowAdm>) {
    setRowsAdm((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeAmb(id: string) {
    setRowsAmb((prev) => prev.filter((r) => r.id !== id));
  }

  function removeAdm(id: string) {
    setRowsAdm((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleGerarPdf() {
    const el = pdfRef.current;
    if (!el) return;
    setPdfBusy(true);
    try {
      await downloadRelatorioDiarioViaturasPdf(el, reportDate.trim() || "SemData");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          RDV — Relatório Diário de Viaturas
        </p>
        <Button type="button" variant="outline" onClick={() => clearCarroQuebradoHash()}>
          Voltar ao sistema
        </Button>
      </div>

      <div
        id="rdv-conteudo-pdf"
        ref={pdfRef}
        className="mx-auto max-w-[210mm] rounded-sm border border-slate-300 bg-white p-3 text-slate-900 shadow-sm sm:p-4 md:p-6"
      >
        <div className="mb-3 text-center text-[10pt] leading-tight">
          <h1 className="m-0 text-[11pt] font-bold">MARINHA DO BRASIL</h1>
          <h2 className="m-0 text-[10pt] font-normal">HOSPITAL NAVAL MARCÍLIO DIAS</h2>
          <h2 className="m-0 text-[10pt] font-normal">DIVISÃO DE TRANSPORTE</h2>
          <h3 className="mx-auto mt-2 flex flex-wrap items-center justify-center gap-1 border border-slate-900 bg-[#e2f0d9] px-2 py-1 text-[10pt] font-bold">
            <span>RELATÓRIO DIÁRIO DE VIATURAS DE</span>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="inline-block w-[8.5rem] border-0 bg-transparent p-0 text-center font-bold underline decoration-dotted"
            />
            <span>(</span>
            <input
              type="text"
              readOnly
              value={diaSemana}
              className="inline-block w-[7.5rem] border-0 bg-transparent p-0 text-center font-bold"
            />
            <span>)</span>
          </h3>
        </div>

        <Table className={tableFrame}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead rowSpan={2} className="w-[15%] align-middle">
                TIPO
              </TableHead>
              <TableHead rowSpan={2} className="align-middle">
                EFETIVO
              </TableHead>
              <TableHead colSpan={3} className="text-center">
                SITUAÇÃO GERAL DAS VIATURAS DOTADAS NO HNMD
              </TableHead>
              <TableHead colSpan={2} className="text-center">
                OUTROS
              </TableHead>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableHead>OPERANDO</TableHead>
              <TableHead>INOPERANTE</TableHead>
              <TableHead>DESTACADA</TableHead>
              <TableHead>UTI MÓVEL</TableHead>
              <TableHead>USB</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="text-left font-bold">AMBULÂNCIA(S)</TableCell>
              <TableCell>
                <input
                  type="number"
                  min={0}
                  className={cellInput}
                  value={efetivoAmb}
                  onChange={(e) => setEfetivoAmb(parseNonNegativeInt(e.target.value, efetivoAmb))}
                />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAmb.Operando} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAmb.Inoperante} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAmb.Destacada} />
              </TableCell>
              <TableCell>
                <input
                  type="number"
                  min={0}
                  className={cellInput}
                  value={resumoUti}
                  onChange={(e) => setResumoUti(parseNonNegativeInt(e.target.value, resumoUti))}
                />
              </TableCell>
              <TableCell>
                <input
                  type="number"
                  min={0}
                  className={cellInput}
                  value={resumoUsb}
                  onChange={(e) => setResumoUsb(parseNonNegativeInt(e.target.value, resumoUsb))}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-left font-bold">ADMINISTRATIVA</TableCell>
              <TableCell>
                <input
                  type="number"
                  min={0}
                  className={cellInput}
                  value={efetivoAdm}
                  onChange={(e) => setEfetivoAdm(parseNonNegativeInt(e.target.value, efetivoAdm))}
                />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAdm.Operando} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAdm.Inoperante} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAdm.Destacada} />
              </TableCell>
              <TableCell colSpan={2} className="bg-slate-100" />
            </TableRow>
            <TableRow className="font-bold">
              <TableCell className="text-left">TOTAL</TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={efetivoTotal} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={totalOperando} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={totalInoperante} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={totalDestacada} />
              </TableCell>
              <TableCell colSpan={2} className="bg-slate-100" />
            </TableRow>
          </TableBody>
        </Table>

        <div className={sectionBar}>AMBULÂNCIAS:</div>
        <Table id="rdv-tabela-ambulancias" className={cn(tableFrame, "table-fixed border-t-0")}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8">#</TableHead>
              <TableHead className="w-[80px]">TIPO</TableHead>
              <TableHead className="w-[70px]">PLACA</TableHead>
              <TableHead className="w-[50px]">ANO</TableHead>
              <TableHead className="w-[80px]">SITUAÇÃO</TableHead>
              <TableHead className="w-[70px]">VIDA ÚTIL</TableHead>
              <TableHead className="w-[100px]">ESPECIFICAÇÃO</TableHead>
              <TableHead className="min-w-0">OBSERVAÇÃO</TableHead>
              <TableHead className="w-[50px]">AÇÃO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsAmb.map((row, idx) => (
              <TableRow key={row.id}>
                <TableCell>
                  <input type="text" readOnly className={cellInput} value={idx + 1} />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInputLeft}
                    value={row.tipo}
                    onChange={(e) => patchAmb(row.id, { tipo: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInput}
                    value={row.placa}
                    onChange={(e) => patchAmb(row.id, { placa: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={1990}
                    className={cellInput}
                    value={row.ano}
                    onChange={(e) => patchAmb(row.id, { ano: e.target.value })}
                  />
                </TableCell>
                <TableCell className={situacaoCellClass(row.situacao)}>
                  <select
                    className={cn(
                      "w-full min-w-0 border-0 bg-transparent p-0.5 text-center text-[9pt] font-bold outline-none",
                      situacaoCellClass(row.situacao),
                    )}
                    value={row.situacao}
                    onChange={(e) => patchAmb(row.id, { situacao: e.target.value as RdvStatus })}
                  >
                    {RDV_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={2000}
                    className={cellInput}
                    value={row.vidaUtil}
                    onChange={(e) => patchAmb(row.id, { vidaUtil: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInput}
                    value={row.especificacao}
                    onChange={(e) => patchAmb(row.id, { especificacao: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInputLeft}
                    value={row.observacao}
                    onChange={(e) => patchAmb(row.id, { observacao: e.target.value })}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    className="rdv-no-pdf rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white"
                    onClick={() => removeAmb(row.id)}
                  >
                    Remover
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-1 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rdv-no-pdf"
            onClick={() => setRowsAmb((p) => [...p, emptyAmbRow()])}
          >
            + Adicionar Ambulância
          </Button>
        </div>

        <div className={cn(sectionBar, "mt-4")}>ADMINISTRATIVAS:</div>
        <Table id="rdv-tabela-administrativas" className={cn(tableFrame, "table-fixed border-t-0")}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8">#</TableHead>
              <TableHead className="w-[80px]">TIPO</TableHead>
              <TableHead className="w-[70px]">PLACA</TableHead>
              <TableHead className="w-[50px]">ANO</TableHead>
              <TableHead className="w-[80px]">SITUAÇÃO</TableHead>
              <TableHead className="w-[70px]">VIDA ÚTIL</TableHead>
              <TableHead colSpan={2}>OBSERVAÇÃO</TableHead>
              <TableHead className="w-[50px]">AÇÃO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsAdm.map((row, idx) => (
              <TableRow key={row.id}>
                <TableCell>
                  <input type="text" readOnly className={cellInput} value={idx + 1} />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInputLeft}
                    value={row.tipo}
                    onChange={(e) => patchAdm(row.id, { tipo: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInput}
                    value={row.placa}
                    onChange={(e) => patchAdm(row.id, { placa: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={1990}
                    className={cellInput}
                    value={row.ano}
                    onChange={(e) => patchAdm(row.id, { ano: e.target.value })}
                  />
                </TableCell>
                <TableCell className={situacaoCellClass(row.situacao)}>
                  <select
                    className={cn(
                      "w-full min-w-0 border-0 bg-transparent p-0.5 text-center text-[9pt] font-bold outline-none",
                      situacaoCellClass(row.situacao),
                    )}
                    value={row.situacao}
                    onChange={(e) => patchAdm(row.id, { situacao: e.target.value as RdvStatus })}
                  >
                    {RDV_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={2000}
                    className={cellInput}
                    value={row.vidaUtil}
                    onChange={(e) => patchAdm(row.id, { vidaUtil: e.target.value })}
                  />
                </TableCell>
                <TableCell colSpan={2}>
                  <input
                    className={cellInputLeft}
                    value={row.observacao}
                    onChange={(e) => patchAdm(row.id, { observacao: e.target.value })}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    className="rdv-no-pdf rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white"
                    onClick={() => removeAdm(row.id)}
                  >
                    Remover
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-1 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rdv-no-pdf"
            onClick={() => setRowsAdm((p) => [...p, emptyAdmRow()])}
          >
            + Adicionar Administrativa
          </Button>
        </div>

        <div className="mt-10 text-center text-[10pt]">
          <p className="m-0">_____________________________________</p>
          <p className="m-0.5 min-h-[1.25rem]">{assinaturaNome.trim() || "—"}</p>
          <p className="m-0">Divisão de Transporte</p>
        </div>
      </div>

      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-center gap-3 pb-6 sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={assinaturaSelectId} className="text-sm font-medium text-[hsl(var(--foreground))]">
            Assinar
          </label>
          <select
            id={assinaturaSelectId}
            className={cn(
              "min-w-[12rem] max-w-[min(100vw-2rem,20rem)] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))] outline-none",
              "focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60",
            )}
            value={motoristasCadastrados.some((m) => m === assinaturaNome) ? assinaturaNome : ""}
            disabled={motoristasCadastrados.length === 0}
            onChange={(e) => setAssinaturaNome(e.target.value)}
          >
            <option value="">
              {motoristasCadastrados.length === 0 ? "Cadastre motoristas em Frota e Pessoal" : "Selecione o motorista…"}
            </option>
            {motoristasCadastrados.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={handleGerarPdf} disabled={pdfBusy}>
          {pdfBusy ? "A gerar PDF…" : "Gerar PDF"}
        </Button>
      </div>
    </div>
  );
}
