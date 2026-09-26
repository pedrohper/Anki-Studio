import type { Tab } from "@/lib/schemas/tab";
import { belongsTo } from "@/lib/shared/decks";

/** A aba que cuida de um baralho (a de baralho mais específico que o contém). */
export function tabForDeck(tabs: Tab[], deckName: string): Tab | undefined {
  const matches = tabs.filter((tab) => belongsTo(deckName, tab.deckName));
  return matches.sort((a, b) => b.deckName.length - a.deckName.length)[0];
}
