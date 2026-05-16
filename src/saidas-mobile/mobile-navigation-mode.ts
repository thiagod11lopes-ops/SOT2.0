/**
 * Estado global simples para sinalizar quando o motorista está em "modo
 * navegação" em ecrã cheio (`NavigationFullScreenModal`). O fluxo normal
 * de "Iniciar Saída" já não abre esse modal — mantém-se o hook para o
 * componente de navegação caso volte a ser usado ou acedido por outro caminho.
 *
 * O `SaidasLayout` subscreve este estado para esconder a barra superior
 * (Detalhe de Serviço, Vistoria, Escala do Pão, Vistoria Administrativa,
 * Cadastro de Motorista) e a barra inferior (Administrativas/Ambulância)
 * enquanto a navegação está activa — assim o motorista vê só o mapa em
 * ecrã cheio, sem chrome a distrair ou a bloquear gestos.
 *
 * Padrão: pub/sub minimalista, sem React Context para evitar plumbing
 * entre o layout e a profundidade onde vive o `DepartureCard`.
 */

import { useEffect, useState } from "react";

type Listener = (active: boolean) => void;

let _active = false;
const listeners = new Set<Listener>();

export function setMobileNavigationActive(active: boolean): void {
  if (_active === active) return;
  _active = active;
  for (const listener of listeners) {
    try {
      listener(active);
    } catch {
      // Listener com erro não deve impedir os outros.
    }
  }
}

export function getMobileNavigationActive(): boolean {
  return _active;
}

/**
 * Hook React para subscrever o estado actual em qualquer componente.
 * Re-renderiza sempre que muda.
 */
export function useMobileNavigationActive(): boolean {
  const [active, setActive] = useState<boolean>(_active);
  useEffect(() => {
    const listener: Listener = (value) => setActive(value);
    listeners.add(listener);
    setActive(_active);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return active;
}
