"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAnkiStatus, useEffectiveModels, useHasAiAccess, useSaveTab } from "@/hooks/use-studio";
import { api } from "@/lib/client/api";
import { EMPTY_TAB_SETTINGS, LANGUAGE_OPTIONS, manualPromptFor, VOICE_OPTIONS } from "@/lib/default-tabs";
import {
  CARD_TYPE_LABELS,
  CARD_TYPES,
  FEATURE_LABELS,
  SOURCE_KINDS,
  SOURCE_LABELS,
  type Tab,
  type TabFeatures,
  type TabSettings,
  tabSettingsSchema,
} from "@/lib/schemas/tab";
import { createId, nowIso } from "@/lib/shared/id";
import { TabModelsFields } from "./llm/tab-models-fields";

type Step = "settings" | "prompt";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * Criar ou editar uma aba. Ao criar, a IA escreve o system prompt a partir do
 * objetivo; a pessoa revisa (e pode editar) antes de salvar.
 */
export function TabEditorDialog({
  open,
  onOpenChange,
  tab,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab?: Tab;
  onSaved?: (tab: Tab) => void;
}) {
  const formId = useId();
  const isEditing = Boolean(tab);
  const [settings, setSettings] = useState<TabSettings>(tab ?? EMPTY_TAB_SETTINGS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>("settings");
  const [prompt, setPrompt] = useState("");
  const [summary, setSummary] = useState("");
  const hasAi = useHasAiAccess(settings);
  const { generator } = useEffectiveModels(settings);
  const { data: anki } = useAnkiStatus();
  const saveTab = useSaveTab();

  useEffect(() => {
    if (open) {
      setSettings(tab ?? EMPTY_TAB_SETTINGS);
      setErrors({});
      setStep("settings");
      setPrompt("");
      setSummary("");
    }
  }, [open, tab]);

  const writePrompt = useMutation({
    mutationFn: (data: TabSettings) => api.tabPrompt(data, generator),
    onSuccess: (result) => {
      setPrompt(result.systemPrompt);
      setSummary(result.summary);
      setStep("prompt");
    },
    onError: (error) => toast.error(error.message),
  });

  const update = <K extends keyof TabSettings>(key: K, value: TabSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const updateFeature = (key: keyof TabFeatures, value: boolean) =>
    setSettings((current) => ({ ...current, features: { ...current.features, [key]: value } }));

  function validate(): TabSettings | null {
    const result = tabSettingsSchema.safeParse(settings);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) next[String(issue.path[0])] ??= issue.message;
    setErrors(next);
    return null;
  }

  async function persist(data: TabSettings, systemPrompt: string, origin: "generated" | "manual") {
    const now = nowIso();
    const saved: Tab = tab
      ? { ...tab, ...data, updatedAt: now }
      : {
          ...data,
          id: createId(),
          systemPrompt,
          promptVersions: [
            { id: createId(), prompt: systemPrompt, origin, createdAt: now, note: summary || undefined },
          ],
          createdAt: now,
          updatedAt: now,
        };
    await saveTab.mutateAsync(saved);
    toast.success(isEditing ? "Aba atualizada." : `Aba "${saved.name}" criada.`);
    onSaved?.(saved);
    onOpenChange(false);
  }

  function handleSettingsSubmit(event: React.FormEvent) {
    event.preventDefault();
    const data = validate();
    if (!data) return;
    if (isEditing) {
      void persist(data, tab?.systemPrompt ?? "", "manual");
      return;
    }
    if (hasAi) writePrompt.mutate(data);
    else {
      setPrompt(manualPromptFor(data));
      setStep("prompt");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar aba" : step === "settings" ? "Nova aba" : "Prompt da aba"}</DialogTitle>
          <DialogDescription>
            {step === "settings"
              ? "Descreva o que você quer estudar. A IA usa isso para escrever as instruções desta aba."
              : hasAi
                ? "A IA escreveu as instruções desta aba. Ajuste o que quiser antes de salvar; dá para mudar depois."
                : "Sem chave da DeepSeek, comece com este prompt básico. Depois você pode pedir para a IA reescrever."}
          </DialogDescription>
        </DialogHeader>

        {step === "settings" ? (
          <form id={formId} onSubmit={handleSettingsSubmit} className="grid gap-5">
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-emoji`}>Ícone</Label>
                <Input
                  id={`${formId}-emoji`}
                  value={settings.emoji}
                  maxLength={4}
                  className="text-center text-lg"
                  onChange={(event) => update("emoji", event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-name`}>Nome</Label>
                <Input
                  id={`${formId}-name`}
                  value={settings.name}
                  placeholder="Ex.: Cálculo II, Direito Penal, Espanhol"
                  onChange={(event) => update("name", event.target.value)}
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name && <p className="text-destructive text-xs">{errors.name}</p>}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-goal`}>Objetivo</Label>
              <Textarea
                id={`${formId}-goal`}
                rows={4}
                value={settings.goal}
                placeholder="Ex.: Entender derivadas parciais e integrais duplas para a prova, com foco em interpretar cada termo das fórmulas e saber quando usar cada método."
                onChange={(event) => update("goal", event.target.value)}
                aria-invalid={Boolean(errors.goal)}
              />
              {errors.goal ? (
                <p className="text-destructive text-xs">{errors.goal}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Quanto mais específico, melhor o prompt que a IA escreve.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-deck`}>Baralho padrão no Anki</Label>
                <Input
                  id={`${formId}-deck`}
                  list={`${formId}-decks`}
                  value={settings.deckName}
                  placeholder="Ex.: Faculdade::Cálculo II"
                  onChange={(event) => update("deckName", event.target.value)}
                  aria-invalid={Boolean(errors.deckName)}
                />
                <datalist id={`${formId}-decks`}>
                  {anki?.decks.map((deck) => (
                    <option key={deck} value={deck} />
                  ))}
                </datalist>
                {errors.deckName && <p className="text-destructive text-xs">{errors.deckName}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-lang`}>Idioma dos cards</Label>
                <Input
                  id={`${formId}-lang`}
                  list={`${formId}-langs`}
                  value={settings.cardLanguage}
                  onChange={(event) => update("cardLanguage", event.target.value)}
                />
                <datalist id={`${formId}-langs`}>
                  {LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language} />
                  ))}
                </datalist>
              </div>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium text-sm">Tipos de card</legend>
              <div className="flex flex-wrap gap-4">
                {CARD_TYPES.map((type) => (
                  <Label key={type} className="flex items-center gap-2 font-normal">
                    <Checkbox
                      checked={settings.cardTypes.includes(type)}
                      onCheckedChange={() => update("cardTypes", toggle(settings.cardTypes, type))}
                    />
                    {CARD_TYPE_LABELS[type]}
                  </Label>
                ))}
              </div>
              {errors.cardTypes && <p className="text-destructive text-xs">{errors.cardTypes}</p>}
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium text-sm">Fontes de material</legend>
              <div className="flex flex-wrap gap-2">
                {SOURCE_KINDS.map((source) => {
                  const active = settings.sources.includes(source);
                  return (
                    <Button
                      key={source}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      onClick={() => update("sources", toggle(settings.sources, source))}
                    >
                      {SOURCE_LABELS[source]}
                    </Button>
                  );
                })}
              </div>
              {errors.sources && <p className="text-destructive text-xs">{errors.sources}</p>}
            </fieldset>

            <fieldset className="grid gap-3">
              <legend className="mb-1 font-medium text-sm">Recursos extras</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(FEATURE_LABELS) as Array<keyof TabFeatures>).map((key) => (
                  <Label key={key} className="flex items-start gap-3 rounded-lg border p-3 font-normal">
                    <Switch
                      checked={settings.features[key]}
                      onCheckedChange={(checked) => updateFeature(key, checked)}
                    />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{FEATURE_LABELS[key].label}</span>
                      <span className="text-muted-foreground text-xs">{FEATURE_LABELS[key].hint}</span>
                    </span>
                  </Label>
                ))}
              </div>
            </fieldset>

            {settings.features.audio && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-voice`}>Voz do áudio</Label>
                <select
                  id={`${formId}-voice`}
                  className="h-8 rounded-lg border bg-background px-2 text-sm"
                  value={settings.ttsVoice ?? VOICE_OPTIONS[0]?.value}
                  onChange={(event) => update("ttsVoice", event.target.value)}
                >
                  {VOICE_OPTIONS.map((voice) => (
                    <option key={voice.value} value={voice.value}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <TabModelsFields value={settings.llm} onChange={(llm) => update("llm", llm)} />

            {isEditing && (
              <p className="rounded-lg bg-muted p-3 text-muted-foreground text-xs">
                Mudar as configurações não reescreve o prompt. Para isso, use “Prompt da aba” → “Pedir para a IA
                reescrever”.
              </p>
            )}
          </form>
        ) : (
          <div className="grid gap-3">
            {summary && (
              <p className="flex items-start gap-2 text-sm">
                <Badge variant="secondary">
                  <SparklesIcon /> Foco
                </Badge>
                {summary}
              </p>
            )}
            <Textarea
              aria-label="Texto do prompt"
              rows={16}
              className="font-mono text-xs leading-relaxed"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              As regras de formato, HTML seguro e fidelidade ao material são da plataforma e sempre valem, então este
              texto só precisa falar do estilo de estudo.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "prompt" && (
            <Button variant="ghost" onClick={() => setStep("settings")}>
              Voltar
            </Button>
          )}
          {step === "settings" ? (
            <Button type="submit" form={formId} disabled={writePrompt.isPending || saveTab.isPending}>
              {writePrompt.isPending ? (
                <>
                  <Loader2Icon className="animate-spin" /> A IA está escrevendo o prompt…
                </>
              ) : isEditing ? (
                "Salvar"
              ) : hasAi ? (
                <>
                  <SparklesIcon /> Criar prompt com IA
                </>
              ) : (
                "Continuar"
              )}
            </Button>
          ) : (
            <Button
              disabled={prompt.trim().length < 20 || saveTab.isPending}
              onClick={() => {
                const data = validate();
                if (data) void persist(data, prompt.trim(), hasAi ? "generated" : "manual");
              }}
            >
              Salvar aba
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
