// Puts a module's maps into its markdown: the overview under "## Dungeon Map"
// (before "## Rooms") and a minimap after each "### Room N" heading. Any
// maps already present are replaced, so this also re-maps old modules.

import { svgToEmbed, renderSvgMap, renderMiniMap } from './render-map.js';
import { moduleMaps } from '../dungeon/src/maps/module-maps.js';

const EMBED = /<img src="data:image\/svg\+xml;base64,[^"]*" alt="([^"]*)"[^>]*>/g;

export function injectMaps(markdown, { rooms, map }, { classic = false } = {}) {
  // A finished module's maps show what is there, not the design's one-way arrows.
  const maps = classic ? null : moduleMaps({ rooms, map }, { flow: false });
  const overview = classic ? renderSvgMap(map, rooms) : maps.overview();
  const roomMap = num => (classic ? renderMiniMap(num, map, rooms) : maps.room(num));

  // Drop maps from an earlier run.
  let out = markdown
    .replace(/^## Dungeon Map\n+(?:<img[^\n]*\n+)?/m, '')
    .replace(EMBED, (m, alt) => (alt === 'Dungeon Map' || /^Room \d+ exits$/.test(alt) ? '' : m))
    .replace(/(^### Room \d+\b[^\n]*\n)\n{2,}/gm, '$1\n');

  if (overview) {
    const block = `## Dungeon Map\n\n${svgToEmbed(overview, 'Dungeon Map')}\n\n`;
    // Before the rooms: "## Rooms", or the first "## Section" when rooms are grouped by zone.
    const rooms = /^## (Rooms|Section)\b/m;
    out = rooms.test(out) ? out.replace(rooms, m => `${block}${m}`) : `${out}\n\n${block}`;
  }
  return out.replace(/^(### Room (\d+)\b[^\n]*)\n/gm, (match, heading, num) => {
    const svg = roomMap(parseInt(num, 10));
    return svg ? `${heading}\n\n${svgToEmbed(svg, `Room ${num} exits`)}\n\n` : match;
  });
}
