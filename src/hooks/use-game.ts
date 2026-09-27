"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWeakSpotsCache } from "@/components/app/weak-spots-view";
import * as db from "@/lib/client/db";
import { computeStats, evaluateAchievements } from "@/lib/shared/achievements";
import { sumDue } from "@/lib/shared/stats";
import { useAnkiDashboard, useAnkiStatus, useHistoryCount, useTabs } from "./use-studio";

export const ACHIEVEMENTS_KEY = "achievements";

/** Conquistas já desbloqueadas neste navegador: id → data. */
export function useUnlockedAchievements() {
  return useQuery({
    queryKey: [ACHIEVEMENTS_KEY],
    queryFn: async () => (await db.getKv<Record<string, string>>(ACHIEVEMENTS_KEY)) ?? null,
  });
}

/** Nível, XP, semana e conquistas, a partir do Anki, do histórico e das abas. */
export function useGame() {
  const { data: anki, isPending: ankiPending } = useAnkiStatus();
  const connected = Boolean(anki?.connected);
  const { data: dashboard, isPending: dashboardPending } = useAnkiDashboard();
  const { data: cardsCreated, isPending: historyPending } = useHistoryCount();
  const { data: tabs = [] } = useTabs();
  const { data: weak } = useWeakSpotsCache();
  const { data: unlocked, isPending: unlockedPending } = useUnlockedAchievements();

  const stats = useMemo(
    () =>
      computeStats({
        byDay: dashboard?.byDay ?? [],
        cardsCreated: cardsCreated ?? 0,
        tabsCount: tabs.length,
        dueTotal: dashboard ? sumDue(dashboard.stats).total : null,
        weakSpotsAnalyzed: Boolean(weak),
      }),
    [dashboard, cardsCreated, tabs.length, weak],
  );

  return {
    stats,
    achievements: evaluateAchievements(stats, unlocked ?? {}),
    unlocked,
    connected,
    // Só avalia conquistas novas quando os dados do Anki já chegaram (ou ele está desligado).
    ready: !ankiPending && !historyPending && !unlockedPending && (!connected || !dashboardPending),
  };
}
