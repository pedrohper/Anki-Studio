"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { readUsage } from "@/lib/client/usage";
import { PROVIDERS } from "@/lib/llm/providers";
import { monthKey, summarizeMonth } from "@/lib/shared/usage-book";

const usd = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  });
const tokens = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : value >= 1_000
      ? `${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
      : value.toLocaleString("pt-BR");

function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(year ?? 2026, (number ?? 1) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * Quanto cada provedor de IA já gastou, por mês. É uma estimativa pelos tokens
 * que a própria IA informa e pelos preços oficiais; o valor exato está no painel
 * de cada provedor.
 */
export function UsagePanel() {
  const { data: book = {} } = useQuery({ queryKey: ["usage"], queryFn: readUsage });
  const months = [...new Set([monthKey(), ...Object.keys(book)])].sort().reverse();
  const [month, setMonth] = useState(monthKey());
  const summary = summarizeMonth(book, month);
  const max = Math.max(...summary.lines.map((line) => line.cost ?? 0), 0);

  return (
    <div className="grid gap-3 text-sm" data-testid="usage-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <span className="font-semibold text-2xl tabular-nums">{usd(summary.cost)}</span>{" "}
          <span className="text-muted-foreground">
            em {summary.calls} {summary.calls === 1 ? "chamada" : "chamadas"}
            {summary.hasUnknown ? " (+ modelos sem preço conhecido)" : ""}
          </span>
        </p>
        {months.length > 1 && (
          <select
            aria-label="Mês"
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          >
            {months.map((item) => (
              <option key={item} value={item}>
                {monthLabel(item)}
              </option>
            ))}
          </select>
        )}
      </div>
      {summary.lines.length === 0 ? (
        <p className="text-muted-foreground">Nenhum gasto com IA em {monthLabel(month)}.</p>
      ) : (
        <table className="w-full text-left">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1 font-normal">Modelo</th>
              <th className="py-1 text-right font-normal">Chamadas</th>
              <th className="py-1 text-right font-normal">Tokens (entrada / saída)</th>
              <th className="py-1 text-right font-normal">Custo</th>
            </tr>
          </thead>
          <tbody>
            {summary.lines.map((line) => (
              <tr key={`${line.provider}/${line.model}`} className="border-t">
                <td className="py-1.5">
                  <span className="block font-medium">{PROVIDERS[line.provider]?.name ?? line.provider}</span>
                  <span className="block truncate text-muted-foreground text-xs">{line.model}</span>
                  {line.cost !== null && max > 0 && (
                    <span className="mt-1 block h-1 rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, (line.cost / max) * 100)}%` }}
                      />
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">{line.calls}</td>
                <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                  {tokens(line.input)} / {tokens(line.output)}
                </td>
                <td className="py-1.5 text-right tabular-nums">{line.cost === null ? "—" : usd(line.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-muted-foreground text-xs">
        Estimativa pelos tokens que cada IA informa e pelos preços de setembro de 2026. O valor exato está no painel de
        cada provedor.
      </p>
    </div>
  );
}
