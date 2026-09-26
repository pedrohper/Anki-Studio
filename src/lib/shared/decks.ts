/**
 * Árvore de baralhos do Anki. "ESAMC::Exatas::Cálculo II" tem como baralho
 * principal "ESAMC"; cada baralho principal vira uma aba, e os sub-baralhos
 * viram destinos dentro dela.
 */

export interface DeckGroup {
  root: string;
  /** Sub-baralhos completos (ex.: "ESAMC::Exatas"), em ordem. */
  subdecks: string[];
}

const IGNORED = new Set(["Default", "Padrão", "Predefinido"]);

export function rootOf(deck: string): string {
  return deck.split("::")[0]?.trim() ?? deck;
}

export function groupDecks(deckNames: string[]): DeckGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const name of deckNames) {
    const root = rootOf(name);
    if (!root || IGNORED.has(root)) continue;
    if (!groups.has(root)) groups.set(root, new Set());
    if (name !== root) groups.get(root)?.add(name);
  }
  return [...groups.entries()]
    .map(([root, subs]) => ({ root, subdecks: [...subs].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.root.localeCompare(b.root));
}

/** "ESAMC::Exatas::Cálculo II" -> "Exatas › Cálculo II" (sem o principal). */
export function subdeckLabel(deck: string): string {
  return deck.split("::").slice(1).join(" › ") || deck;
}

/** O baralho pertence a esta aba (é o principal ou um sub-baralho dele)? */
export function belongsTo(deck: string, root: string): boolean {
  return deck === root || deck.startsWith(`${root}::`);
}
