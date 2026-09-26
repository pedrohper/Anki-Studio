"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  DatabaseIcon,
  KeyRoundIcon,
  LayersIcon,
  LayoutGridIcon,
  type LucideIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAnkiStatus, useHasAiAccess } from "@/hooks/use-studio";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "../logo";
import { StepAnki } from "./step-anki";
import { StepData } from "./step-data";
import { StepKey } from "./step-key";
import { StepTab, type TabChoice } from "./step-tab";
import { StepWelcome } from "./step-welcome";

type StepId = "welcome" | "key" | "anki" | "data" | "tab";

const STEPS: Array<{ id: StepId; title: string; hint: string; icon: LucideIcon }> = [
  { id: "welcome", title: "Boas-vindas", hint: "O que dá para fazer", icon: SparklesIcon },
  { id: "key", title: "Sua IA", hint: "Provedor, chave e revisor", icon: KeyRoundIcon },
  { id: "anki", title: "Conectar o Anki", hint: "Opcional", icon: LayersIcon },
  { id: "data", title: "Seus dados", hint: "Opcional", icon: DatabaseIcon },
  { id: "tab", title: "Primeira aba", hint: "Por onde começar", icon: LayoutGridIcon },
];

export interface OnboardingResult {
  tab: TabChoice;
}

/**
 * Configuração inicial em tela cheia. Toda etapa pode ser pulada; o que já
 * estiver resolvido (ex.: chave e proxy do Anki no .env, rodando local)
 * aparece marcado como pronto.
 */
export function Onboarding({ onFinish }: { onFinish: (result: OnboardingResult) => void }) {
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<Set<StepId>>(() => new Set(["welcome"]));
  const [tabChoice, setTabChoice] = useState<TabChoice>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasAi = useHasAiAccess();
  const { data: anki } = useAnkiStatus();

  const step = STEPS[index] ?? STEPS[0];
  const isLast = index === STEPS.length - 1;
  const ready: Record<StepId, boolean> = {
    welcome: visited.has("key"),
    key: hasAi,
    anki: Boolean(anki?.connected),
    data: visited.has("tab"),
    tab: tabChoice !== null,
  };

  // Trava a rolagem da página por trás e leva o foco para o título da etapa.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o foco deve mudar a cada troca de etapa
  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  const goTo = (next: number) => {
    const target = STEPS[next];
    if (!target) return;
    setVisited((current) => new Set(current).add(target.id));
    setIndex(next);
  };

  const finish = () => onFinish({ tab: tabChoice });

  const primaryLabel = (() => {
    if (step?.id === "welcome") return "Começar";
    if (isLast)
      return tabChoice === "new"
        ? "Criar minha aba"
        : tabChoice === "import"
          ? "Criar abas dos baralhos"
          : "Ir para o estúdio";
    if (step && !ready[step.id] && (step.id === "key" || step.id === "anki")) return "Pular por enquanto";
    return "Continuar";
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configuração inicial do Anki Studio"
      className="fixed inset-0 z-50 flex bg-background"
      data-testid="onboarding"
    >
      <aside className="relative hidden w-80 shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-b from-indigo-600 via-indigo-700 to-violet-800 p-8 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative grid gap-10">
          <Logo variant="onDark" className="text-lg" />
          <nav aria-label="Etapas da configuração">
            <ol className="grid gap-1">
              {STEPS.map((item, position) => {
                const Icon = item.icon;
                const current = position === index;
                const done = ready[item.id] && !current;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => goTo(position)}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        current ? "bg-white/15" : "hover:bg-white/10",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full border",
                          done ? "border-emerald-300 bg-emerald-400 text-indigo-950" : "border-white/30",
                          current && "border-white bg-white text-indigo-700",
                        )}
                      >
                        {done ? <CheckIcon className="size-4" /> : <Icon className="size-4" />}
                      </span>
                      <span className="grid">
                        <span className={cn("font-medium text-sm", !current && "text-white/85")}>{item.title}</span>
                        <span className="text-white/60 text-xs">{item.hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
        <p className="relative text-sm text-white/70">
          Seus dados ficam só neste navegador. Não existe conta nem banco de dados no servidor.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b px-5 py-3 sm:px-8">
          <LogoMark className="size-7 lg:hidden" />
          <div className="grid flex-1 gap-1.5">
            <span className="text-muted-foreground text-xs">
              Passo {index + 1} de {STEPS.length} · {step?.title}
            </span>
            <Progress value={((index + 1) / STEPS.length) * 100} aria-label="Progresso da configuração" />
          </div>
          <Button variant="ghost" size="sm" onClick={finish}>
            Pular configuração
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div
            key={step?.id}
            className="mx-auto w-full max-w-2xl px-5 py-10 duration-300 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none sm:px-8 sm:py-14"
          >
            {step?.id === "welcome" && <StepWelcome ref={heading} />}
            {step?.id === "key" && <StepKey ref={heading} />}
            {step?.id === "anki" && <StepAnki ref={heading} />}
            {step?.id === "data" && <StepData ref={heading} />}
            {step?.id === "tab" && <StepTab ref={heading} value={tabChoice} onChange={setTabChoice} />}
          </div>
        </main>

        <footer className="flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-8">
          <Button variant="ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>
            <ArrowLeftIcon /> Voltar
          </Button>
          <Button
            size="lg"
            variant={step && !ready[step.id] && (step.id === "key" || step.id === "anki") ? "outline" : "default"}
            onClick={() => (isLast ? finish() : goTo(index + 1))}
            data-testid="onboarding-next"
          >
            {primaryLabel} {!isLast && <ArrowRightIcon />}
          </Button>
        </footer>
      </div>
    </div>
  );
}
