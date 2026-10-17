export const CONCEPTS = {
  mitti:   { name: 'Mitti Almanac',      tagline: 'Terracotta, clay & olive — an editorial farm almanac', fonts: 'Fraunces · Work Sans · Inter', layout: 'Dark-soil sidebar + ruled almanac pages' },
  haryali: { name: 'Haryali Canopy',     tagline: 'Chlorophyll greens — satellite mission control for crops', fonts: 'Space Grotesk · IBM Plex Sans · Plus Jakarta Sans', layout: 'Icon rail + command top-bar, glass panels on contour lines' },
  sarson:  { name: 'Sarson Sunrise',     tagline: 'Mustard fields & aubergine — warm, friendly, village-first', fonts: 'Baloo 2 · Plus Jakarta Sans · Nunito', layout: 'Pill top-nav, rounded chunky cards over rolling field hills' },
} as const;
export type ConceptKey = keyof typeof CONCEPTS;
export type ThemeMode = 'light' | 'dark';
