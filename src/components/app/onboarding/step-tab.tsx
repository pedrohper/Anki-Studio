"use client";

import { CheckIcon, LayersIcon, LayoutGridIcon, PlusIcon } from "lucide-react";
import { forwardRef } from "react";
import { useAnkiStatus, useTabs } from "@/hooks/use-studio";
import { groupDecks } from "@/lib/shared/decks";
import { cn } from "@/lib/utils";
import { StepHeader } from "./step-header";

/** "new" = criar uma aba própria assim que o onboarding fechar. */
export type TabChoice = string | "new" | "import" | null;

export const StepTab = forwardRef<HTMLHeadingElement, { value: TabChoice; onChange: (value: TabChoice) => void }>(
  function StepTab({ value, onChange }, ref) {
    const { data: tabs = [] } = useTabs();
    const { data: anki } = useAnkiStatus();
    const deckGroups = groupDecks(anki?.decks ?? []);

    const optionClass = (selected: boolean) =>
      cn(
        "relative flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-colors",
        selected ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:bg-muted/60",
      );

    return (
      <div className="grid gap-8">
        <StepHeader
          ref={ref}
          icon={LayoutGridIcon}
          eyebrow="Primeira aba"
          title="Por onde você quer começar?"
          description="Cada aba é um estúdio com objetivo e instruções próprias. Comece por uma pronta ou crie a sua agora: você descreve o objetivo e a IA escreve o prompt."
        />

        <div className="grid gap-3" role="radiogroup" aria-label="Primeira aba">
          {deckGroups.length > 0 && (
            // biome-ignore lint/a11y/useSemanticElements: cartão clicável com conteúdo rico, papel de rádio explícito
            <button
              type="button"
              role="radio"
              aria-checked={value === "import"}
              className={cn(optionClass(value === "import"), "border-primary/40")}
              onClick={() => onChange("import")}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <LayersIcon className="size-5" />
              </span>
              <span className="grid gap-0.5 pr-6">
                <span className="font-medium">Transformar meus baralhos do Anki em abas</span>
                <span className="text-muted-foreground text-sm">
                  Encontrei {deckGroups.length} {deckGroups.length === 1 ? "baralho" : "baralhos"} (
                  {deckGroups
                    .slice(0, 3)
                    .map((group) => group.root)
                    .join(", ")}
                  {deckGroups.length > 3 ? "…" : ""}). A IA lê cada um e cria a aba; os sub-baralhos viram destinos
                  dentro dela.
                </span>
              </span>
              {value === "import" && <CheckIcon className="absolute top-4 right-4 size-4 text-primary" />}
            </button>
          )}
          {tabs.map((tab) => {
            const selected = value === tab.id;
            return (
              // biome-ignore lint/a11y/useSemanticElements: cartão clicável com conteúdo rico, papel de rádio explícito
              <button
                key={tab.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={optionClass(selected)}
                onClick={() => onChange(tab.id)}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-xl" aria-hidden>
                  {tab.emoji}
                </span>
                <span className="grid gap-0.5 pr-6">
                  <span className="font-medium">{tab.name}</span>
                  <span className="text-muted-foreground text-sm">{tab.goal}</span>
                </span>
                {selected && <CheckIcon className="absolute top-4 right-4 size-4 text-primary" />}
              </button>
            );
          })}
          {/* biome-ignore lint/a11y/useSemanticElements: mesmo padrão dos cartões acima */}
          <button
            type="button"
            role="radio"
            aria-checked={value === "new"}
            className={cn(optionClass(value === "new"), "border-dashed")}
            onClick={() => onChange("new")}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <PlusIcon className="size-5" />
            </span>
            <span className="grid gap-0.5 pr-6">
              <span className="font-medium">Criar a minha própria aba</span>
              <span className="text-muted-foreground text-sm">
                Ex.: “Cálculo II, com foco em interpretar as fórmulas” ou “Espanhol para viagem”.
              </span>
            </span>
            {value === "new" && <CheckIcon className="absolute top-4 right-4 size-4 text-primary" />}
          </button>
        </div>
      </div>
    );
  },
);
