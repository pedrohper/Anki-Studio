"use client";

import type { Tier } from "@/lib/shared/achievements";

const COLORS: Record<Tier | "day", string[]> = {
  bronze: ["#f59e0b", "#fbbf24", "#6366f1"],
  prata: ["#94a3b8", "#e2e8f0", "#6366f1", "#818cf8"],
  ouro: ["#facc15", "#f59e0b", "#fde68a", "#6366f1"],
  lenda: ["#a855f7", "#6366f1", "#ec4899", "#facc15", "#22d3ee"],
  day: ["#22c55e", "#6366f1", "#facc15"],
};

/**
 * Chuva de confete. A biblioteca só é carregada na hora e respeita quem pediu
 * menos animação no sistema (prefers-reduced-motion).
 */
export async function celebrate(kind: Tier | "day" = "bronze") {
  if (typeof window === "undefined") return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = COLORS[kind];
  const big = kind === "ouro" || kind === "lenda";
  const base = { colors, disableForReducedMotion: true, zIndex: 9999 };
  confetti({ ...base, particleCount: big ? 160 : 90, spread: 75, origin: { y: 0.7 } });
  if (big) {
    setTimeout(() => confetti({ ...base, particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } }), 180);
    setTimeout(() => confetti({ ...base, particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } }), 180);
  }
}
