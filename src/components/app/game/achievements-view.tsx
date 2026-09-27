"use client";

import { TrophyIcon } from "lucide-react";
import { useGame } from "@/hooks/use-game";
import type { Tier } from "@/lib/shared/achievements";
import { AchievementBadge, TIER_LABEL } from "./achievement-badge";

const TIERS: Tier[] = ["bronze", "prata", "ouro", "lenda"];

/** Tela Conquistas: todas as conquistas por nível de dificuldade, com o progresso de cada uma. */
export function AchievementsView() {
  const { stats, achievements } = useGame();
  const unlocked = achievements.filter((item) => item.unlockedAt).length;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
          <TrophyIcon className="size-6 text-amber-500" /> Conquistas
        </h1>
        <p className="text-muted-foreground">
          {unlocked} de {achievements.length} desbloqueadas · Nível {stats.level} ({stats.levelTitle}) ·{" "}
          {stats.xp.toLocaleString("pt-BR")} XP
        </p>
        <p className="text-muted-foreground text-sm">
          Você ganha 1 XP por revisão no Anki e 5 XP por card criado aqui. Maior sequência: {stats.longestStreak}{" "}
          {stats.longestStreak === 1 ? "dia" : "dias"}.
        </p>
      </header>

      {TIERS.map((tier) => {
        const items = achievements.filter((item) => item.achievement.tier === tier);
        return (
          <section key={tier} className="grid gap-3" aria-label={TIER_LABEL[tier]}>
            <h2 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">{TIER_LABEL[tier]}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid={`tier-${tier}`}>
              {items.map((item) => (
                <AchievementBadge key={item.achievement.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
