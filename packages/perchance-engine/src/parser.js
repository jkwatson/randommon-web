/**
 * Parses Perchance-style table text into a map of list name → raw item strings.
 *
 * Format:
 *   listName        ← zero-indent = list header
 *     item1         ← indented = item belonging to current list
 *     item2^3       ← weight suffix
 *
 * Returns: Map<string, string[]>  (items include raw weight suffix if present)
 */
export function parse(text) {
  const lists = new Map();
  let current = null;

  for (const raw of text.split('\n')) {
    // Strip trailing whitespace, preserve leading
    const line = raw.trimEnd();
    if (!line || line.trimStart().startsWith('//')) continue;

    const indented = line.startsWith(' ') || line.startsWith('\t');
    const content = line.trimStart();

    if (!indented) {
      // List header — may have an inline definition after the name (ignore for now)
      const name = content.split(/\s/)[0];
      current = name;
      if (!lists.has(name)) lists.set(name, []);
    } else if (current !== null) {
      lists.get(current).push(content);
    }
  }

  return lists;
}
