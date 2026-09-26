"use client";

import { CheckCircle2Icon, CheckIcon, LightbulbIcon, SparklesIcon } from "lucide-react";
import { forwardRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppConfig, useModelList, useProviderAccess } from "@/hooks/use-studio";
import { updateSettings, useSettings } from "@/lib/client/settings";
import {
  type ModelRef,
  PROVIDER_LIST,
  PROVIDERS,
  type ProviderId,
  RECOMMENDED_COMBO,
  suggestModel,
} from "@/lib/llm/providers";
import { cn } from "@/lib/utils";
import { KeyField } from "../llm/key-field";
import { ModelField, ModelPicker } from "../llm/model-picker";
import { CostMeter, ProviderFacts } from "../llm/provider-facts";
import { StepHeader } from "./step-header";

export const StepKey = forwardRef<HTMLHeadingElement>(function StepKey(_props, ref) {
  const settings = useSettings();
  const { data: config } = useAppConfig();
  const hasAccess = useProviderAccess();
  const generator = settings.generator;
  const provider = PROVIDERS[generator.provider];
  const access = hasAccess(generator.provider);
  const serverKey = Boolean(config?.providers.find((item) => item.id === generator.provider)?.serverKey);
  const models = useModelList(generator.provider, access);

  const providers = PROVIDER_LIST.filter(
    (item) => config?.providers.find((status) => status.id === item.id)?.enabled ?? !item.localOnly,
  );

  // Provedor sem modelo padrão conhecido (ex.: Ollama): sugere um da lista.
  useEffect(() => {
    if (!generator.model && !provider.defaultModel && models.data?.length) {
      updateSettings({ generator: { ...generator, model: suggestModel(generator.provider, models.data) } });
    }
  }, [generator, provider.defaultModel, models.data]);

  const choose = (id: ProviderId) => updateSettings({ generator: { provider: id, model: "" } });
  const setGenerator = (value: ModelRef) => updateSettings({ generator: value });

  // Revisor sugerido: outro provedor já configurado, para um conferir o trabalho do outro.
  const suggestedReviewer: ModelRef = {
    provider: providers.find((item) => item.id !== generator.provider && hasAccess(item.id))?.id ?? "openai",
    model: "",
  };

  return (
    <div className="grid gap-8">
      <StepHeader
        ref={ref}
        icon={SparklesIcon}
        eyebrow="Inteligência artificial"
        title="Escolha a sua IA"
        description="O Anki Studio funciona com vários provedores. Você usa a sua própria chave, que fica só neste navegador e vai direto para o provedor a cada pedido. Cada material custa poucos centavos."
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
        <LightbulbIcon className="size-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1">
          <span className="font-medium">Não sabe qual escolher?</span> Gere com a <b>DeepSeek</b> e revise com o{" "}
          <b>Groq</b>: boa qualidade, revisão em segundos e {RECOMMENDED_COMBO.costPer100} a cada 100 materiais.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            updateSettings({ generator: RECOMMENDED_COMBO.generator, reviewer: RECOMMENDED_COMBO.reviewer })
          }
        >
          Usar essa combinação
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Provedor de IA">
        {providers.map((item) => {
          const selected = item.id === generator.provider;
          const ready = hasAccess(item.id);
          return (
            // biome-ignore lint/a11y/useSemanticElements: cartão clicável com conteúdo rico, papel de rádio explícito
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(item.id)}
              className={cn(
                "relative grid gap-1 rounded-xl border p-3 text-left transition-colors",
                selected ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:bg-muted/60",
              )}
            >
              <span className="flex items-center gap-2 pr-6 font-medium text-sm">
                {item.name}
                {ready && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    pronto
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground text-xs">{item.bestFor[0]}</span>
              <span className="mt-1 flex items-center gap-2 text-xs">
                <CostMeter tier={item.costTier} />
                <span className="text-muted-foreground">
                  {item.costTier === 0
                    ? "roda no seu PC"
                    : `${item.costPer100}${item.costPer100.startsWith("≈") ? " / 100 materiais" : ""}`}
                </span>
                {item.freeTier && item.costTier > 0 && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    tem grátis
                  </Badge>
                )}
              </span>
              {selected && <CheckIcon className="absolute top-3 right-3 size-4 text-primary" />}
            </button>
          );
        })}
      </div>

      <section className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">{provider.name}</h3>
          <CostMeter tier={provider.costTier} />
        </div>
        <ProviderFacts provider={generator.provider} />
        {serverKey || provider.keyless ? (
          <p className="flex items-start gap-2 text-sm">
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              {provider.keyless
                ? "Não precisa de chave: o app usa o Ollama deste computador."
                : "Este servidor já tem uma chave configurada (uso local). Nada a fazer aqui."}
            </span>
          </p>
        ) : (
          <KeyField provider={generator.provider} size="lg" />
        )}
        <ModelField value={generator} onChange={setGenerator} />
      </section>

      <section className="grid gap-4">
        <Label className="flex items-start gap-3 font-normal">
          <Switch
            checked={Boolean(settings.reviewer)}
            onCheckedChange={(checked) => updateSettings({ reviewer: checked ? suggestedReviewer : null })}
          />
          <span className="grid gap-0.5">
            <span className="font-medium">Revisar os cards com um segundo modelo</span>
            <span className="text-muted-foreground text-sm">
              Um modelo gera, outro confere: aponta erros e perguntas confusas e sugere a correção. Você decide o que
              aplicar.
            </span>
          </span>
        </Label>
        {settings.reviewer && (
          <div className="rounded-xl border bg-card p-5">
            <ModelPicker
              value={settings.reviewer}
              onChange={(reviewer) => updateSettings({ reviewer })}
              label="Revisa com"
            />
          </div>
        )}
      </section>
    </div>
  );
});
