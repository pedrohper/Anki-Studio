import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: Array<{ endpoint: string; payload: string }> = [];
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }),
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (subscription: { endpoint: string }, payload: string) => {
      if (subscription.endpoint.includes("saiu")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: subscription.endpoint, payload });
    }),
  },
}));

const { addDevice, buildReminderMessage, readReminder, reminderTick, updateReminder, vapidPublicKey } = await import(
  "@/lib/server/reminder"
);

const subscription = (endpoint: string) => ({ endpoint, keys: { p256dh: "p", auth: "a" } });

describe("lembrete diário", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "anki-reminder-"));
    process.env.ANKI_STUDIO_DATA_DIR = dir;
    // AnkiConnect "fechado": o lembrete vira a mensagem genérica.
    process.env.ANKI_CONNECT_URL = "http://127.0.0.1:9";
    sent.length = 0;
  });
  afterEach(() => {
    delete process.env.ANKI_STUDIO_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("escreve a mensagem certa para cada situação", () => {
    expect(buildReminderMessage({ due: 42, reviewedToday: 0, streak: 12 })?.title).toBe(
      "Não quebre sua sequência de 12 dias 🔥",
    );
    expect(buildReminderMessage({ due: 42, reviewedToday: 0, streak: 12 })?.body).toContain("42 cards");
    expect(buildReminderMessage({ due: 1, reviewedToday: 30, streak: 3 })?.title).toBe(
      "Faltam 1 card para zerar o dia ✅",
    );
    expect(buildReminderMessage({ due: 5, reviewedToday: 0, streak: 0 })?.title).toContain("5 cards");
    expect(buildReminderMessage({ due: 0, reviewedToday: 80, streak: 9 })).toBeNull();
    expect(buildReminderMessage(null)?.title).toBe("Hora de revisar 📚");
  });

  it("cria as chaves uma vez só", () => {
    expect(vapidPublicKey()).toBe("pub");
    expect(readReminder().vapid).toEqual({ publicKey: "pub", privateKey: "priv" });
  });

  it("manda uma vez por dia, só depois do horário, e tira aparelhos que saíram", async () => {
    vapidPublicKey();
    updateReminder({ time: "19:00" });
    addDevice(subscription("https://push.example/celular"), "Android · Chrome");
    addDevice(subscription("https://push.example/saiu"), "Antigo");

    await reminderTick(new Date(2026, 8, 27, 18, 59));
    expect(sent).toHaveLength(0);

    await reminderTick(new Date(2026, 8, 27, 19, 0));
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]?.payload ?? "{}").title).toBe("Hora de revisar 📚");
    expect(readReminder().devices.map((device) => device.label)).toEqual(["Android · Chrome"]);

    await reminderTick(new Date(2026, 8, 27, 21, 0));
    expect(sent).toHaveLength(1);
    await reminderTick(new Date(2026, 8, 28, 19, 5));
    expect(sent).toHaveLength(2);
  });

  it("desligado não manda nada", async () => {
    vapidPublicKey();
    addDevice(subscription("https://push.example/celular"), "x");
    updateReminder({ enabled: false });
    await reminderTick(new Date(2026, 8, 27, 20, 0));
    expect(sent).toHaveLength(0);
  });
});
