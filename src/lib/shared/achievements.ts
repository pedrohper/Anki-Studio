/**
 * Gamificação do Anki Studio: nível, XP, semana e conquistas.
 * Tudo é calculado a partir de dados que já existem (revisões do Anki por dia,
 * cards criados, abas), sem servidor. Funções puras para poder testar.
 */
import { type DayCount, studyStreak, toIsoDay } from "./stats";

export interface GameInput {
  byDay: DayCount[];
  cardsCreated: number;
  tabsCount: number;
  /** Cards pendentes no Anki agora (null = Anki desconectado). */
  dueTotal: number | null;
  weakSpotsAnalyzed: boolean;
  today?: Date;
}

export interface WeekDay {
  date: string;
  label: string;
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface GameStats {
  streak: number;
  longestStreak: number;
  totalReviews: number;
  bestDay: number;
  reviewedToday: number;
  perfectWeeks: number;
  cardsCreated: number;
  tabsCount: number;
  dayCleared: boolean;
  weakSpotsAnalyzed: boolean;
  xp: number;
  level: number;
  levelTitle: string;
  /** XP dentro do nível atual e quanto falta para o próximo. */
  levelXp: number;
  levelSize: number;
  week: WeekDay[];
}

const DAY_MS = 86_400_000;

function parseDay(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Maior sequência de dias seguidos com revisão em todo o histórico. */
export function longestStreak(byDay: DayCount[]): number {
  const days = [...new Set(byDay.filter((day) => day.count > 0).map((day) => day.date))]
    .map(parseDay)
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const day of days) {
    run = day - previous === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

/** Segunda-feira da semana de `date` (semana de segunda a domingo). */
function mondayOf(date: Date): Date {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/** Semanas completas (segunda a domingo) em que você revisou todos os dias. A semana atual só conta quando termina. */
export function perfectWeeks(byDay: DayCount[], today = new Date()): number {
  const studied = new Set(byDay.filter((day) => day.count > 0).map((day) => day.date));
  const currentMonday = toIsoDay(mondayOf(today));
  const mondays = new Set<string>();
  for (const date of studied) {
    const [y, m, d] = date.split("-").map(Number);
    const monday = toIsoDay(mondayOf(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12)));
    if (monday < currentMonday) mondays.add(monday);
  }
  let count = 0;
  for (const monday of mondays) {
    const [y, m, d] = monday.split("-").map(Number);
    const cursor = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
    let full = true;
    for (let i = 0; i < 7 && full; i++) {
      full = studied.has(toIsoDay(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    if (full) count++;
  }
  return count;
}

const WEEK_LABELS = ["S", "T", "Q", "Q", "S", "S", "D"];

/** Os 7 dias da semana atual (segunda a domingo) para a faixa da tela Início. */
export function currentWeek(byDay: DayCount[], today = new Date()): WeekDay[] {
  const counts = new Map(byDay.map((day) => [day.date, day.count]));
  const todayKey = toIsoDay(today);
  const cursor = mondayOf(today);
  return WEEK_LABELS.map((label) => {
    const date = toIsoDay(cursor);
    cursor.setDate(cursor.getDate() + 1);
    return { date, label, count: counts.get(date) ?? 0, isToday: date === todayKey, isFuture: date > todayKey };
  });
}

// ---------- nível ----------

/** XP necessário para chegar ao nível `level` (curva quadrática: sobe rápido no começo). */
export const xpForLevel = (level: number) => 25 * (level - 1) ** 2;

export function levelFor(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1;
}

const TITLES: Array<[number, string]> = [
  [30, "Lenda"],
  [20, "Mestre"],
  [15, "Veterano"],
  [10, "Dedicado"],
  [6, "Estudante"],
  [3, "Aprendiz"],
  [1, "Iniciante"],
];

export function titleFor(level: number): string {
  return TITLES.find(([min]) => level >= min)?.[1] ?? "Iniciante";
}

export function computeStats(input: GameInput): GameStats {
  const today = input.today ?? new Date();
  const todayKey = toIsoDay(today);
  const reviews = input.byDay.filter((day) => day.date <= todayKey);
  const totalReviews = reviews.reduce((sum, day) => sum + day.count, 0);
  const reviewedToday = reviews.find((day) => day.date === todayKey)?.count ?? 0;
  // 1 XP por revisão no Anki, 5 XP por card criado aqui.
  const xp = totalReviews + input.cardsCreated * 5;
  const level = levelFor(xp);
  return {
    streak: studyStreak(reviews, today),
    longestStreak: longestStreak(reviews),
    totalReviews,
    bestDay: reviews.reduce((best, day) => Math.max(best, day.count), 0),
    reviewedToday,
    perfectWeeks: perfectWeeks(reviews, today),
    cardsCreated: input.cardsCreated,
    tabsCount: input.tabsCount,
    dayCleared: input.dueTotal === 0 && reviewedToday > 0,
    weakSpotsAnalyzed: input.weakSpotsAnalyzed,
    xp,
    level,
    levelTitle: titleFor(level),
    levelXp: xp - xpForLevel(level),
    levelSize: xpForLevel(level + 1) - xpForLevel(level),
    week: currentWeek(reviews, today),
  };
}

// ---------- conquistas ----------

export type Tier = "bronze" | "prata" | "ouro" | "lenda";

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  tier: Tier;
  goal: number;
  value: (stats: GameStats) => number;
}

const flag = (on: boolean) => (on ? 1 : 0);

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "primeira-revisao",
    emoji: "🌱",
    title: "Primeiro passo",
    description: "Revise seu primeiro card no Anki.",
    tier: "bronze",
    goal: 1,
    value: (s) => s.totalReviews,
  },
  {
    id: "sequencia-3",
    emoji: "🔥",
    title: "Esquentando",
    description: "Revise 3 dias seguidos.",
    tier: "bronze",
    goal: 3,
    value: (s) => s.longestStreak,
  },
  {
    id: "sequencia-7",
    emoji: "🗓️",
    title: "Semana inteira",
    description: "Revise 7 dias seguidos.",
    tier: "prata",
    goal: 7,
    value: (s) => s.longestStreak,
  },
  {
    id: "semana-perfeita",
    emoji: "⭐",
    title: "Semana perfeita",
    description: "Revise todos os dias de uma semana, de segunda a domingo.",
    tier: "prata",
    goal: 1,
    value: (s) => s.perfectWeeks,
  },
  {
    id: "sequencia-30",
    emoji: "🏆",
    title: "Mês de ferro",
    description: "Revise 30 dias seguidos.",
    tier: "ouro",
    goal: 30,
    value: (s) => s.longestStreak,
  },
  {
    id: "sequencia-100",
    emoji: "👑",
    title: "Centenário",
    description: "Revise 100 dias seguidos.",
    tier: "lenda",
    goal: 100,
    value: (s) => s.longestStreak,
  },
  {
    id: "dia-zerado",
    emoji: "✅",
    title: "Tudo em dia",
    description: "Zere tudo o que o Anki tinha para hoje.",
    tier: "bronze",
    goal: 1,
    value: (s) => flag(s.dayCleared),
  },
  {
    id: "maratona",
    emoji: "🏃",
    title: "Maratona",
    description: "Faça 100 revisões num dia só.",
    tier: "prata",
    goal: 100,
    value: (s) => s.bestDay,
  },
  {
    id: "ultramaratona",
    emoji: "⚡",
    title: "Ultramaratona",
    description: "Faça 300 revisões num dia só.",
    tier: "ouro",
    goal: 300,
    value: (s) => s.bestDay,
  },
  {
    id: "mil-revisoes",
    emoji: "🧠",
    title: "Mil revisões",
    description: "Chegue a 1.000 revisões no Anki.",
    tier: "prata",
    goal: 1_000,
    value: (s) => s.totalReviews,
  },
  {
    id: "dez-mil-revisoes",
    emoji: "🌌",
    title: "Dez mil",
    description: "Chegue a 10.000 revisões no Anki.",
    tier: "lenda",
    goal: 10_000,
    value: (s) => s.totalReviews,
  },
  {
    id: "primeiro-card",
    emoji: "✨",
    title: "Criador",
    description: "Crie seu primeiro card no Anki Studio.",
    tier: "bronze",
    goal: 1,
    value: (s) => s.cardsCreated,
  },
  {
    id: "cem-cards",
    emoji: "🏭",
    title: "Fábrica de cards",
    description: "Crie 100 cards.",
    tier: "prata",
    goal: 100,
    value: (s) => s.cardsCreated,
  },
  {
    id: "mil-cards",
    emoji: "📚",
    title: "Biblioteca",
    description: "Crie 1.000 cards.",
    tier: "ouro",
    goal: 1_000,
    value: (s) => s.cardsCreated,
  },
  {
    id: "tres-abas",
    emoji: "🧩",
    title: "Arquiteto",
    description: "Tenha 3 abas de estudo.",
    tier: "bronze",
    goal: 3,
    value: (s) => s.tabsCount,
  },
  {
    id: "pontos-fracos",
    emoji: "🎯",
    title: "Encarou os erros",
    description: "Analise seus pontos fracos com a IA.",
    tier: "bronze",
    goal: 1,
    value: (s) => flag(s.weakSpotsAnalyzed),
  },
];

export interface AchievementProgress {
  achievement: Achievement;
  value: number;
  /** 0 a 1. */
  progress: number;
  /** Data em que foi desbloqueada (guardada no navegador), ou null. */
  unlockedAt: string | null;
}

/** Junta o progresso atual com as conquistas já guardadas (uma vez desbloqueada, fica para sempre). */
export function evaluateAchievements(stats: GameStats, unlocked: Record<string, string>): AchievementProgress[] {
  return ACHIEVEMENTS.map((achievement) => {
    const value = achievement.value(stats);
    const saved = unlocked[achievement.id] ?? null;
    return {
      achievement,
      value,
      progress: saved ? 1 : Math.min(1, value / achievement.goal),
      unlockedAt: saved,
    };
  });
}

/** Conquistas que acabaram de ser atingidas e ainda não estavam guardadas. */
export function newlyUnlocked(stats: GameStats, unlocked: Record<string, string>): Achievement[] {
  return ACHIEVEMENTS.filter(
    (achievement) => !unlocked[achievement.id] && achievement.value(stats) >= achievement.goal,
  );
}
