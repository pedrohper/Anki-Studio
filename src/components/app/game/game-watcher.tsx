"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ACHIEVEMENTS_KEY, useGame } from "@/hooks/use-game";
import { celebrate } from "@/lib/client/celebrate";
import * as db from "@/lib/client/db";
import { newlyUnlocked, type Tier } from "@/lib/shared/achievements";
import { toIsoDay } from "@/lib/shared/stats";

const TIER_ORDER: Tier[] = ["bronze", "prata", "ouro", "lenda"];
const CELEBRATED_DAY_KEY = "celebratedDay";

/**
 * Fica de olho no progresso e comemora: conquista nova (confete + aviso) e o
 * "dia zerado" (tudo o que o Anki tinha para hoje revisado), uma vez por dia.
 */
export function GameWatcher() {
  const { stats, unlocked, ready } = useGame();
  const queryClient = useQueryClient();
  const busy = useRef(false);

  useEffect(() => {
    if (!ready || busy.current) return;
    const saved = unlocked ?? {};
    const fresh = newlyUnlocked(stats, saved);
    if (fresh.length === 0) return;
    busy.current = true;

    const now = new Date().toISOString();
    const next = { ...saved, ...Object.fromEntries(fresh.map((item) => [item.id, now])) };
    void db
      .setKv(ACHIEVEMENTS_KEY, next)
      .then(() => queryClient.invalidateQueries({ queryKey: [ACHIEVEMENTS_KEY] }))
      .finally(() => {
        busy.current = false;
      });

    const top = fresh.reduce((best, item) =>
      TIER_ORDER.indexOf(item.tier) > TIER_ORDER.indexOf(best.tier) ? item : best,
    );
    void celebrate(top.tier);
    // Na primeira vez (ou depois de muito tempo) podem vir várias juntas: um aviso só.
    if (unlocked === null || fresh.length > 3) {
      toast.success(`${fresh.length} conquistas desbloqueadas! 🏆`, {
        description: fresh.map((item) => `${item.emoji} ${item.title}`).join(" · "),
        duration: 8_000,
      });
    } else {
      for (const item of fresh) {
        toast.success(`Conquista: ${item.title}`, { description: item.description, icon: item.emoji, duration: 6_000 });
      }
    }
  }, [ready, stats, unlocked, queryClient]);

  // Dia zerado: comemora uma vez por dia.
  useEffect(() => {
    if (!ready || !stats.dayCleared) return;
    const today = toIsoDay(new Date());
    void db.getKv<string>(CELEBRATED_DAY_KEY).then(async (last) => {
      if (last === today) return;
      await db.setKv(CELEBRATED_DAY_KEY, today);
      void celebrate("day");
      toast.success("Dia zerado! 🎉", {
        description: `Você revisou tudo o que o Anki tinha para hoje (${stats.reviewedToday} revisões).`,
      });
    });
  }, [ready, stats.dayCleared, stats.reviewedToday]);

  return null;
}
