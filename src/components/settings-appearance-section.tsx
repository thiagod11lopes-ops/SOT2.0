import { Check, Monitor, Moon, Radar, Sparkles } from "lucide-react";
import type { AppearanceMode } from "../context/appearance-context";
import { useAppearance } from "../context/appearance-context";
import { APPEARANCE_OPTIONS, type AppearanceOption } from "../lib/appearanceOptions";
import { cn } from "../lib/utils";

const MODE_ICONS: Record<AppearanceMode, typeof Monitor> = {
  original: Monitor,
  dark: Moon,
  "ultra-modern": Sparkles,
  radar: Radar,
};

function AppearancePreviewMock({ option }: { option: AppearanceOption }) {
  const p = option.preview;
  const isRadar = option.mode === "radar";
  return (
    <div
      className={cn("overflow-hidden rounded-xl border shadow-inner", isRadar && "sot-radar-preview")}
      style={{ background: p.background, borderColor: p.border }}
    >
      <div className="flex items-center gap-2 border-b px-2.5 py-2" style={{ borderColor: p.border }}>
        <span className="h-2 w-2 rounded-full" style={{ background: p.primary }} />
        <span className="h-1.5 flex-1 rounded-full opacity-40" style={{ background: p.foreground }} />
      </div>
      <div className="space-y-2 p-2.5">
        <div
          className="rounded-lg border p-2 shadow-sm"
          style={{ background: p.card, borderColor: p.border, color: p.foreground }}
        >
          <p className="text-[0.65rem] font-semibold leading-tight">Título do cartão</p>
          <p className="mt-0.5 text-[0.58rem] leading-snug" style={{ color: p.muted }}>
            Texto secundário legível
          </p>
          <span
            className="mt-1.5 inline-block rounded-md px-1.5 py-0.5 text-[0.55rem] font-semibold"
            style={{ background: p.primary, color: p.primaryForeground }}
          >
            Ação
          </span>
        </div>
        <div className="flex gap-1">
          <span className="h-1 flex-1 rounded-full" style={{ background: p.muted, opacity: 0.35 }} />
          <span className="h-1 w-6 rounded-full" style={{ background: p.primary, opacity: 0.7 }} />
        </div>
      </div>
    </div>
  );
}

function AppearanceOptionCard({
  option,
  selected,
  onSelect,
  radarShowAmbulances,
  onRadarShowAmbulancesChange,
}: {
  option: AppearanceOption;
  selected: boolean;
  onSelect: () => void;
  radarShowAmbulances?: boolean;
  onRadarShowAmbulancesChange?: (show: boolean) => void;
}) {
  const Icon = MODE_ICONS[option.mode];
  const isRadar = option.mode === "radar";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      className={cn(
        "group relative flex w-full cursor-pointer flex-col gap-3 rounded-2xl border p-4 text-left transition-all duration-300",
        "bg-[hsl(var(--card))] hover:shadow-[0_20px_50px_-28px_rgba(0,0,0,0.35)]",
        selected
          ? "border-[hsl(var(--primary))]/55 ring-2 ring-[hsl(var(--primary))]/25 shadow-[0_16px_40px_-24px_hsl(var(--primary)/0.35)]"
          : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/25",
      )}
    >
      {selected ? (
        <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md">
          <Check className="h-4 w-4" aria-hidden />
        </span>
      ) : null}
      <div className="flex items-start gap-3 pr-8">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
            selected
              ? "border-[hsl(var(--primary))]/35 bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{option.title}</p>
          <p className="text-xs font-medium text-[hsl(var(--primary))]">{option.subtitle}</p>
        </div>
      </div>
      <AppearancePreviewMock option={option} />
      <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{option.description}</p>
      <ul className="flex flex-wrap gap-1.5">
        {option.highlights.map((tag) => (
          <li
            key={tag}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 px-2 py-0.5 text-[0.65rem] font-medium text-[hsl(var(--foreground))]/85"
          >
            {tag}
          </li>
        ))}
      </ul>
      {isRadar ? (
        <label
          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[hsl(var(--border))]/80 bg-[hsl(var(--muted))]/25 px-3 py-2.5 text-left"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] accent-[hsl(var(--primary))]"
            checked={radarShowAmbulances ?? true}
            onChange={(event) => onRadarShowAmbulancesChange?.(event.target.checked)}
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-[hsl(var(--foreground))]">
              Ambulâncias na detecção do radar
            </span>
            <span className="mt-0.5 block text-[0.65rem] leading-snug text-[hsl(var(--muted-foreground))]">
              Exibe ícones em movimento que piscam quando a listra de varredura passa por cima.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

export function SettingsAppearanceSection({ panelClass }: { panelClass: string }) {
  const { appearance, setAppearance, radarShowAmbulances, setRadarShowAmbulances } = useAppearance();

  return (
    <section className={panelClass} aria-labelledby="settings-heading-aparencia">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="settings-heading-aparencia" className="text-base font-semibold text-[hsl(var(--foreground))]">
            Aparência
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
            Escolha o tema visual do sistema desktop. Cores de texto e fundo são ajustadas automaticamente para manter
            contraste e leitura confortável em cartões, tabelas e formulários.
          </p>
        </div>
        <p className="shrink-0 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-3 py-1 text-xs font-medium text-[hsl(var(--foreground))]">
          Ativo:{" "}
          <span className="text-[hsl(var(--primary))]">
            {APPEARANCE_OPTIONS.find((o) => o.mode === appearance)?.title ?? appearance}
          </span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {APPEARANCE_OPTIONS.map((option) => (
          <AppearanceOptionCard
            key={option.mode}
            option={option}
            selected={appearance === option.mode}
            onSelect={() => setAppearance(option.mode)}
            radarShowAmbulances={option.mode === "radar" ? radarShowAmbulances : undefined}
            onRadarShowAmbulancesChange={
              option.mode === "radar" ? setRadarShowAmbulances : undefined
            }
          />
        ))}
      </div>

      <div className="rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--muted))]/20 px-4 py-3">
        <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          A preferência é guardada neste dispositivo e sincronizada na nuvem quando o modo «somente Firebase» está
          ativo. A vista mobile das saídas mantém o tema escuro próprio, independente desta opção.
        </p>
      </div>
    </section>
  );
}
