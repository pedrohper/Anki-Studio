"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppConfig, useModelList, useProviderAccess } from "@/hooks/use-studio";
import { type ModelRef, PROVIDER_LIST, PROVIDERS } from "@/lib/llm/providers";
import { cn } from "@/lib/utils";
import { KeyField } from "./key-field";
import { ProviderFacts } from "./provider-facts";

/**
 * Escolha de provedor + modelo. Se ainda não houver chave para o provedor,
 * mostra o campo de chave ali mesmo. A lista de modelos vem da API do provedor.
 */
export function ModelPicker({
  value,
  onChange,
  label,
}: {
  value: ModelRef;
  onChange: (value: ModelRef) => void;
  label?: string;
}) {
  const id = useId();
  const { data: config } = useAppConfig();
  const hasAccess = useProviderAccess();
  const access = hasAccess(value.provider);
  const info = PROVIDERS[value.provider];
  const enabledProviders = PROVIDER_LIST.filter(
    (provider) => config?.providers.find((item) => item.id === provider.id)?.enabled ?? !provider.localOnly,
  );

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-provider`}>{label ?? "Provedor"}</Label>
          <select
            id={`${id}-provider`}
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={value.provider}
            onChange={(event) => onChange({ provider: event.target.value as ModelRef["provider"], model: "" })}
          >
            {enabledProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>
        <ModelField value={value} onChange={onChange} />
      </div>
      {!access && !info.keyless && (
        <div className="grid gap-1.5 rounded-lg border border-dashed p-3">
          <p className="text-sm">
            <span className="font-medium">{info.name}:</span>{" "}
            <span className="text-muted-foreground">{info.tagline}</span>
          </p>
          <ProviderFacts provider={value.provider} />
          <KeyField provider={value.provider} />
        </div>
      )}
      {!access && info.keyless && (
        <p className="text-muted-foreground text-sm">
          Abra o Ollama no seu computador para listar os modelos instalados.
        </p>
      )}
    </div>
  );
}

/** Campo do modelo com a lista vinda da API do provedor. */
export function ModelField({
  value,
  onChange,
  className,
}: {
  value: ModelRef;
  onChange: (value: ModelRef) => void;
  className?: string;
}) {
  const id = useId();
  const hasAccess = useProviderAccess();
  const access = hasAccess(value.provider);
  const models = useModelList(value.provider, access);
  const info = PROVIDERS[value.provider];

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={`${id}-model`}>Modelo</Label>
      <Input
        id={`${id}-model`}
        list={`${id}-models`}
        value={value.model}
        placeholder={info.defaultModel ? `Padrão: ${info.defaultModel}` : "Escolha um modelo"}
        onChange={(event) => onChange({ ...value, model: event.target.value })}
      />
      <datalist id={`${id}-models`}>
        {models.data?.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      <p className="text-muted-foreground text-xs">
        {!access
          ? "Configure a chave para ver os modelos."
          : models.isPending
            ? "Carregando modelos…"
            : models.error
              ? `Não consegui listar os modelos: ${models.error.message}`
              : `${models.data?.length ?? 0} modelos disponíveis.${info.defaultModel ? " Deixe vazio para usar o padrão." : ""}`}
      </p>
    </div>
  );
}
