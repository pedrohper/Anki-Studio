import type { NetworkInterfaceInfo } from "node:os";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as shareGet, POST as sharePost } from "@/app/compartilhar/route";
import manifest from "@/app/manifest";
import {
  AUTH_COOKIE,
  isPublicPath,
  isValidSession,
  passwordMatches,
  safeReturnPath,
  sessionToken,
} from "@/lib/server/auth";
import { pickLanAddresses, portFromRequest } from "@/lib/server/network";
import { resetRateLimit } from "@/lib/server/rate-limit";
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

describe("senha para acesso fora de casa", () => {
  const original = process.env.APP_PASSWORD;
  beforeEach(() => resetRateLimit());
  afterEach(() => {
    if (original === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = original;
  });

  it("gera sessões que só valem para a senha atual", async () => {
    const token = await sessionToken("senha-forte-1");
    expect(await isValidSession(token, "senha-forte-1")).toBe(true);
    expect(await isValidSession(token, "outra-senha")).toBe(false);
    expect(await isValidSession(undefined, "senha-forte-1")).toBe(false);
    expect(await passwordMatches("senha-forte-1", "senha-forte-1")).toBe(true);
    expect(await passwordMatches("senha", "senha-forte-1")).toBe(false);
  });

  it("libera só a tela de entrar e os arquivos do ícone/PWA", () => {
    for (const path of [
      "/entrar",
      "/api/auth/login",
      "/manifest.webmanifest",
      "/sw.js",
      "/pwa/icon-192.png",
      "/icon.svg",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
    for (const path of ["/", "/api/generate", "/api/anki", "/compartilhar", "/api/network"]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it("não deixa o 'voltar' levar para outro site", () => {
    expect(safeReturnPath("/?x=1")).toBe("/?x=1");
    expect(safeReturnPath("//evil.com")).toBe("/");
    expect(safeReturnPath("https://evil.com")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
  });

  it("sem APP_PASSWORD, o proxy deixa tudo passar", async () => {
    delete process.env.APP_PASSWORD;
    const response = await proxy(new NextRequest("http://localhost/api/generate"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("com APP_PASSWORD, bloqueia a API e manda as páginas para /entrar", async () => {
    process.env.APP_PASSWORD = "senha-forte-1";
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

    const token = await sessionToken("senha-forte-1");
    const ok = await proxy(
      new NextRequest("http://localhost/api/anki", { headers: { cookie: `${AUTH_COOKIE}=${token}` } }),
    );
    expect(ok.headers.get("x-middleware-next")).toBe("1");
  });

  it("login certo grava o cookie; errado dá 401; tentativa demais dá 429", async () => {
    process.env.APP_PASSWORD = "senha-forte-1";
    const attempt = (password: string) =>
      login(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
          body: JSON.stringify({ password }),
        }),
      );

    const good = await attempt("senha-forte-1");
    expect(good.status).toBe(200);
    const cookie = good.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${AUTH_COOKIE}=${await sessionToken("senha-forte-1")}`);
    expect(cookie.toLowerCase()).toContain("httponly");

    expect((await attempt("errada")).status).toBe(401);
    for (let i = 0; i < 3; i++) await attempt("errada");
    expect((await attempt("senha-forte-1")).status).toBe(429);
  });
});
