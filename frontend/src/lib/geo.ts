import type { GeoPolygon, SizeClass } from '@/api/contract';

export function centroid(polygon: GeoPolygon): [number, number] {
  const ring = polygon.coordinates[0] ?? [];
  if (ring.length === 0) return [20.5, 78.0];
  // Exclude closing duplicate vertex if present
  const pts =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  if (pts.length === 0) return [20.5, 78.0];
  let sumLon = 0;
  let sumLat = 0;
  for (const pt of pts) {
    sumLon += pt[0];
    sumLat += pt[1];
  }
  const lat = Math.round((sumLat / pts.length) * 100000) / 100000;
  const lon = Math.round((sumLon / pts.length) * 100000) / 100000;
  return [lat, lon]; // centroid = [lat, lon] per contract
}

export function areaHa(polygon: GeoPolygon): number {
  const ring = polygon.coordinates[0] ?? [];
  if (ring.length < 3) return 0;
  const [lat0] = centroid(polygon);
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);

  const pts = ring.map(([lon, lat]) => ({
    x: lon * 111320 * cosLat0,
    y: lat * 110540,
  }));

  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  const areaM2 = Math.abs(sum) / 2;
  return Math.round((areaM2 / 10000) * 100) / 100;
}

export function sizeClass(ha: number): SizeClass {
  if (ha < 0.1) return 'TOO_SMALL';
  if (ha < 0.5) return 'SMALL';
  return 'ADEQUATE';
}

export function pixelCount10m(ha: number): number {
  return Math.round(ha * 100);
}

export function makeRectangle(
  centerLat: number,
  centerLon: number,
  targetAreaHa: number,
  aspect = 1.5,
  rotationDeg = 0,
): GeoPolygon {
  const areaM2 = targetAreaHa * 10000;
  const heightM = Math.sqrt(areaM2 / aspect);
  const widthM = heightM * aspect;
  const halfW = widthM / 2;
  const halfH = heightM / 2;

  const rad = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  const cornersM: [number, number][] = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ];

  const ring: number[][] = cornersM.map(([dx, dy]) => {
    const rx = dx * cosR - dy * sinR;
    const ry = dx * sinR + dy * cosR;
    const lon = centerLon + rx / (111320 * cosLat);
    const lat = centerLat + ry / 110540;
    return [Math.round(lon * 1000000) / 1000000, Math.round(lat * 1000000) / 1000000];
  });

  // Close ring
  ring.push([ring[0][0], ring[0][1]]);

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}
