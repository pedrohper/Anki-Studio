/** Contas do painel Início, separadas da interface para poder testar. */

export interface DayCount {
  date: string;
  count: number;
}

export function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Últimos `n` dias até hoje (inclusive), preenchendo com zero os dias sem revisão. */
export function lastNDays(byDay: DayCount[], n: number, today = new Date()): DayCount[] {
  const map = new Map(byDay.map((day) => [day.date, day.count]));
  const days: DayCount[] = [];
  for (let offset = n - 1; offset >= 0; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = toIsoDay(date);
    days.push({ date: key, count: map.get(key) ?? 0 });
  }
  return days;
}

/** Dias seguidos com revisão. Hoje ainda sem revisão não quebra a sequência. */
export function studyStreak(byDay: DayCount[], today = new Date()): number {
  const studied = new Set(byDay.filter((day) => day.count > 0).map((day) => day.date));
  let streak = 0;
  const cursor = new Date(today);
  if (!studied.has(toIsoDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (studied.has(toIsoDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface DueCounts {
  newCount: number;
  learnCount: number;
  reviewCount: number;
}

export function sumDue(stats: DueCounts[]) {
  const total = stats.reduce(
    (acc, stat) => ({
      newCount: acc.newCount + stat.newCount,
      learnCount: acc.learnCount + stat.learnCount,
      reviewCount: acc.reviewCount + stat.reviewCount,
    }),
    { newCount: 0, learnCount: 0, reviewCount: 0 },
  );
  return { ...total, total: total.newCount + total.learnCount + total.reviewCount };
}

/** "Bom dia" / "Boa tarde" / "Boa noite" pela hora local. */
export function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
