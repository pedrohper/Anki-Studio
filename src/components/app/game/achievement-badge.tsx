"use client";

import type { AchievementProgress, Tier } from "@/lib/shared/achievements";
import { cn } from "@/lib/utils";

export const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", prata: "Prata", ouro: "Ouro", lenda: "Lenda" };

const TIER_RING: Record<Tier, string> = {
  bronze: "from-amber-600/30 to-amber-400/10 ring-amber-500/40",
  prata: "from-slate-400/35 to-slate-200/10 ring-slate-400/50",
  ouro: "from-yellow-400/40 to-amber-200/10 ring-yellow-500/60",
  lenda: "from-fuchsia-500/35 via-indigo-500/25 to-cyan-400/15 ring-fuchsia-500/60",
};

/** Cartão de uma conquista: colorido e com brilho quando desbloqueada, cinza com progresso quando não. */
export function AchievementBadge({ item, compact = false }: { item: AchievementProgress; compact?: boolean }) {
  const { achievement, value, progress, unlockedAt } = item;
  const done = Boolean(unlockedAt);
  const shown = Math.min(value, achievement.goal);
  return (
    <div
      className={cn(
        "relative grid grid-cols-[auto_1fr] items-center gap-3 overflow-hidden rounded-xl border p-3 transition-colors",
        done ? "bg-card" : "bg-muted/30",
      )}
      data-unlocked={done || undefined}
    >
      <span
        className={cn(
          "grid size-12 place-items-center rounded-full text-2xl ring-2",
          done ? cn("bg-gradient-to-br", TIER_RING[achievement.tier]) : "bg-muted ring-border",
          done && (achievement.tier === "ouro" || achievement.tier === "lenda") && "badge-shine",
        )}
        aria-hidden
      >
        <span className={cn(!done && "opacity-40 grayscale")}>{achievement.emoji}</span>
      </span>
      <div className="grid min-w-0 gap-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate font-medium text-sm", !done && "text-muted-foreground")}>
            {achievement.title}
          </span>
          {!compact && (
            <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground uppercase tracking-wide">
              {TIER_LABEL[achievement.tier]}
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-xs">{achievement.description}</span>
        {done ? (
          !compact &&
          unlockedAt && (
            <span className="text-emerald-600 text-xs dark:text-emerald-400">
              Desbloqueada em {new Date(unlockedAt).toLocaleDateString("pt-BR")}
            </span>
          )
        ) : (
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={`Progresso de ${achievement.title}`}
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {shown.toLocaleString("pt-BR")}/{achievement.goal.toLocaleString("pt-BR")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
