"use client";

import type { ZodType, z } from "zod";
import type { ModelRef, ProviderId } from "@/lib/llm/providers";
import {
  type AccessStatus,
  type ApkgRequest,
  type AppConfig,
  accessStatusSchema,
  appConfigSchema,
  type DeckAnalysisRequest,
  type DeckAnalysisResponse,
  deckAnalysisResponseSchema,
  extractUrlResponseSchema,
  type GenerateRequest,
  type KeyCheckResponse,
  keyCheckResponseSchema,
  lanAddressesSchema,
  modelsResponseSchema,
  type PromptResponse,
  promptResponseSchema,
  type RefineRequest,
  type RefineResponse,
  type ReviewRequest,
  type ReviewResponse,
  type RouteRequest,
  type RouteResponse,
  refineResponseSchema,
  reviewResponseSchema,
  routeResponseSchema,
  type TunnelSnapshot,
  ttsResponseSchema,
  tunnelSnapshotSchema,
  type WeakSpotsRequest,
  type WeakSpotsResponse,
  weakSpotsResponseSchema,
} from "@/lib/schemas/api";
import { type StudyPlan, studyPlanSchema } from "@/lib/schemas/card";
import type { TabSettings } from "@/lib/schemas/tab";
import { keyFor } from "./settings";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** A chave vai só no header da requisição do provedor escolhido. */
async function send(path: string, body?: unknown, apiKey?: string): Promise<Response> {
  return sendWithMethod(body === undefined ? "GET" : "POST", path, body, apiKey);
}

async function sendWithMethod(method: string, path: string, body?: unknown, apiKey?: string): Promise<Response> {
  const response = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-llm-key": apiKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiRequestError("Sem conexão com o servidor.", 0, "offline");
  });

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    let code: string | undefined;
    try {
      const data = (await response.json()) as { error?: { message?: string; code?: string } };
      message = data.error?.message ?? message;
      code = data.error?.code;
    } catch {
      // resposta sem JSON
    }
    // Sessão expirou (app protegido por senha): volta para a tela de entrar.
    if (code === "unauthorized" && typeof window !== "undefined" && window.location.pathname !== "/entrar") {
      window.location.assign(`/entrar?voltar=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    throw new ApiRequestError(message, response.status, code);
  }
  return response;
}

async function request<T extends ZodType>(
  path: string,
  body: unknown,
  schema: T,
  provider?: ProviderId,
): Promise<z.output<T>> {
  const response = await send(path, body, provider ? keyFor(provider) : undefined);
  return schema.parse(await response.json());
}

export const api = {
  config: async (): Promise<AppConfig> => appConfigSchema.parse(await (await send("/api/config")).json()),
  /** Endereços do PC na rede Wi-Fi, para abrir no celular. */
  network: async () => lanAddressesSchema.parse(await (await send("/api/network")).json()).addresses,
  login: async (pin: string): Promise<void> => {
    await send("/api/auth/login", { pin });
  },
  /** PIN e acesso fora de casa. */
  access: async (): Promise<AccessStatus> => accessStatusSchema.parse(await (await send("/api/access")).json()),
  savePin: async (pin: string, currentPin?: string): Promise<void> => {
    await send("/api/access/pin", { pin, currentPin });
  },
  removePin: async (currentPin: string): Promise<void> => {
    await sendWithMethod("DELETE", "/api/access/pin", { currentPin });
  },
  setTunnel: async (on: boolean): Promise<TunnelSnapshot> =>
    tunnelSnapshotSchema.parse(
      ((await (await send("/api/access/tunnel", { on })).json()) as { tunnel: unknown }).tunnel,
    ),
  logout: async (): Promise<void> => {
    await send("/api/auth/logout", {});
  },
  /** Testa uma chave específica (ainda não salva) ou a salva do provedor. */
  checkKey: async (provider: ProviderId, apiKey?: string): Promise<KeyCheckResponse> => {
    const response = await send("/api/check-key", { provider }, apiKey ?? keyFor(provider));
    return keyCheckResponseSchema.parse(await response.json());
  },
  models: async (provider: ProviderId, apiKey?: string): Promise<string[]> => {
    const response = await send("/api/models", { provider }, apiKey ?? keyFor(provider));
    return modelsResponseSchema.parse(await response.json()).models;
  },
  generate: (body: GenerateRequest): Promise<StudyPlan> =>
    request("/api/generate", body, studyPlanSchema, body.llm?.provider),
  review: (body: ReviewRequest): Promise<ReviewResponse> =>
    request("/api/review", body, reviewResponseSchema, body.llm?.provider),
  tabPrompt: (settings: TabSettings, llm: ModelRef): Promise<PromptResponse> =>
    request("/api/tab-prompt", { settings, llm }, promptResponseSchema, llm.provider),
  refine: (body: RefineRequest): Promise<RefineResponse> =>
    request("/api/refine", body, refineResponseSchema, body.llm?.provider),
  deckAnalysis: (body: DeckAnalysisRequest): Promise<DeckAnalysisResponse> =>
    request("/api/deck-analysis", body, deckAnalysisResponseSchema, body.llm?.provider),
  route: (body: RouteRequest): Promise<RouteResponse> =>
    request("/api/route", body, routeResponseSchema, body.llm?.provider),
  weakSpots: (body: WeakSpotsRequest): Promise<WeakSpotsResponse> =>
    request("/api/weak-spots", body, weakSpotsResponseSchema, body.llm?.provider),
  extract: (url: string, kind: "url" | "youtube") => request("/api/extract", { url, kind }, extractUrlResponseSchema),
  tts: (text: string, voice?: string) => request("/api/tts", { text, voice }, ttsResponseSchema),
  apkg: async (body: ApkgRequest): Promise<Blob> => (await send("/api/apkg", body)).blob(),
};
