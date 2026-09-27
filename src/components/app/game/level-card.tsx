"use client";

import { CheckIcon, FlameIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGame } from "@/hooks/use-game";
import { cn } from "@/lib/utils";
import { AchievementBadge } from "./achievement-badge";

/**
 * Card de progresso da tela Início: nível e XP, a semana (segunda a domingo)
 * com os dias revisados, a sequência e as próximas conquistas.
 */
export function LevelCard({ onOpenAchievements }: { onOpenAchievements: () => void }) {
  const { stats, achievements, connected } = useGame();
  const unlockedCount = achievements.filter((item) => item.unlockedAt).length;
  const next = achievements
    .filter((item) => !item.unlockedAt)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);
  const percent = Math.round((stats.levelXp / stats.levelSize) * 100);
  const weekDone = stats.week.filter((day) => day.count > 0).length;

  return (
    <Card data-testid="level-card">
      <CardContent className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid content-start gap-4">
          <div className="flex items-center gap-4">
            <div
              className="level-badge grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-2xl text-white shadow-lg shadow-indigo-500/25"
              aria-hidden
            >
              {stats.level}
            </div>
            <div className="grid min-w-0 flex-1 gap-1.5">
              <p className="font-semibold">
                Nível {stats.level} · {stats.levelTitle}
              </p>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="XP até o próximo nível"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-1000 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs tabular-nums">
                {stats.xp.toLocaleString("pt-BR")} XP · faltam{" "}
                {(stats.levelSize - stats.levelXp).toLocaleString("pt-BR")} para o nível {stats.level + 1}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Sua semana</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <FlameIcon
                  className={cn("size-4", stats.streak >= 3 ? "flame text-orange-500" : "text-muted-foreground")}
                />
                <span data-testid="streak">
                  {stats.streak} {stats.streak === 1 ? "dia" : "dias"} seguidos
                </span>
              </span>
            </div>
            <ol className="grid grid-cols-7 gap-1.5" aria-label="Dias revisados nesta semana">
              {stats.week.map((day, index) => {
                const done = day.count > 0;
                return (
                  <li key={day.date} className="grid justify-items-center gap-1">
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-full border-2 text-xs transition-colors",
                        done && "week-pop border-transparent bg-primary text-primary-foreground",
                        !done && day.isToday && "today-ring border-primary border-dashed text-primary",
                        !done &&
                          !day.isToday &&
                          (day.isFuture
                            ? "border-border/50 text-muted-foreground/50"
                            : "border-border text-muted-foreground"),
                      )}
                      style={done ? { animationDelay: `${index * 70}ms` } : undefined}
                      title={`${new Date(`${day.date}T12:00`).toLocaleDateString("pt-BR", { weekday: "long" })}: ${day.count} revisões`}
                    >
                      {done ? <CheckIcon className="size-4" strokeWidth={3} /> : day.isToday ? "hoje" : ""}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{day.label}</span>
                  </li>
                );
              })}
            </ol>
            <p className="text-muted-foreground text-xs">
              {!connected
                ? "Conecte o Anki para contar os dias revisados."
                : weekDone === 7
                  ? "Semana perfeita! Todos os dias revisados. ⭐"
                  : stats.reviewedToday > 0
                    ? `${weekDone} de 7 dias nesta semana. Continue amanhã!`
                    : "Revise hoje para marcar o dia."}
            </p>
          </div>
        </div>

        <div className="grid content-start gap-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-sm">
              <TrophyIcon className="size-4 text-amber-500" /> Próximas conquistas
            </span>
            <Button size="xs" variant="ghost" onClick={onOpenAchievements}>
              {unlockedCount}/{achievements.length} · ver todas
            </Button>
          </div>
          {next.length > 0 ? (
            next.map((item) => <AchievementBadge key={item.achievement.id} item={item} compact />)
          ) : (
            <p className="text-muted-foreground text-sm">Você desbloqueou todas. Lenda! 👑</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
