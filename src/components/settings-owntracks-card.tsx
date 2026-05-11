import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Apple, Copy, Download, KeyRound, Plus, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { resolveDriverLocationPostUrl } from "../lib/driverLocationPost";
import {
  buildOwntracksConfigJson,
  buildOwntracksQrPayload,
  generateOwntracksSharedToken,
  loadOwntracksConfigFromLocalStorage,
  normalizeOwntracksConfigState,
  persistOwntracksConfigToLocalStorage,
  type OwntracksBinding,
  type OwntracksConfigState,
} from "../lib/owntracksConfig";
import { Button } from "./ui/button";

const PANEL_CLASS =
  "rounded-lg border border-sky-200/70 bg-sky-50/70 p-4 dark:border-sky-900/40 dark:bg-sky-950/30";

/**
 * URL do endpoint OwnTracks na Cloud Function.
 *
 * Preferimos construir a URL "legacy" do Cloud Functions (cloudfunctions.net) a partir do
 * VITE_FIREBASE_PROJECT_ID — funciona para qualquer função no projecto, basta trocar o último
 * segmento. As URLs v2/Cloud Run (`*.a.run.app`) têm um hash diferente por função, pelo que
 * não dá para derivar `postOwntracksLocation` a partir de `postDriverLocation`.
 */
function resolveOwntracksEndpointUrl(): string | null {
  const pid = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (pid) return `https://southamerica-east1-${pid}.cloudfunctions.net/postOwntracksLocation`;
  // Fallback: derivar do legacy URL (path-based) caso VITE_FIREBASE_PROJECT_ID não esteja definido.
  const base = resolveDriverLocationPostUrl();
  if (!base) return null;
  if (/\/postDriverLocation(?:[/?#]|$)/.test(base)) {
    return base.replace(/\/postDriverLocation(?=[/?#]|$)/, "/postOwntracksLocation");
  }
  return null;
}

/** base64-url encode (sem `+`, `/`, `=`) — compatível com a maioria das implementações OwnTracks. */
function toBase64Url(s: string): string {
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(s))) : "";
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function SettingsOwntracksCard(props: { intervaloMinutos: number }) {
  const intervalSeconds = Math.max(60, Math.floor(props.intervaloMinutos * 60));
  const [state, setState] = useState<OwntracksConfigState>(() => loadOwntracksConfigFromLocalStorage());
  const [busy, setBusy] = useState(false);
  const [qrFor, setQrFor] = useState<OwntracksBinding | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const newMotoristaInput = useRef<HTMLInputElement>(null);

  // Subscribe ao Firestore para sincronizar entre admins.
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const unsub = subscribeSotStateDoc(
      SOT_STATE_DOC.owntracks,
      (payload) => {
        if (!payload) return;
        const next = normalizeOwntracksConfigState(payload);
        setState(next);
        persistOwntracksConfigToLocalStorage(next);
      },
      (err) => console.warn("[SOT] subscribeSotStateDoc(owntracks)", err),
    );
    return () => unsub();
  }, []);

  const endpointUrl = useMemo(() => resolveOwntracksEndpointUrl(), []);

  const persist = useCallback(
    async (next: OwntracksConfigState) => {
      setState(next);
      persistOwntracksConfigToLocalStorage(next);
      if (!isFirebaseConfigured()) return;
      setBusy(true);
      try {
        await setSotStateDocWithRetry(SOT_STATE_DOC.owntracks, next);
      } catch (e) {
        console.error("[SOT] OwnTracks persist Firestore failed", e);
        alert("Não foi possível guardar no Firebase. O valor ficou só neste navegador.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleGenerateOrRotateToken = useCallback(() => {
    if (
      state.token &&
      !confirm(
        "Gerar um novo token vai INVALIDAR todos os QR codes já distribuídos. " +
          "Os motoristas terão de reler o QR para voltarem a enviar localização. Continuar?",
      )
    ) {
      return;
    }
    const nextToken = generateOwntracksSharedToken();
    void persist({ ...state, token: nextToken });
  }, [state, persist]);

  const handleAddBinding = useCallback(() => {
    const motorista = newMotoristaInput.current?.value.trim() ?? "";
    if (!motorista) {
      alert("Indica o nome do motorista.");
      return;
    }
    if (!state.token) {
      alert("Gera primeiro o token partilhado (botão em cima).");
      return;
    }
    const exists = state.bindings.some(
      (b) => b.motorista.toLowerCase() === motorista.toLowerCase(),
    );
    if (exists) {
      alert("Este motorista já está na lista.");
      return;
    }
    void persist({
      ...state,
      bindings: [...state.bindings, { motorista, updatedAt: Date.now() }],
    });
    if (newMotoristaInput.current) newMotoristaInput.current.value = "";
  }, [state, persist]);

  const handleRemoveBinding = useCallback(
    (motorista: string) => {
      if (!confirm(`Remover ${motorista} da lista OwnTracks? O QR existente deixa de ser útil.`)) return;
      void persist({
        ...state,
        bindings: state.bindings.filter((b) => b.motorista !== motorista),
      });
    },
    [state, persist],
  );

  const handleShowQr = useCallback(
    async (binding: OwntracksBinding) => {
      if (!endpointUrl) {
        alert(
          "URL da Cloud Function indisponível. Confirma que o Firebase está configurado e VITE_DRIVER_LOCATION_POST_URL (ou VITE_FIREBASE_PROJECT_ID) está definido nas variáveis de ambiente.",
        );
        return;
      }
      if (!state.token) {
        alert("Gera primeiro o token partilhado.");
        return;
      }
      const json = buildOwntracksConfigJson({
        endpointUrl,
        motorista: binding.motorista,
        token: state.token,
        intervalSeconds,
      });
      const payload = buildOwntracksQrPayload(json);
      try {
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 360,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        setQrFor(binding);
        setQrImage(dataUrl);
      } catch (e) {
        console.error("QR generation failed", e);
        alert("Falhou a geração do QR code. Detalhes na consola.");
      }
    },
    [endpointUrl, state.token, intervalSeconds],
  );

  /**
   * Gera um link `owntracks:///config?inline=<base64>` que, quando tocado no iPhone (ex.: vindo
   * por WhatsApp/Email/SMS), abre directamente o OwnTracks e importa toda a configuração de uma
   * vez. É o método mais fiável em iOS (não depende de "Abrir com..." nem de scanner de QR).
   */
  const handleCopyOwntracksLink = useCallback(
    async (binding: OwntracksBinding) => {
      if (!endpointUrl) {
        alert(
          "URL da Cloud Function indisponível. Confirma que o Firebase está configurado e VITE_DRIVER_LOCATION_POST_URL (ou VITE_FIREBASE_PROJECT_ID) está definido nas variáveis de ambiente.",
        );
        return;
      }
      if (!state.token) {
        alert("Gera primeiro o token partilhado.");
        return;
      }
      const json = buildOwntracksConfigJson({
        endpointUrl,
        motorista: binding.motorista,
        token: state.token,
        intervalSeconds,
      });
      const payload = toBase64Url(JSON.stringify(json));
      /**
       * Em vez de devolver um link `owntracks:///` directo (que muitos messengers truncam ou
       * convertem em landing page), apontamos para uma página HTTPS no próprio site SOT. Essa
       * página tem um botão "Abrir no OwnTracks" e a configuração está no hash fragment
       * (`#payload=...`) — nunca chega ao servidor.
       */
      const base = `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}`;
      const link = `${base.replace(/\/$/, "")}/owntracks-import.html#payload=${payload}`;
      try {
        await navigator.clipboard?.writeText(link);
        alert(
          `Link copiado para a área de transferência (${link.length} caracteres). Cola no WhatsApp/email do motorista. Ao tocar no link, abre uma página com um botão "Abrir no OwnTracks" — toca aí e a config é importada.`,
        );
      } catch {
        window.prompt("Copia este link e envia ao motorista:", link);
      }
    },
    [endpointUrl, state.token, intervalSeconds],
  );

  /**
   * Gera e descarrega um ficheiro `.otrc` com a configuração do OwnTracks para este motorista.
   * No iPhone, abrir o ficheiro (por exemplo a partir da app Mail ou Files) faz aparecer
   * "Abrir com OwnTracks?" — o motorista confirma e fica configurado em um toque.
   */
  const handleDownloadOtrc = useCallback(
    (binding: OwntracksBinding) => {
      if (!endpointUrl) {
        alert(
          "URL da Cloud Function indisponível. Confirma que o Firebase está configurado e VITE_DRIVER_LOCATION_POST_URL (ou VITE_FIREBASE_PROJECT_ID) está definido nas variáveis de ambiente.",
        );
        return;
      }
      if (!state.token) {
        alert("Gera primeiro o token partilhado.");
        return;
      }
      const json = buildOwntracksConfigJson({
        endpointUrl,
        motorista: binding.motorista,
        token: state.token,
        intervalSeconds,
      });
      const text = JSON.stringify(json, null, 2);
      const slug = binding.motorista
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const filename = `owntracks-${slug || "motorista"}.otrc`;
      try {
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        console.error("OTRC download failed", e);
        alert("Falhou o download do .otrc. Detalhes na consola.");
      }
    },
    [endpointUrl, state.token, intervalSeconds],
  );

  const handleCopyToken = useCallback(async () => {
    if (!state.token) return;
    try {
      await navigator.clipboard.writeText(state.token);
      alert("Token copiado para a área de transferência.");
    } catch {
      alert("Não foi possível copiar. Selecciona o texto manualmente.");
    }
  }, [state.token]);

  const handleDownloadQr = useCallback(() => {
    if (!qrImage || !qrFor) return;
    const a = document.createElement("a");
    a.href = qrImage;
    a.download = `owntracks-${qrFor.motorista.replace(/\s+/g, "_")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [qrImage, qrFor]);

  return (
    <div className={PANEL_CLASS}>
      <div className="flex items-center gap-2">
        <Apple className="h-5 w-5 text-sky-700 dark:text-sky-300" aria-hidden="true" />
        <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
          OwnTracks (iPhone — alternativa grátis)
        </p>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-sky-900/80 dark:text-sky-100/80">
        Para motoristas com iPhone (sem custo Apple): o app gratuito <strong>OwnTracks</strong> envia
        a localização em background. O motorista continua a usar o SOT mobile (Safari) para
        escolher placa e tocar <em>"Iniciar Saída"</em> como sempre — o servidor descobre
        automaticamente a placa actual. Cada motorista lê 1 vez um QR aqui gerado; ao iniciar a
        viagem coloca o OwnTracks em modo <em>Move</em>, no fim em <em>Quiet</em>.
      </p>

      {!endpointUrl ? (
        <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400">
          Endpoint da Cloud Function indisponível. Define <code>VITE_FIREBASE_PROJECT_ID</code> (ou
          <code> VITE_DRIVER_LOCATION_POST_URL</code>) e faz deploy de <code>postOwntracksLocation</code>.
        </p>
      ) : (
        <p className="mt-2 text-xs text-sky-900/70 dark:text-sky-100/70">
          Endpoint: <code className="break-all">{endpointUrl}</code>
        </p>
      )}

      {/* Token partilhado */}
      <div className="mt-4 rounded-md border border-sky-200 bg-white/80 p-3 dark:border-sky-900 dark:bg-sky-950/40">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-sky-700 dark:text-sky-300" aria-hidden="true" />
          <p className="text-sm font-medium text-sky-900 dark:text-sky-100">Token partilhado</p>
        </div>
        <p className="mt-1 text-xs text-sky-900/70 dark:text-sky-100/70">
          Usado por todos os QR codes para autenticar com a Cloud Function. Rodá-lo invalida os
          QRs já distribuídos (precisas de re-enviar aos motoristas).
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {state.token ? (
            <code
              className="break-all rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800"
              style={{ filter: showToken ? undefined : "blur(4px)" }}
            >
              {state.token}
            </code>
          ) : (
            <span className="text-xs italic text-sky-900/60 dark:text-sky-100/60">
              ainda não gerado
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowToken((v) => !v)}
            disabled={!state.token}
          >
            {showToken ? "Ocultar" : "Mostrar"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleCopyToken} disabled={!state.token}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGenerateOrRotateToken}
            disabled={busy}
            className="border-amber-400 text-amber-800 hover:bg-amber-50 dark:text-amber-200"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            {state.token ? "Rodar token" : "Gerar token"}
          </Button>
        </div>
      </div>

      {/* Lista de motoristas com QR */}
      <div className="mt-4">
        <p className="text-sm font-medium text-sky-900 dark:text-sky-100">Motoristas com iPhone</p>
        {state.bindings.length === 0 ? (
          <p className="mt-1 text-xs italic text-sky-900/60 dark:text-sky-100/60">
            Adiciona em baixo o nome do motorista (o nome tem de ser igual ao que ele usa para
            iniciar sessão no SOT mobile — a placa é resolvida automaticamente em cada viagem).
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {state.bindings.map((b) => (
              <li
                key={b.motorista}
                className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-white/80 p-2 dark:border-sky-900 dark:bg-sky-950/40"
              >
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium text-sky-900 dark:text-sky-100">{b.motorista}</p>
                  <p className="text-xs text-sky-900/60 dark:text-sky-100/60">
                    Adicionado: {new Date(b.updatedAt).toLocaleDateString("pt-PT")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => void handleCopyOwntracksLink(b)}
                  disabled={!state.token || !endpointUrl}
                  title="Copia um link owntracks:// que, ao ser tocado no iPhone do motorista, abre o OwnTracks e importa toda a configuração automaticamente."
                >
                  <Apple className="mr-1 h-3.5 w-3.5" /> Copiar link iPhone
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleShowQr(b)}
                  disabled={!state.token || !endpointUrl}
                >
                  <QrCode className="mr-1 h-3.5 w-3.5" /> QR
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadOtrc(b)}
                  disabled={!state.token || !endpointUrl}
                  title="Descarrega o ficheiro .otrc para enviares ao motorista."
                >
                  <Download className="mr-1 h-3.5 w-3.5" /> .otrc
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveBinding(b.motorista)}
                  className="border-red-300 text-red-700 hover:bg-red-50 dark:text-red-200 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-sky-300 p-2 dark:border-sky-700">
          <div className="flex-1 min-w-[12rem]">
            <label htmlFor="owntracks-new-motorista" className="text-xs font-medium text-sky-900 dark:text-sky-100">
              Nome do motorista (igual ao login do SOT mobile)
            </label>
            <input
              id="owntracks-new-motorista"
              ref={newMotoristaInput}
              type="text"
              placeholder="Ex.: João Silva"
              className="mt-1 h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>
          <Button type="button" size="sm" onClick={handleAddBinding} disabled={!state.token}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>
      </div>

      <details className="mt-4 text-xs text-sky-900/80 dark:text-sky-100/80">
        <summary className="cursor-pointer select-none font-medium">
          Tutorial — entregar a um motorista com iPhone
        </summary>
        <ol className="ml-4 mt-2 list-decimal space-y-1">
          <li>
            Instala-se a app <strong>OwnTracks</strong> (gratuita, App Store).
          </li>
          <li>
            <strong>Método recomendado — link owntracks://</strong> em cima, clica em{" "}
            <em>"Copiar link iPhone"</em>. O link fica na área de transferência. Cola no WhatsApp
            ou email do motorista. No iPhone, o motorista <strong>toca no link</strong> → o iOS
            abre o OwnTracks → confirma a importação → fica configurado em um toque. Tudo
            (URL, modo HTTP, password) é importado automaticamente.
          </li>
          <li>
            <strong>Método alternativo — ficheiro .otrc:</strong> clica em <em>.otrc</em> para
            descarregar. Envia ao motorista por email. No iPhone, <strong>dentro do Mail</strong>,
            tocar no anexo → o iOS pergunta <em>"Abrir com OwnTracks?"</em>. Atenção: se abrir num
            browser/visualizador de texto vai mostrar só o JSON; nesse caso prefere o link.
          </li>
          <li>
            <strong>Método de último recurso — QR code:</strong> o botão <em>"QR"</em> mostra um QR.
            Só funciona se a versão do OwnTracks no iPhone tiver scanner integrado (a maioria não tem).
          </li>
          <li>
            Na 1.ª utilização o iOS pergunta sobre permissão de localização — escolher
            <strong> "Permitir o tempo todo"</strong>.
          </li>
          <li>
            Pronto — o OwnTracks fica configurado para sempre. <strong>O motorista NÃO escolhe
            placa no OwnTracks</strong>: continua a usar o SOT mobile como sempre.
          </li>
          <li>
            <strong>Rotina diária — início de viagem:</strong>
            <ol className="ml-4 mt-1 list-[lower-alpha] space-y-0.5">
              <li>Abrir <em>SOT mobile</em> no Safari → login → escolher placa → tocar <em>Iniciar Saída</em> (como sempre).</li>
              <li>Abrir <em>OwnTracks</em> → mudar modo para <strong>Move</strong> (ícone fica azul).</li>
              <li>Pode bloquear o iPhone — o OwnTracks continua a enviar localização para a placa correcta.</li>
            </ol>
          </li>
          <li>
            <strong>Rotina diária — fim de viagem:</strong>
            <ol className="ml-4 mt-1 list-[lower-alpha] space-y-0.5">
              <li>Voltar ao <em>SOT mobile</em> → finalizar saída como sempre (KM chegada, rubrica, etc).</li>
              <li>Voltar ao <em>OwnTracks</em> → mudar modo para <strong>Quiet</strong>.</li>
            </ol>
          </li>
        </ol>
      </details>

      {/* Modal QR */}
      {qrFor && qrImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setQrFor(null);
            setQrImage(null);
          }}
        >
          <div
            className="max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              QR — {qrFor.motorista}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Intervalo: {props.intervaloMinutos} min · A placa é resolvida automaticamente em cada
              viagem (via "Iniciar Saída" no SOT mobile).
            </p>
            <img
              src={qrImage}
              alt={`QR OwnTracks para ${qrFor.motorista}`}
              className="mx-auto mt-3 block rounded border border-slate-200 dark:border-slate-700"
              style={{ width: 320, height: 320 }}
            />
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              No telemóvel, abre OwnTracks → <strong>Settings → Configuration → Import → QR Code</strong>
              e aponta a câmara para esta imagem. Se quiseres enviar por WhatsApp, descarrega a imagem
              em baixo.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleDownloadQr}>
                Descarregar PNG
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setQrFor(null);
                  setQrImage(null);
                }}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
