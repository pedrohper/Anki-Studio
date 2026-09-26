import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { clozeNumbers } from "@/lib/shared/cloze";
import { stripHtml } from "@/lib/shared/text";

/**
 * Gera um arquivo .apkg (formato de pacote do Anki) sem depender do Anki:
 * um zip com um banco SQLite `collection.anki2` e um mapa de mídias.
 * O layout segue o esquema clássico (versão 11), o mesmo que o genanki usa,
 * e o Anki atual importa sem problemas.
 */

export interface ApkgCard {
  type: "basic" | "cloze";
  front: string;
  back: string;
  tags: string[];
}

export interface ApkgMedia {
  filename: string;
  data: Uint8Array;
}

const BASIC_MODEL_ID = 1_727_300_000_001;
const CLOZE_MODEL_ID = 1_727_300_000_002;

const CARD_CSS = `.card { font-family: "Segoe UI", Inter, Arial, sans-serif; font-size: 18px; line-height: 1.5; text-align: left; color: #1f2328; background: #ffffff; max-width: 680px; margin: 0 auto; padding: 8px; }
.nightMode.card, .night_mode .card { color: #e6edf3; background: #0d1117; }
b, strong { color: #1d4ed8; }
.nightMode b, .night_mode b { color: #7aa2f7; }
pre { background: #f6f8fa; padding: 10px; border-radius: 6px; overflow-x: auto; }
.nightMode pre { background: #161b22; }
code { font-family: "JetBrains Mono", Consolas, monospace; font-size: 0.9em; }
.cloze { font-weight: bold; color: #2563eb; }`;

const LATEX_PRE =
  "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n";

function field(name: string, ord: number) {
  return { name, ord, font: "Arial", media: [], rtl: false, size: 20, sticky: false };
}

function buildModels(deckId: number, mod: number) {
  const common = {
    css: CARD_CSS,
    did: deckId,
    latexPost: "\\end{document}",
    latexPre: LATEX_PRE,
    latexsvg: false,
    mod,
    tags: [],
    usn: -1,
    vers: [],
  };
  return {
    [BASIC_MODEL_ID]: {
      ...common,
      id: String(BASIC_MODEL_ID),
      name: "Anki Studio · Básico",
      type: 0,
      sortf: 0,
      req: [[0, "any", [0]]],
      flds: [field("Front", 0), field("Back", 1)],
      tmpls: [
        {
          name: "Card 1",
          ord: 0,
          qfmt: "{{Front}}",
          afmt: '{{FrontSide}}<hr id="answer">{{Back}}',
          bqfmt: "",
          bafmt: "",
          bfont: "",
          bsize: 0,
          did: null,
        },
      ],
    },
    [CLOZE_MODEL_ID]: {
      ...common,
      id: String(CLOZE_MODEL_ID),
      name: "Anki Studio · Lacunas",
      type: 1,
      sortf: 0,
      req: [[0, "any", [0]]],
      flds: [field("Text", 0), field("Back Extra", 1)],
      tmpls: [
        {
          name: "Cloze",
          ord: 0,
          qfmt: "{{cloze:Text}}",
          afmt: "{{cloze:Text}}<br>{{Back Extra}}",
          bqfmt: "",
          bafmt: "",
          bfont: "",
          bsize: 0,
          did: null,
        },
      ],
    },
  };
}

function deck(id: number, name: string, mod: number) {
  return {
    collapsed: false,
    conf: 1,
    desc: "",
    dyn: 0,
    extendNew: 10,
    extendRev: 50,
    id,
    mod,
    name,
    usn: -1,
    lrnToday: [0, 0],
    newToday: [0, 0],
    revToday: [0, 0],
    timeToday: [0, 0],
  };
}

const DECK_CONF = {
  1: {
    autoplay: true,
    id: 1,
    maxTaken: 60,
    mod: 0,
    name: "Default",
    replayq: true,
    timer: 0,
    usn: 0,
    lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
    new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
    rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 },
  },
};

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

let sqlPromise: Promise<SqlJsStatic> | undefined;
function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= readFile(path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm")).then((wasm) =>
    initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer }),
  );
  return sqlPromise;
}

const sha1 = (value: string) => createHash("sha1").update(value).digest("hex");

/** ID estável do baralho a partir do nome: reimportar atualiza em vez de duplicar. */
export function deckIdFor(name: string): number {
  return (Number.parseInt(sha1(`deck:${name}`).slice(0, 12), 16) % 9_000_000_000_000) + 1_000_000_000_000;
}

/** GUID estável por baralho + frente: o Anki reconhece a mesma nota ao reimportar. */
export function guidFor(deckName: string, front: string): string {
  return createHash("sha256").update(`${deckName}\u0000${front}`).digest("base64").slice(0, 10);
}

export function checksum(firstField: string): number {
  return Number.parseInt(sha1(stripHtml(firstField)).slice(0, 8), 16);
}

export async function buildApkg(deckName: string, cards: ApkgCard[], media: ApkgMedia[] = []): Promise<Uint8Array> {
  const SQL = await loadSql();
  const db = new SQL.Database();
  try {
    db.run(SCHEMA);

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const deckId = deckIdFor(deckName);

    const conf = {
      activeDecks: [1],
      addToCur: true,
      collapseTime: 1200,
      curDeck: 1,
      curModel: String(BASIC_MODEL_ID),
      dueCounts: true,
      estTimes: true,
      newBury: true,
      newSpread: 0,
      nextPos: 1,
      sortBackwards: false,
      sortType: "noteFld",
      timeLim: 0,
    };
    const decks = { 1: deck(1, "Default", nowSec), [deckId]: deck(deckId, deckName, nowSec) };

    db.run("INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')", [
      nowSec - 86_400,
      nowMs,
      nowMs,
      JSON.stringify(conf),
      JSON.stringify(buildModels(deckId, nowSec)),
      JSON.stringify(decks),
      JSON.stringify(DECK_CONF),
    ]);

    const insertNote = db.prepare("INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')");
    const insertCard = db.prepare("INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')");

    let noteId = nowMs;
    let cardId = nowMs;
    let due = 1;
    for (const card of cards) {
      noteId += 1;
      const isCloze = card.type === "cloze";
      const ords = isCloze ? clozeNumbers(card.front).map((n) => n - 1) : [0];
      if (ords.length === 0) continue;

      const tags = card.tags.length ? ` ${card.tags.join(" ")} ` : "";
      insertNote.run([
        noteId,
        guidFor(deckName, card.front),
        isCloze ? CLOZE_MODEL_ID : BASIC_MODEL_ID,
        nowSec,
        tags,
        `${card.front}\u001f${card.back}`,
        stripHtml(card.front),
        checksum(card.front),
      ]);
      for (const ord of ords) {
        cardId += 1;
        insertCard.run([cardId, noteId, deckId, ord, nowSec, due]);
      }
      due += 1;
    }
    insertNote.free();
    insertCard.free();

    const collection = db.export();
    const files: Record<string, Uint8Array> = { "collection.anki2": collection };
    const mediaMap: Record<string, string> = {};
    media.forEach((item, index) => {
      files[String(index)] = item.data;
      mediaMap[String(index)] = item.filename;
    });
    files.media = new TextEncoder().encode(JSON.stringify(mediaMap));
    return zipSync(files, { level: 6 });
  } finally {
    db.close();
  }
}
