"""Converte o banco da versão antiga (Python/Tkinter) em um backup do Anki Studio.

Uso:  python scripts/migrar-do-python.py [data/known_words.db] [data/backup-app-antigo.json]
Depois importe o JSON em Configurações -> Backup -> Importar backup.
"""

import hashlib
import json
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone


def iso(value):
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            parsed = datetime.strptime(str(value), fmt).replace(tzinfo=timezone.utc)
            return parsed.isoformat().replace("+00:00", "Z")
        except (TypeError, ValueError):
            pass
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main(db_path="data/known_words.db", out_path="data/backup-app-antigo.json"):
    conn = sqlite3.connect(db_path)
    tables = {row[0] for row in conn.execute("select name from sqlite_master where type='table'")}

    words = sorted({w.strip().lower() for (w,) in conn.execute("select word from known_words") if w and w.strip()})

    contexts = []
    if "study_contexts" in tables:
        for title, content, added in conn.execute("select title, content, added_at from study_contexts"):
            normalized = re.sub(r"\s+", " ", content).strip()
            contexts.append({
                "id": str(uuid.uuid4()),
                "tabId": "estudo-geral",
                "title": title,
                "content": content,
                "fingerprint": hashlib.sha256(normalized.encode()).hexdigest(),
                "createdAt": iso(added),
            })

    history = []
    for word, sentence, meaning, created in conn.execute(
        "select target_word, sentence, meaning, created_at from card_history"
    ):
        english = bool(re.fullmatch(r"[a-z' -]{1,40}", word or ""))
        history.append({
            "id": str(uuid.uuid4()),
            "tabId": "ingles-i1" if english else "estudo-geral",
            "tabName": "Inglês i+1" if english else "Estudo geral",
            "deckName": "Inglês" if english else "",
            "subject": word or "",
            "type": "basic",
            "front": sentence or "-",
            "back": meaning or "",
            "destination": "legacy",
            "createdAt": iso(created),
        })

    backup = {
        "kind": "anki-studio/backup",
        "version": 1,
        "exportedAt": iso(None),
        "tabs": [],
        "contexts": contexts,
        "history": history,
        "knownWords": words,
    }
    with open(out_path, "w", encoding="utf-8") as file:
        json.dump(backup, file, ensure_ascii=False)
    print(f"{len(words)} palavras, {len(contexts)} materiais e {len(history)} cards salvos em {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
