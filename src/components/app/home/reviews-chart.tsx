"use client";

import { useId, useState } from "react";
import type { DayCount } from "@/lib/shared/stats";

const WIDTH = 640;
const HEIGHT = 180;
const PAD = { top: 18, right: 8, bottom: 24, left: 34 };

const formatDay = (iso: string, style: "short" | "long" = "short") => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1);
  return style === "short"
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
};

/** Arredonda o topo do eixo para um número "limpo" (5, 10, 20, 50, 100...). */
function niceMax(value: number): number {
  if (value <= 5) return 5;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

/**
 * Colunas das revisões por dia. Uma série só, então não tem legenda (o título
 * do card diz o que é). Barras finas com topo arredondado, grade discreta,
 * rótulo só no maior valor, dica ao passar o mouse e tabela para leitores de tela.
 */
export function ReviewsChart({ days }: { days: DayCount[] }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...days.map((day) => day.count)));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, days.length);
  const barW = Math.min(18, slot - 2);
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const peak = days.reduce((best, day, index) => (day.count > (days[best]?.count ?? 0) ? index : best), 0);
  const ticks = [0, max / 2, max];
  const hovered = hover === null ? null : days[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-labelledby={`${id}-desc`}
        onPointerLeave={() => setHover(null)}
      >
        <title>Revisões por dia</title>
        <desc id={`${id}-desc`}>
          Revisões por dia nos últimos {days.length} dias; o maior foi {days[peak]?.count ?? 0} em{" "}
          {days[peak] ? formatDay(days[peak].date, "long") : ""}.
        </desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {tick.toLocaleString("pt-BR")}
            </text>
          </g>
        ))}
        {days.map((day, index) => {
          const cx = PAD.left + slot * index + slot / 2;
          const top = y(day.count);
          const h = PAD.top + plotH - top;
          const r = Math.min(4, h);
          const x = cx - barW / 2;
          const base = PAD.top + plotH;
          // Topo arredondado (4px), base reta sobre o eixo.
          const path =
            h > 0
              ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`
              : "";
          return (
            <g key={day.date} onPointerEnter={() => setHover(index)}>
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {path && (
                <path d={path} className={hover === null || hover === index ? "fill-primary" : "fill-primary/40"} />
              )}
              {index === peak && day.count > 0 && (
                <text x={cx} y={top - 5} textAnchor="middle" className="fill-foreground font-medium text-[10px]">
                  {day.count}
                </text>
              )}
            </g>
          );
        })}
        {[0, Math.floor(days.length / 2), days.length - 1].map((index) =>
          days[index] ? (
            <text
              key={index}
              x={PAD.left + slot * index + slot / 2}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {index === days.length - 1 ? "hoje" : formatDay(days[index].date)}
            </text>
          ) : null,
        )}
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${((PAD.left + slot * hover + slot / 2) / WIDTH) * 100}%` }}
        >
          <span className="font-semibold">{hovered.count.toLocaleString("pt-BR")}</span>{" "}
          <span className="text-muted-foreground">
            {hovered.count === 1 ? "revisão" : "revisões"} · {formatDay(hovered.date, "long")}
          </span>
        </div>
      )}
      <details className="mt-2 text-muted-foreground text-xs">
        <summary className="cursor-pointer">Ver em tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="font-medium">Dia</th>
              <th className="text-right font-medium">Revisões</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{formatDay(day.date, "long")}</td>
                <td className="text-right tabular-nums">{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
