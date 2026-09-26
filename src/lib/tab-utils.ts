import type { PromptOrigin, Tab } from "@/lib/schemas/tab";
import { createId, nowIso } from "@/lib/shared/id";

const MAX_VERSIONS = 50;

/** Troca o prompt da aba guardando a versão anterior no histórico. */
export function withNewPromptVersion(tab: Tab, prompt: string, origin: PromptOrigin, note?: string): Tab {
  const now = nowIso();
  const version = { id: createId(), prompt: prompt.trim(), origin, createdAt: now, ...(note ? { note } : {}) };
  return {
    ...tab,
    systemPrompt: version.prompt,
    promptVersions: [...tab.promptVersions, version].slice(-MAX_VERSIONS),
    updatedAt: now,
  };
}

export function duplicateTab(tab: Tab): Tab {
  const now = nowIso();
  return {
    ...tab,
    id: createId(),
    name: `${tab.name} (cópia)`.slice(0, 60),
    createdAt: now,
    updatedAt: now,
    promptVersions: [
      { id: createId(), prompt: tab.systemPrompt, origin: "manual", createdAt: now, note: `Cópia de ${tab.name}` },
    ],
  };
}

export const ORIGIN_LABELS: Record<PromptOrigin, string> = {
  template: "Modelo",
  generated: "Gerado pela IA",
  manual: "Editado por você",
  refined: "Melhorado com o uso",
  imported: "Importado",
};

/** Quantos ajustes de revisão bastam para a IA ter o que sugerir. */
export const REFINE_THRESHOLD = 5;
