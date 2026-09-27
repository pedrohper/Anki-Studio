import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as accessGet } from "@/app/api/access/route";
import { POST as tunnelConfig } from "@/app/api/access/tunnel/config/route";
import { savePin } from "@/lib/server/access-store";
import { ngrokErrorMessage, resumeTunnelIfEnabled, startTunnel, stopTunnel, tunnelSnapshot } from "@/lib/server/tunnel";
import { normalizeDomain, readTunnelConfig, writeTunnelConfig } from "@/lib/server/tunnel-config";

describe("link de fora de casa", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "anki-tunnel-"));
    process.env.ANKI_STUDIO_DATA_DIR = dir;
  });
  afterEach(async () => {
    await stopTunnel(false);
    delete process.env.ANKI_STUDIO_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (body: unknown) =>
    new Request("http://localhost/api/access/tunnel/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("aceita o domínio do ngrok colado de qualquer jeito", () => {
    expect(normalizeDomain(" https://Meu-Anki.ngrok-free.app/ ")).toBe("meu-anki.ngrok-free.app");
  });

  it("guarda o token no PC e nunca devolve para o navegador", async () => {
    const saved = await tunnelConfig(
      post({ provider: "ngrok", ngrokToken: "tok_123", ngrokDomain: "https://x.ngrok-free.app" }),
    );
    expect(saved.status).toBe(200);
    expect(readTunnelConfig()).toMatchObject({
      provider: "ngrok",
      ngrokToken: "tok_123",
      ngrokDomain: "x.ngrok-free.app",
    });

    const body = await (accessGet() as Response).json();
    expect(JSON.stringify(body)).not.toContain("tok_123");
    expect(body.config).toEqual({ provider: "ngrok", hasNgrokToken: true, ngrokDomain: "x.ngrok-free.app" });

    // mandar sem token mantém o que já estava salvo
    await tunnelConfig(post({ provider: "ngrok", ngrokDomain: "" }));
    expect(readTunnelConfig().ngrokToken).toBe("tok_123");
    expect((await tunnelConfig(post({ provider: "ngrok", ngrokDomain: "não é domínio" }))).status).toBe(400);
  });

  it("ngrok sem token vira erro de configuração (não fica tentando para sempre)", async () => {
    writeTunnelConfig({ provider: "ngrok" });
    await startTunnel(3000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tunnelSnapshot()).toMatchObject({ status: "error", provider: "ngrok" });
    expect(tunnelSnapshot().error).toMatch(/token/i);
    expect(readTunnelConfig().enabled).toBe(true);
  });

  it("ao abrir o app só religa se estava ligado e existe PIN", async () => {
    writeTunnelConfig({ provider: "ngrok", enabled: true });
    resumeTunnelIfEnabled("3000", false);
    expect(tunnelSnapshot().status).toBe("off");
    savePin("1234");
    resumeTunnelIfEnabled("3000", true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tunnelSnapshot().status).not.toBe("off");
  });

  it("traduz os erros do ngrok", () => {
    expect(ngrokErrorMessage(new Error("ERR_NGROK_105 authentication failed"))).toMatch(/Token do ngrok inválido/);
    expect(ngrokErrorMessage(new Error("ERR_NGROK_108 limited to 1 simultaneous session"))).toMatch(/outro lugar/);
  });
});
