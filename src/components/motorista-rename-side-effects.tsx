import { useEffect } from "react";
import {
  ensureVistoriaCloudStateSyncStarted,
  getVistoriaCloudState,
  updateVistoriaCloudState,
} from "../lib/vistoriaCloudState";
import {
  loadActiveMobileMotorista,
  loadMobileMotoristaCredentials,
  removeMobileMotoristaCredential,
  setActiveMobileMotorista,
  upsertMobileMotoristaCredential,
} from "../lib/mobileMotoristaCredentials";
import {
  motoristaNamesMatch,
  renameMotoristaInVistoriaState,
  subscribeMotoristaRenamed,
} from "../lib/motoristaRename";

/**
 * Propaga rename de motorista para vistoria (Firebase) e credenciais mobile (localStorage).
 */
export function MotoristaRenameSideEffects() {
  useEffect(() => {
    ensureVistoriaCloudStateSyncStarted();
    return subscribeMotoristaRenamed((oldName, newName) => {
      void (async () => {
        try {
          const prev = getVistoriaCloudState();
          const next = renameMotoristaInVistoriaState(prev, oldName, newName);
          if (next !== prev) {
            await updateVistoriaCloudState(() => next);
          }
        } catch (e) {
          console.error("[SOT] Rename motorista na vistoria:", e);
        }
      })();

      try {
        const creds = loadMobileMotoristaCredentials();
        for (const c of creds) {
          if (!motoristaNamesMatch(c.motorista, oldName)) continue;
          removeMobileMotoristaCredential(c.motorista);
          upsertMobileMotoristaCredential({ motorista: newName, senha: c.senha });
        }
        const active = loadActiveMobileMotorista();
        if (active && motoristaNamesMatch(active, oldName)) {
          setActiveMobileMotorista(newName);
        }
      } catch (e) {
        console.error("[SOT] Rename motorista nas credenciais mobile:", e);
      }
    });
  }, []);

  return null;
}
