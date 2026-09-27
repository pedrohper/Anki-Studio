import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { NetworkInterfaceInfo } from "node:os";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as pinRoute, DELETE as removePinRoute } from "@/app/api/access/pin/route";
import { POST as tunnelRoute } from "@/app/api/access/tunnel/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as shareGet, POST as sharePost } from "@/app/compartilhar/route";
import manifest from "@/app/manifest";
import { pinIsSet, savePin, verifyPin } from "@/lib/server/access-store";
import { AUTH_COOKIE, isPublicPath, isValidSession, safeReturnPath, sessionToken } from "@/lib/server/auth";
import { pickLanAddresses, portFromRequest } from "@/lib/server/network";
import { resetPinGuard } from "@/lib/server/pin-guard";
import { resetRateLimit } from "@/lib/server/rate-limit";
import { cloudflaredDownloadUrl, tunnelSnapshot } from "@/lib/server/tunnel";
import { composeSharedText } from "@/lib/shared/share";
import { proxy } from "@/proxy";

const nic = (address: string, extra: Partial<NetworkInterfaceInfo> = {}) =>
  ({
    address,
    family: "IPv4",
    internal: false,
    netmask: "255.255.255.0",
    mac: "",
    cidr: null,
    ...extra,
  }) as NetworkInterfaceInfo;

describe("endereço para o celular", () => {
  it("prefere o Wi-Fi e ignora loopback, IPv6, link-local e adaptadores virtuais", () => {
    const addresses = pickLanAddresses(
      {
        "vEthernet (WSL)": [nic("172.20.0.1")],
        "Loopback Pseudo-Interface 1": [nic("127.0.0.1", { internal: true })],
        Ethernet: [nic("10.0.0.5"), nic("169.254.3.4")],
        "Wi-Fi": [nic("192.168.100.10"), { ...nic("fe80::1"), family: "IPv6" } as NetworkInterfaceInfo],
      },
      3000,
    );
    expect(addresses.map((item) => item.url)).toEqual(["http://192.168.100.10:3000", "http://10.0.0.5:3000"]);
  });

  it("descobre a porta pelo Host local e usa o padrão atrás do túnel", () => {
    const at = (host: string) => new Request("http://x/api/network", { headers: { host } });
    expect(portFromRequest(at("localhost:4000"), "3000")).toBe("4000");
    expect(portFromRequest(at("192.168.0.2:3100"), "3000")).toBe("3100");
    expect(portFromRequest(at("abc.trycloudflare.com"), "3000")).toBe("3000");
  });
});

describe("compartilhar do celular", () => {
  it("junta título, texto e link sem repetir", () => {
    expect(composeSharedText({ title: "Artigo", text: "", url: "https://ex.com/a" })).toBe("https://ex.com/a");
    expect(composeSharedText({ text: "Olha isso https://ex.com/a", url: "https://ex.com/a" })).toBe(
      "Olha isso https://ex.com/a",
    );
    expect(composeSharedText({ title: "Notas", text: "Mitocôndria produz ATP." })).toBe(
      "Notas\n\nMitocôndria produz ATP.",
    );
  });

  it("o plano B da rota /compartilhar repassa os campos para a tela Início", async () => {
    const form = new FormData();
    form.set("title", "Aula");
    form.set("text", "Resumo da aula");
    const response = await sharePost(new Request("http://localhost/compartilhar", { method: "POST", body: form }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?titulo=Aula&texto=Resumo+da+aula");

    const get = shareGet(new Request("http://localhost/compartilhar?url=https%3A%2F%2Fex.com"));
    expect(get.headers.get("location")).toBe("/?link=https%3A%2F%2Fex.com");
  });

  it("o manifesto declara o app instalável e o destino de compartilhamento", () => {
    const data = manifest();
    expect(data.display).toBe("standalone");
    expect(data.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(data.share_target?.action).toBe("/compartilhar");
  });
});

describe("PIN para acesso fora de casa", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "anki-pin-"));
    process.env.ANKI_STUDIO_DATA_DIR = dir;
    resetRateLimit();
    resetPinGuard();
  });
  afterEach(() => {
    delete process.env.ANKI_STUDIO_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  const json = (url: string, body: unknown, method = "POST", headers: Record<string, string> = {}) =>
    new Request(`http://localhost${url}`, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", ...headers },
      body: JSON.stringify(body),
    });

  it("guarda só o hash do PIN e cada troca gera um segredo novo", () => {
    expect(pinIsSet()).toBe(false);
    const first = savePin("1234");
    expect(pinIsSet()).toBe(true);
    expect(verifyPin("1234")).toBe(true);
    expect(verifyPin("4321")).toBe(false);
    expect(readFileSync(path.join(dir, "acesso.json"), "utf8")).not.toContain("1234");
    expect(savePin("98765")).not.toBe(first);
    expect(() => savePin("12a4")).toThrow();
    expect(() => savePin("123")).toThrow();
  });

  it("sessões só valem para o segredo atual", async () => {
    const token = await sessionToken("segredo-a");
    expect(await isValidSession(token, "segredo-a")).toBe(true);
    expect(await isValidSession(token, "segredo-b")).toBe(false);
    expect(await isValidSession(undefined, "segredo-a")).toBe(false);
  });

  it("libera só a tela de entrar e os arquivos do ícone/PWA", () => {
    for (const p of [
      "/entrar",
      "/api/auth/login",
      "/manifest.webmanifest",
      "/sw.js",
      "/pwa/icon-192.png",
      "/icon.svg",
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
    for (const p of [
      "/",
      "/api/generate",
      "/api/anki",
      "/compartilhar",
      "/api/network",
      "/api/access",
      "/api/access/tunnel",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("não deixa o 'voltar' levar para outro site", () => {
    expect(safeReturnPath("/?x=1")).toBe("/?x=1");
    expect(safeReturnPath("//evil.com")).toBe("/");
    expect(safeReturnPath("https://evil.com")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
  });

  it("sem PIN o proxy deixa tudo passar; com PIN exige a sessão", async () => {
    const open = await proxy(new NextRequest("http://localhost/api/generate"));
    expect(open.headers.get("x-middleware-next")).toBe("1");

    const secret = savePin("2468");
    const api = await proxy(new NextRequest("http://localhost/api/anki", { method: "POST" }));
    expect(api.status).toBe(401);

    const page = await proxy(new NextRequest("http://localhost/?aba=1"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe(`http://localhost/entrar?voltar=${encodeURIComponent("/?aba=1")}`);

    const viaTunnel = await proxy(
      new NextRequest("http://localhost:3000/", {
        headers: { "x-forwarded-proto": "https", "x-forwarded-host": "abc.trycloudflare.com" },
      }),
    );
    expect(viaTunnel.headers.get("location")).toBe("https://abc.trycloudflare.com/entrar");

    const token = await sessionToken(secret);
    const ok = await proxy(
      new NextRequest("http://localhost/api/anki", { headers: { cookie: `${AUTH_COOKIE}=${token}` } }),
    );
    expect(ok.headers.get("x-middleware-next")).toBe("1");
  });

  it("criar o PIN pelo site já conecta este aparelho; trocar exige o PIN atual", async () => {
    const created = await pinRoute(json("/api/access/pin", { pin: "1357" }));
    expect(created.status).toBe(200);
    expect(created.headers.get("set-cookie")).toContain(AUTH_COOKIE);

    expect((await pinRoute(json("/api/access/pin", { pin: "2468" }))).status).toBe(401);
    expect((await pinRoute(json("/api/access/pin", { pin: "2468", currentPin: "0000" }))).status).toBe(401);
    expect((await pinRoute(json("/api/access/pin", { pin: "2468", currentPin: "1357" }))).status).toBe(200);
    expect(verifyPin("2468")).toBe(true);

    expect((await pinRoute(json("/api/access/pin", { pin: "12" }))).status).toBe(400);

    const removed = await removePinRoute(json("/api/access/pin", { currentPin: "2468" }, "DELETE"));
    expect(removed.status).toBe(200);
    expect(pinIsSet()).toBe(false);
  });

  it("não liga o acesso fora de casa sem PIN", async () => {
    const response = await tunnelRoute(json("/api/access/tunnel", { on: true }));
    expect(response.status).toBe(400);
    expect(tunnelSnapshot().status).toBe("off");
  });

  it("login: PIN certo grava o cookie, errado dá 401", async () => {
    savePin("1234");
    const good = await login(json("/api/auth/login", { pin: "1234" }));
    expect(good.status).toBe(200);
    expect((good.headers.get("set-cookie") ?? "").toLowerCase()).toContain("httponly");
    expect((await login(json("/api/auth/login", { pin: "9999" }))).status).toBe(401);
  });

  it("10 erros seguidos travam o login, mesmo trocando de IP", async () => {
    savePin("1234");
    for (let i = 0; i < 10; i++) {
      await login(json("/api/auth/login", { pin: "0000" }, "POST", { "x-forwarded-for": `9.9.9.${i}` }));
    }
    const locked = await login(json("/api/auth/login", { pin: "1234" }, "POST", { "x-forwarded-for": "8.8.8.8" }));
    expect(locked.status).toBe(429);
  });

  it("o cloudflared é baixado do GitHub oficial da Cloudflare", () => {
    expect(cloudflaredDownloadUrl("win32", "x64")).toMatch(
      /^https:\/\/github\.com\/cloudflare\/cloudflared\/releases\/latest\/download\/cloudflared-windows-amd64\.exe$/,
    );
    expect(cloudflaredDownloadUrl("darwin", "arm64")).toBeNull();
  });
});
