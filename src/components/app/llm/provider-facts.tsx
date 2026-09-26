import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PRICES_CHECKED_AT, PROVIDERS, type ProviderId } from "@/lib/llm/providers";
import { cn } from "@/lib/utils";

/** "$$" em destaque sobre "$$$" apagado; 0 vira "grátis". */
export function CostMeter({ tier, className }: { tier: 0 | 1 | 2 | 3; className?: string }) {
  if (tier === 0)
    return <span className={cn("font-medium text-emerald-600 text-xs dark:text-emerald-400", className)}>grátis</span>;
  return (
    <span className={cn("font-mono text-xs tracking-tight", className)} title={`Custo ${tier} de 3`}>
      <span className="sr-only">Custo {tier} de 3</span>
      <span className="text-foreground" aria-hidden>
        {"$".repeat(tier)}
      </span>
      <span className="text-muted-foreground/40" aria-hidden>
        {"$".repeat(3 - tier)}
      </span>
    </span>
  );
}

/** Para que serve, quanto custa e se tem plano grátis. */
export function ProviderFacts({ provider }: { provider: ProviderId }) {
  const info = PROVIDERS[provider];
  return (
    <div className="grid gap-3 text-sm" data-testid="provider-facts">
      <div className="flex flex-wrap gap-1.5">
        {info.bestFor.map((item) => (
          <Badge key={item} variant="secondary">
            {item}
          </Badge>
        ))}
      </div>
      <dl className="grid gap-2 sm:grid-cols-[7rem_1fr]">
        <dt className="text-muted-foreground">Custo</dt>
        <dd>
          <span className="font-medium">{info.costPer100}</span>
          {info.costTier > 0 && info.costPer100 !== "depende do modelo" && (
            <span className="text-muted-foreground"> a cada 100 materiais</span>
          )}
          <span className="block text-muted-foreground text-xs">{info.priceDetail}</span>
        </dd>
        {info.freeTier && (
          <>
            <dt className="text-muted-foreground">Grátis</dt>
            <dd>{info.freeTier}</dd>
          </>
        )}
      </dl>
      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
        Preços de {PRICES_CHECKED_AT}; podem mudar.
        <a
          className="inline-flex items-center gap-1 text-primary hover:underline"
          href={info.pricingUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ver preços oficiais <ExternalLinkIcon className="size-3" />
        </a>
      </p>
    </div>
  );
}
