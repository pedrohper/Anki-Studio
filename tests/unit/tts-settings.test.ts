// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

async function freshSettings() {
  vi.resetModules();
  return import("@/lib/client/settings");
}

describe("chaves de voz nas configurações locais", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("guarda a chave só na sessão quando não é para lembrar", async () => {
    const settings = await freshSettings();
    settings.setTtsKey("elevenlabs", " el-key ");
    expect(settings.ttsKeyFor("elevenlabs")).toBe("el-key");
    expect(localStorage.getItem("anki-studio:settings")).not.toContain("el-key");
    expect(sessionStorage.getItem("anki-studio:session-keys")).toContain("el-key");

    const reloaded = await freshSettings();
    expect(reloaded.ttsKeyFor("elevenlabs")).toBe("el-key");
  });

  it("lembra no localStorage quando a pessoa pede", async () => {
    const settings = await freshSettings();
    settings.updateSettings({ rememberKey: true });
    settings.setTtsKey("google", "g-key");
    expect(localStorage.getItem("anki-studio:settings")).toContain("g-key");
    expect((await freshSettings()).ttsKeyFor("google")).toBe("g-key");
  });

  it("na OpenAI, usa a chave de IA quando não há chave de voz", async () => {
    const settings = await freshSettings();
    settings.setProviderKey("openai", "sk-ai");
    expect(settings.ttsKeyFor("openai")).toBe("sk-ai");
    settings.setTtsKey("openai", "sk-voz");
    expect(settings.ttsKeyFor("openai")).toBe("sk-voz");
    settings.setTtsKey("openai", "");
    expect(settings.ttsKeyFor("openai")).toBe("sk-ai");
  });

  it("lê a sessão no formato antigo (só chaves de IA)", async () => {
    sessionStorage.setItem("anki-studio:session-keys", JSON.stringify({ deepseek: "sk-old" }));
    const settings = await freshSettings();
    expect(settings.keyFor("deepseek")).toBe("sk-old");
    expect(settings.getSettings().ttsKeys).toEqual({});
  });
});
