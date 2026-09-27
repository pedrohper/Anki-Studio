import { describe, expect, it } from "vitest";
import {
  computeStats,
  currentWeek,
  evaluateAchievements,
  levelFor,
  longestStreak,
  newlyUnlocked,
  perfectWeeks,
  xpForLevel,
} from "@/lib/shared/achievements";

// Sábado, 26/09/2026 ao meio-dia (a semana começa na segunda, 21/09).
const today = new Date(2026, 8, 26, 12);
const day = (date: string, count = 10) => ({ date, count });
const range = (start: number, end: number, month = "09") =>
  Array.from({ length: end - start + 1 }, (_, i) => day(`2026-${month}-${String(start + i).padStart(2, "0")}`));

describe("sequências e semanas", () => {
  it("acha a maior sequência em todo o histórico", () => {
    expect(longestStreak([...range(1, 7), ...range(10, 12)])).toBe(7);
    expect(longestStreak([day("2026-09-01", 0)])).toBe(0);
    // virada de mês
    expect(longestStreak([day("2026-08-31"), day("2026-09-01"), day("2026-09-02")])).toBe(3);
  });

  it("semana perfeita só conta de segunda a domingo e só depois que a semana termina", () => {
    expect(perfectWeeks(range(14, 20), today)).toBe(1); // 14/09 (seg) a 20/09 (dom)
    expect(perfectWeeks(range(15, 21), today)).toBe(0); // terça a segunda: não fecha uma semana
    expect(perfectWeeks(range(21, 26), today)).toBe(0); // semana atual ainda não terminou
  });

  it("monta a semana atual com hoje e os dias que ainda não chegaram", () => {
    const week = currentWeek([day("2026-09-21"), day("2026-09-26")], today);
    expect(week.map((d) => d.label)).toEqual(["S", "T", "Q", "Q", "S", "S", "D"]);
    expect(week[0]).toMatchObject({ date: "2026-09-21", count: 10, isToday: false });
    expect(week[5]).toMatchObject({ date: "2026-09-26", isToday: true, isFuture: false });
    expect(week[6]).toMatchObject({ date: "2026-09-27", isFuture: true });
  });
});

describe("nível e XP", () => {
  it("a curva de nível é contínua", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(xpForLevel(2) - 1)).toBe(1);
    expect(levelFor(xpForLevel(2))).toBe(2);
    expect(levelFor(xpForLevel(10))).toBe(10);
  });

  it("revisão vale 1 XP e card criado vale 5", () => {
    const stats = computeStats({
      byDay: range(20, 26),
      cardsCreated: 4,
      tabsCount: 2,
      dueTotal: 0,
      weakSpotsAnalyzed: false,
      today,
    });
    expect(stats.xp).toBe(70 + 20);
    expect(stats.streak).toBe(7);
    expect(stats.dayCleared).toBe(true);
    expect(stats.levelXp).toBeLessThan(stats.levelSize);
  });
});

describe("conquistas", () => {
  const base = { cardsCreated: 0, tabsCount: 1, dueTotal: 5, weakSpotsAnalyzed: false, today };

  it("revisar a semana inteira desbloqueia 'Semana inteira'", () => {
    const six = computeStats({ ...base, byDay: range(21, 26) });
    expect(newlyUnlocked(six, {}).map((a) => a.id)).not.toContain("sequencia-7");
    const seven = computeStats({ ...base, byDay: range(20, 26) });
    expect(newlyUnlocked(seven, {}).map((a) => a.id)).toEqual(
      expect.arrayContaining(["primeira-revisao", "sequencia-3", "sequencia-7"]),
    );
  });

  it("não repete conquista já guardada e mostra o progresso das que faltam", () => {
    const stats = computeStats({ ...base, byDay: range(22, 26) });
    const saved = { "primeira-revisao": "2026-09-22T10:00:00Z" };
    expect(newlyUnlocked(stats, saved).map((a) => a.id)).not.toContain("primeira-revisao");
    const week = evaluateAchievements(stats, saved).find((item) => item.achievement.id === "sequencia-7");
    expect(week?.value).toBe(5);
    expect(week?.progress).toBeCloseTo(5 / 7);
    expect(week?.unlockedAt).toBeNull();
  });

  it("uma vez desbloqueada, continua mesmo se a sequência quebrar", () => {
    const stats = computeStats({ ...base, byDay: [] });
    const item = evaluateAchievements(stats, { "sequencia-7": "2026-09-01T00:00:00Z" }).find(
      (entry) => entry.achievement.id === "sequencia-7",
    );
    expect(item?.progress).toBe(1);
  });
});
