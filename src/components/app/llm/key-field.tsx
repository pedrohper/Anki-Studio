"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, ExternalLinkIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { setProviderKey, useSettings } from "@/lib/client/settings";
import { PROVIDERS, type ProviderId } from "@/lib/llm/providers";
import type { KeyCheckResponse } from "@/lib/schemas/api";
import { cn } from "@/lib/utils";

export function formatBalance(balance: KeyCheckResponse["balance"]) {
  if (!balance) return null;
  const value = Number(balance.total);
  if (!Number.isFinite(value)) return `${balance.total} ${balance.currency}`;
  const currency = ["USD", "CNY", "EUR"].includes(balance.currency) ? balance.currency : "USD";
  return value.toLocaleString("pt-BR", { style: "currency", currency });
}

/**
 * Campo de chave de um provedor com botão de teste. A chave só é salva depois
 * que o teste passa (sem gastar crédito).
 */
export function KeyField({
  provider,
  size = "default",
  onValid,
}: {
  provider: ProviderId;
  size?: "default" | "lg";
  onValid?: (result: KeyCheckResponse) => void;
}) {
  const id = useId();
  const info = PROVIDERS[provider];
  const settings = useSettings();
  const saved = settings.providerKeys[provider] ?? "";
  const [draft, setDraft] = useState(saved);
  const queryClient = useQueryClient();

  const check = useMutation({
    mutationFn: (key: string) => api.checkKey(provider, key),
    onSuccess: (result, key) => {
      if (!result.valid) return;
      setProviderKey(provider, key);
      void queryClient.invalidateQueries({ queryKey: ["models", provider] });
      onValid?.(result);
    },
  });
  const result = check.data;
  const height = size === "lg" ? "h-10" : "h-8";

  return (
    <div className="grid gap-2">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) check.mutate(draft.trim());
        }}
      >
        <label htmlFor={`${id}-key`} className="sr-only">
          Chave de {info.name}
        </label>
        <Input
          id={`${id}-key`}
          type="password"
          autoComplete="off"
          placeholder={`Chave de ${info.name}`}
          className={height}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            check.reset();
          }}
        />
        <Button type="submit" variant="secondary" className={height} disabled={!draft.trim() || check.isPending}>
          {check.isPending && <Loader2Icon className="animate-spin" />} Testar
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {result || check.error ? (
          <output
            className={cn(
              "flex items-center gap-1.5",
              result?.valid ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
            )}
          >
            {result?.valid ? <CheckCircle2Icon className="size-3.5" /> : <XCircleIcon className="size-3.5" />}
            {result?.message ?? check.error?.message}
            {result?.valid && formatBalance(result.balance) && ` Saldo: ${formatBalance(result.balance)}.`}
          </output>
        ) : saved ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2Icon className="size-3.5 text-emerald-600" /> Chave salva neste navegador
          </span>
        ) : (
          <span />
        )}
        <a
          className="inline-flex items-center gap-1 text-primary hover:underline"
          href={info.keyUrl}
          target="_blank"
          rel="noreferrer"
        >
          Criar chave <ExternalLinkIcon className="size-3" />
        </a>
      </div>
    </div>
  );
}
