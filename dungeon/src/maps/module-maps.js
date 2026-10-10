// One entry point for a module's maps: builds the floor plan once and draws
// the hand-drawn overview plus a cropped minimap for any room. Shared by the
// CLI module pipeline and the web app's module view.

import { buildFloorPlan } from './floorplan.js';
import { renderHandDrawnMap } from './render-handdrawn.js';

// The window a room's minimap shows: the room plus a few squares around it,
// enough to see where its passages go.
export function roomCrop(fp, number, { pad = 3, minW = 12, minH = 9 } = {}) {
  const r = fp.rooms.find(x => x.number === number);
  if (!r) return null;
  let { x, y, w, h } = r.rect;
  x -= pad; y -= pad; w += pad * 2; h += pad * 2;
  if (w < minW) { x -= (minW - w) / 2; w = minW; }
  if (h < minH) { y -= (minH - h) / 2; h = minH; }
  return { x, y, w, h };
}

export function moduleMaps(mod, { unit = 16, roomUnit = 14, interactive = false } = {}) {
  const fp = buildFloorPlan(mod);
  return {
    floorPlan: fp,
    overview: () => renderHandDrawnMap(fp, { unit, interactive }),
    room: number => {
      const crop = roomCrop(fp, number);
      return crop ? renderHandDrawnMap(fp, { unit: roomUnit, crop, highlight: number }) : '';
    },
  };
}
