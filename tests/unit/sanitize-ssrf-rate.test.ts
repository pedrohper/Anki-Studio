import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/errors";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { sanitizeCardHtml, toPlainText } from "@/lib/server/sanitize";
import { assertPublicUrl, isPrivateIp } from "@/lib/server/ssrf";

describe("sanitizeCardHtml", () => {
  it("remove scripts, eventos, links e imagens", () => {
    const dirty = `<b onclick="x()">ok</b><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:1">link</a>`;
    const clean = sanitizeCardHtml(dirty);
    expect(clean).toBe("<b>ok</b>link");
  });

  it("mantém caixas com estilo permitido e descarta estilo perigoso", () => {
    const html = `<div style="background:#eef4ff; padding:8px; position:fixed; background-image:url(x)">F = m·a</div>`;
    const clean = sanitizeCardHtml(html);
    expect(clean).toContain("background:#eef4ff");
    expect(clean).toContain("padding:8px");
    expect(clean).not.toContain("position");
    expect(clean).not.toContain("url(");
  });

  it("toPlainText tira todo HTML", () => {
    expect(toPlainText("<b>I</b> <i>run</i>")).toBe("I run");
  });
});

describe("proteção contra SSRF", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.2.3.4", true],
    ["172.20.0.1", true],
    ["192.168.0.10", true],
    ["169.254.169.254", true],
    ["::1", true],
    ["::ffff:127.0.0.1", true],
    ["fd00::1", true],
    ["8.8.8.8", false],
    ["2606:4700:4700::1111", false],
  ])("%s é privado? %s", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  it("bloqueia localhost, IPs internos e esquemas estranhos", async () => {
    await expect(assertPublicUrl("http://127.0.0.1:8765")).rejects.toBeInstanceOf(ApiError);
    await expect(assertPublicUrl("http://[::1]/")).rejects.toBeInstanceOf(ApiError);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(ApiError);
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(ApiError);
    await expect(assertPublicUrl("http://user:pass@8.8.8.8/")).rejects.toBeInstanceOf(ApiError);
  });

  it("aceita IP público", async () => {
    await expect(assertPublicUrl("8.8.8.8/dns")).resolves.toBeInstanceOf(URL);
  });
});

describe("rate limit", () => {
  it("bloqueia depois do limite e libera quando a janela passa", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("ip", 3, 60_000, now);
    expect(() => checkRateLimit("ip", 3, 60_000, now)).toThrow(/Muitas requisições/);
    expect(() => checkRateLimit("ip", 3, 60_000, now + 60_001)).not.toThrow();
  });
});
