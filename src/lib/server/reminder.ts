import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush, { type PushSubscription } from "web-push";
import { z } from "zod";
import { groupDecks } from "@/lib/shared/decks";
import { studyStreak, sumDue, toIsoDay } from "@/lib/shared/stats";
import { dataDir } from "./access-store";
import { getEnv } from "./env";

/**
 * Lembrete diário no celular (Web Push). O PC de casa guarda quem pediu o
 * lembrete, olha o Anki no horário escolhido e manda uma notificação do tipo
 * "Faltam 42 cards, não quebre sua sequência de 12 dias 🔥".
 *
 * As chaves VAPID (que assinam as notificações) são criadas na primeira vez e
 * ficam em data/lembrete.json, junto com os aparelhos inscritos.
 */

const subscriptionSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});
export { subscriptionSchema };

const fileSchema = z.object({
  vapid: z.object({ publicKey: z.string(), privateKey: z.string() }).nullable().default(null),
  enabled: z.boolean().default(true),
  /** Horário do lembrete, na hora do PC ("HH:MM"). */
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("19:00"),
  lastSentDay: z.string().default(""),
  devices: z
    .array(z.object({ subscription: subscriptionSchema, label: z.string().default(""), createdAt: z.string() }))
    .default([]),
});
export type ReminderFile = z.infer<typeof fileSchema>;

const filePath = () => path.join(dataDir(), "lembrete.json");

export function readReminder(): ReminderFile {
  try {
    return fileSchema.parse(JSON.parse(readFileSync(filePath(), "utf8")));
  } catch {
    return fileSchema.parse({});
  }
}

function writeReminder(next: ReminderFile) {
  mkdirSync(dataDir(), { recursive: true });
  const temp = `${filePath()}.tmp`;
  writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(temp, filePath());
}

export function updateReminder(patch: Partial<ReminderFile>): ReminderFile {
  const next = fileSchema.parse({ ...readReminder(), ...patch });
  writeReminder(next);
  return next;
}

/** Chave pública para o navegador se inscrever (cria as chaves na primeira vez). */
export function vapidPublicKey(): string {
  const current = readReminder();
  if (current.vapid) return current.vapid.publicKey;
  const keys = webpush.generateVAPIDKeys();
  updateReminder({ vapid: keys });
  return keys.publicKey;
}

export function addDevice(subscription: PushSubscription, label: string) {
  const current = readReminder();
  const devices = current.devices.filter((device) => device.subscription.endpoint !== subscription.endpoint);
  devices.push({ subscription: subscriptionSchema.parse(subscription), label, createdAt: new Date().toISOString() });
  updateReminder({ devices });
}

export function removeDevice(endpoint: string) {
  const current = readReminder();
  updateReminder({ devices: current.devices.filter((device) => device.subscription.endpoint !== endpoint) });
}

// ---------- mensagem ----------

export interface AnkiSnapshot {
  due: number;
  reviewedToday: number;
  streak: number;
}

export interface ReminderMessage {
  title: string;
  body: string;
}

/** Monta o texto da notificação. null = nada a lembrar (dia já zerado). */
export function buildReminderMessage(snapshot: AnkiSnapshot | null): ReminderMessage | null {
  if (!snapshot) {
    return { title: "Hora de revisar 📚", body: "Abra o Anki e faça as revisões de hoje." };
  }
  const { due, reviewedToday, streak } = snapshot;
  if (due === 0) return null;
  const cards = `${due} ${due === 1 ? "card" : "cards"}`;
  if (reviewedToday > 0) {
    return { title: `Faltam ${cards} para zerar o dia ✅`, body: "Você já começou, termine as revisões de hoje." };
  }
  if (streak > 0) {
    return {
      title: `Não quebre sua sequência de ${streak} ${streak === 1 ? "dia" : "dias"} 🔥`,
      body: `${cards} esperando por você hoje no Anki.`,
    };
  }
  return { title: `${cards} para revisar hoje 📚`, body: "Uns minutinhos agora e o dia fica marcado na sua semana." };
}

/** Lê do Anki do PC quantos cards faltam hoje e a sequência. null = Anki fechado. */
export async function readAnkiSnapshot(): Promise<AnkiSnapshot | null> {
  const url = getEnv().ANKI_CONNECT_URL;
  const call = async <T>(action: string, params?: Record<string, unknown>): Promise<T> => {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ action, version: 6, params }),
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await response.json()) as { result: T; error: string | null };
    if (data.error) throw new Error(data.error);
    return data.result;
  };
  try {
    const decks = await call<string[]>("deckNames");
    const roots = groupDecks(decks).map((group) => group.root);
    const stats = await call<Record<string, { new_count: number; learn_count: number; review_count: number }>>(
      "getDeckStats",
      { decks: roots },
    );
    const byDay = (await call<Array<[string, number]>>("getNumCardsReviewedByDay")).map(([date, count]) => ({
      date,
      count,
    }));
    const today = toIsoDay(new Date());
    return {
      due: sumDue(
        Object.values(stats).map((stat) => ({
          newCount: stat.new_count,
          learnCount: stat.learn_count,
          reviewCount: stat.review_count,
        })),
      ).total,
      reviewedToday: byDay.find((day) => day.date === today)?.count ?? 0,
      streak: studyStreak(byDay),
    };
  } catch {
    return null;
  }
}

// ---------- envio ----------

/** Manda para todos os aparelhos inscritos. Aparelhos que saíram (410/404) são removidos. */
export async function sendReminder(message: ReminderMessage): Promise<{ sent: number; removed: number }> {
  const current = readReminder();
  if (!current.vapid || current.devices.length === 0) return { sent: 0, removed: 0 };
  webpush.setVapidDetails(
    "https://github.com/pedrohper/Anki-Studio",
    current.vapid.publicKey,
    current.vapid.privateKey,
  );
  const payload = JSON.stringify({ ...message, url: "/" });
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    current.devices.map(async ({ subscription }) => {
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 * 6 });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(subscription.endpoint);
      }
    }),
  );
  if (gone.length) {
    updateReminder({
      devices: readReminder().devices.filter((device) => !gone.includes(device.subscription.endpoint)),
    });
  }
  return { sent, removed: gone.length };
}

/** Confere a cada minuto se chegou o horário do lembrete de hoje. */
export async function reminderTick(now = new Date()) {
  const current = readReminder();
  if (!current.enabled || current.devices.length === 0) return;
  const today = toIsoDay(now);
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (current.lastSentDay === today || hhmm < current.time) return;
  updateReminder({ lastSentDay: today });
  const message = buildReminderMessage(await readAnkiSnapshot());
  if (message) await sendReminder(message);
}

const store = globalThis as typeof globalThis & { __ankiReminder?: ReturnType<typeof setInterval> };

export function startReminderScheduler() {
  if (store.__ankiReminder) return;
  store.__ankiReminder = setInterval(() => void reminderTick().catch(() => undefined), 60_000);
  store.__ankiReminder.unref?.();
}
