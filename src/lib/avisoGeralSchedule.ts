import type { AvisoGeralItem } from "../types/aviso-geral";
import { parsePtBrToDate } from "./dateFormat";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Aviso visível no telão neste dia civil.
 * Sem datas = legado (sempre visível). Com data início obrigatória para período;
 * data fim vazia = apenas o dia de início.
 */
export function avisoGeralVisivelNoDia(item: AvisoGeralItem, dia: Date): boolean {
  const t = item.texto.trim();
  if (!t) return false;

  const iniStr = item.dataInicio.trim();
  const fimStr = item.dataFim.trim();

  if (!iniStr && !fimStr) {
    return true;
  }

  const ini = parsePtBrToDate(iniStr);
  if (!ini) return false;
  const fimParsed = fimStr ? parsePtBrToDate(fimStr) : null;
  const fim = fimParsed ?? ini;

  const d0 = startOfLocalDay(dia);
  const a0 = startOfLocalDay(ini);
  const b0 = startOfLocalDay(fim);
  if (a0.getTime() > b0.getTime()) return false;
  return d0.getTime() >= a0.getTime() && d0.getTime() <= b0.getTime();
}

/**
 * Itens com período definido são removidos do cadastro no dia seguinte ao último dia válido.
 * Itens legados (sem datas) nunca são removidos automaticamente.
 */
export function avisoGeralExpiradoParaRemocaoAutomatica(item: AvisoGeralItem, hoje: Date): boolean {
  const iniStr = item.dataInicio.trim();
  const fimStr = item.dataFim.trim();
  if (!iniStr && !fimStr) return false;

  const ini = parsePtBrToDate(iniStr);
  if (!ini) return false;
  const fimParsed = fimStr ? parsePtBrToDate(fimStr) : null;
  const ultimoDia = fimParsed ?? ini;

  const h0 = startOfLocalDay(hoje);
  const end0 = startOfLocalDay(ultimoDia);
  return h0.getTime() > end0.getTime();
}
