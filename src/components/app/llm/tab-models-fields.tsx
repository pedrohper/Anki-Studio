"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/lib/client/settings";
import { describeModel, type TabLlm } from "@/lib/llm/providers";
import { ModelPicker } from "./model-picker";

type ReviewerMode = "default" | "off" | "custom";

/** Modelos de uma aba: por padrão herda as Configurações; dá para trocar gerador e revisor. */
export function TabModelsFields({ value, onChange }: { value: TabLlm | undefined; onChange: (value: TabLlm) => void }) {
  const settings = useSettings();
  const llm = value ?? {};
  const reviewerMode: ReviewerMode = llm.reviewer === undefined ? "default" : llm.reviewer === null ? "off" : "custom";
  const defaultReviewer = settings.reviewer ? describeModel(settings.reviewer) : "sem revisão";

  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      <legend className="px-1 font-medium text-sm">Modelos de IA desta aba</legend>

      <div className="grid gap-3">
        <Label className="flex items-start gap-3 font-normal">
          <Switch
            checked={Boolean(llm.generator)}
            onCheckedChange={(checked) =>
              onChange({ ...llm, generator: checked ? { ...settings.generator } : undefined })
            }
          />
          <span className="grid gap-0.5">
            <span className="font-medium">Usar um modelo próprio para gerar</span>
            <span className="text-muted-foreground text-xs">
              Padrão das Configurações: {describeModel(settings.generator)}
            </span>
          </span>
        </Label>
        {llm.generator && (
          <ModelPicker
            value={llm.generator}
            onChange={(generator) => onChange({ ...llm, generator })}
            label="Gera com"
          />
        )}
      </div>

      <div className="grid gap-3">
        <Label htmlFor="tab-reviewer-mode">Revisor (um segundo modelo confere os cards)</Label>
        <select
          id="tab-reviewer-mode"
          className="h-8 rounded-lg border bg-background px-2 text-sm"
          value={reviewerMode}
          onChange={(event) => {
            const mode = event.target.value as ReviewerMode;
            if (mode === "default") onChange({ ...llm, reviewer: undefined });
            else if (mode === "off") onChange({ ...llm, reviewer: null });
            else onChange({ ...llm, reviewer: settings.reviewer ?? { provider: "openai", model: "" } });
          }}
        >
          <option value="default">Padrão das Configurações ({defaultReviewer})</option>
          <option value="off">Sem revisão nesta aba</option>
          <option value="custom">Escolher um revisor para esta aba</option>
        </select>
        {llm.reviewer && (
          <ModelPicker
            value={llm.reviewer}
            onChange={(reviewer) => onChange({ ...llm, reviewer })}
            label="Revisa com"
          />
        )}
      </div>
    </fieldset>
  );
}
