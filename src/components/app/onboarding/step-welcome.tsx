"use client";

import { LayersIcon, ScrollTextIcon, SendIcon, SparklesIcon } from "lucide-react";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings, useSettings } from "@/lib/client/settings";
import { StepHeader } from "./step-header";

const FEATURES = [
  {
    icon: ScrollTextIcon,
    title: "Abas que você cria",
    text: "Cálculo, inglês, direito… cada aba tem um objetivo, e a IA escreve as instruções dela.",
  },
  {
    icon: LayersIcon,
    title: "Qualquer material vira card",
    text: "Texto, PDF, links, vídeos do YouTube e listas de palavras.",
  },
  {
    icon: SendIcon,
    title: "Revise e mande para o Anki",
    text: "Edite ou descarte cada card antes. Sem Anki aberto, baixe um .apkg.",
  },
];

export const StepWelcome = forwardRef<HTMLHeadingElement>(function StepWelcome(_props, ref) {
  const { userName } = useSettings();
  return (
    <div className="grid gap-8">
      <StepHeader
        ref={ref}
        icon={SparklesIcon}
        eyebrow="Boas-vindas"
        title="Seu estúdio de flashcards com IA"
        description="Em uns 2 minutos a gente deixa tudo pronto: a chave da IA, a conexão com o Anki e seus dados. Dá para pular qualquer etapa e voltar depois pelas Configurações."
      />
      <div className="grid gap-2">
        <Label htmlFor="onboarding-name" className="text-base">
          Como você quer ser chamado?
        </Label>
        <Input
          id="onboarding-name"
          className="h-11 max-w-sm text-base"
          placeholder="Seu nome ou apelido"
          autoComplete="given-name"
          value={userName}
          maxLength={40}
          onChange={(event) => updateSettings({ userName: event.target.value })}
        />
      </div>
      <ul className="grid gap-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4 rounded-xl border bg-card p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
              <Icon className="size-4.5" />
            </span>
            <span className="grid gap-0.5">
              <span className="font-medium">{title}</span>
              <span className="text-muted-foreground text-sm">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});
