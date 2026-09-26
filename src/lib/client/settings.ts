"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { DEFAULT_GENERATOR, modelRefSchema, type ProviderId, providerIdSchema } from "@/lib/llm/providers";

/**
 * Preferências do visitante. A chave da DeepSeek só vai para o localStorage
 * se a pessoa marcar "lembrar neste navegador"; senão fica na sessionStorage
 * e some quando a aba do navegador fecha.
 */

const settingsSchema = z.object({
  /** Legado (só DeepSeek). Migrado para providerKeys. */
  apiKey: z.string().default(""),
  /** Chave de cada provedor de IA. */
  providerKeys: z.partialRecord(providerIdSchema, z.string()).default({}),
  /** Modelo padrão que gera os cards. */
  generator: modelRefSchema.default(DEFAULT_GENERATOR),
  /** Modelo padrão que revisa os cards (null = sem revisão). */
  reviewer: modelRefSchema.nullable().default(null),
  rememberKey: z.boolean().default(false),
  ankiMode: z.enum(["auto", "direct", "proxy"]).default("auto"),
  ankiUrl: z.string().default("http://127.0.0.1:8765"),
  ankiKey: z.string().default(""),
  saveContext: z.boolean().default(true),
  /** Como a pessoa quer ser chamada ("Olá, Pedro"). */
  userName: z.string().max(40).default(""),
  /** Onboarding concluído (ou pulado) neste navegador. */
  onboardingDone: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

const STORAGE_KEY = "anki-studio:settings";
const SESSION_KEY = "anki-studio:session-keys";
const LEGACY_SESSION_KEY = "anki-studio:session-key";
const DEFAULTS = settingsSchema.parse({});

let current: Settings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // navegação privada ou armazenamento bloqueado: segue só em memória
  }
}

function load(): Settings {
  if (loaded || typeof window === "undefined") return current;
  loaded = true;
  try {
    const raw = safeGet(() => localStorage, STORAGE_KEY);
    const parsed = settingsSchema.parse(raw ? JSON.parse(raw) : {});
    const session = readSessionKeys();
    const providerKeys = parsed.rememberKey ? parsed.providerKeys : session;
    // Migração da primeira versão, que só tinha a chave da DeepSeek.
    const legacy = parsed.rememberKey ? parsed.apiKey : (safeGet(() => sessionStorage, LEGACY_SESSION_KEY) ?? "");
    if (legacy && !providerKeys.deepseek) providerKeys.deepseek = legacy;
    current = { ...parsed, apiKey: "", providerKeys };
  } catch {
    current = DEFAULTS;
  }
  return current;
}

export function getSettings(): Settings {
  return load();
}

function readSessionKeys(): Settings["providerKeys"] {
  try {
    const raw = safeGet(() => sessionStorage, SESSION_KEY);
    return raw ? settingsSchema.shape.providerKeys.parse(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...load(), ...patch };
  const persisted = { ...current, apiKey: "", providerKeys: current.rememberKey ? current.providerKeys : {} };
  safeSet(() => localStorage, STORAGE_KEY, JSON.stringify(persisted));
  safeSet(() => sessionStorage, SESSION_KEY, current.rememberKey ? null : JSON.stringify(current.providerKeys));
  safeSet(() => sessionStorage, LEGACY_SESSION_KEY, null);
  for (const listener of listeners) listener();
}

/** Salva (ou apaga, com texto vazio) a chave de um provedor. */
export function setProviderKey(provider: ProviderId, key: string) {
  const providerKeys = { ...load().providerKeys };
  if (key.trim()) providerKeys[provider] = key.trim();
  else delete providerKeys[provider];
  updateSettings({ providerKeys });
}

export function keyFor(provider: ProviderId): string {
  return load().providerKeys[provider] ?? "";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULTS);
}

/** false na renderização do servidor e na hidratação; true depois de montar no navegador. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const noopSubscribe = () => () => {};
