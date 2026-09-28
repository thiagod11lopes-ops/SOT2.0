import { useEffect, useState } from "react";
import { useMaterialControle } from "../context/material-controle-context";

const MIN_VISIBLE_MS = 1700;
const LEAVE_MS = 720;

/** Encerra a animação de abertura que já está no `material.html`. */
export function MaterialEbenezerBoot() {
  const { initialLoadComplete } = useMaterialControle();
  const [minDone, setMinDone] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinDone(true), MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const ready = initialLoadComplete && minDone;

  useEffect(() => {
    if (!ready) return;
    const el = document.getElementById("ebenezer-boot");
    if (!el) return;
    el.classList.add("ebenezer-boot--out");
    const removeTimer = window.setTimeout(() => {
      el.remove();
      window.dispatchEvent(new Event("material-boot-finished"));
    }, LEAVE_MS);
    return () => window.clearTimeout(removeTimer);
  }, [ready]);

  return null;
}
