// Weather backdrop. setSky sets <html data-sky data-night>; styles.css then tints the paper and prints a still texture
// for the weather (rings for a clear day, halftone dots for cloud, hatching for rain, stipple for snow) on #sky.
// Nothing is animated: the page only changes when the weather or day/night does, which suits an always-on tablet.
const root = document.documentElement;

export function setSky(kind, isDay) {
  if (root.dataset.sky !== kind) root.dataset.sky = kind;
  root.toggleAttribute('data-night', !isDay);
}

// Kept for callers from the animated version: a still texture needs no redraw after a theme change.
export function redrawSky() {}
