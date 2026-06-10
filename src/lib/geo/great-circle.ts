const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export type LatLon = { lat: number; lon: number };

/** Convert WGS84 lat/lon to a unit vector (Y = north pole). */
export function latLonToUnitVector({ lat, lon }: LatLon): { x: number; y: number; z: number } {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;

  return {
    x: -Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  };
}

function toRad(point: LatLon | undefined | null) {
  if (!point || typeof point.lat !== "number" || typeof point.lon !== "number") {
    throw new Error("Invalid lat/lon point");
  }

  return { lat: point.lat * DEG, lon: point.lon * DEG };
}

/** Spherical linear interpolation along a great-circle arc */
export function greatCircleArc(from: LatLon, to: LatLon, segments = 64): LatLon[] {
  const a = toRad(from);
  const b = toRad(to);

  const sinFromLat = Math.sin(a.lat);
  const cosFromLat = Math.cos(a.lat);
  const sinToLat = Math.sin(b.lat);
  const cosToLat = Math.cos(b.lat);
  const cosDelta = Math.cos(b.lon - a.lon);

  const omega =
    Math.acos(
      Math.min(1, Math.max(-1, sinFromLat * sinToLat + cosFromLat * cosToLat * cosDelta)),
    ) || 0.0001;

  const points: LatLon[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const sinT = Math.sin((1 - t) * omega);
    const sinT2 = Math.sin(t * omega);

    const x = sinT * cosFromLat * Math.cos(a.lon) + sinT2 * cosToLat * Math.cos(b.lon);
    const y = sinT * cosFromLat * Math.sin(a.lon) + sinT2 * cosToLat * Math.sin(b.lon);
    const z = sinT * sinFromLat + sinT2 * sinToLat;

    points.push({
      lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD,
      lon: Math.atan2(y, x) * RAD,
    });
  }

  return points;
}

/** Equirectangular projection for SVG maps */
export function projectEquirectangular(
  { lat, lon }: LatLon,
  width: number,
  height: number,
  padding = 24,
): { x: number; y: number } {
  const w = width - padding * 2;
  const h = height - padding * 2;
  return {
    x: padding + ((lon + 180) / 360) * w,
    y: padding + ((90 - lat) / 180) * h,
  };
}

export function arcToSvgPath(points: LatLon[], width: number, height: number): string {
  if (points.length === 0) return "";

  const projected = points.map((p) => projectEquirectangular(p, width, height));
  const [first, ...rest] = projected;

  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest
    .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ")}`;
}

/** Midpoint along the great-circle arc between two coordinates. */
export function greatCircleMidpoint(from: LatLon, to: LatLon): LatLon {
  const arc = greatCircleArc(from, to, 2);
  return arc[1] ?? from;
}

/** Convert a unit sphere vector back to WGS84 lat/lon. */
export function unitVectorToLatLon({ x, y, z }: { x: number; y: number; z: number }): LatLon {
  const phi = Math.acos(Math.min(1, Math.max(-1, y)));
  const lat = 90 - phi * RAD;
  const theta = Math.atan2(z, -x);
  const lon = ((theta * RAD - 180 + 540) % 360) - 180;
  return { lat, lon };
}

/** Interpolate between two coordinates along their great-circle arc (t ∈ [0, 1]). */
export function interpolateAlongGreatCircle(from: LatLon, to: LatLon, t: number): LatLon {
  const a = latLonToUnitVector(from);
  const b = latLonToUnitVector(to);
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);

  if (omega < 1e-6) return from;

  const progress = Math.min(1, Math.max(0, t));
  const sinOmega = Math.sin(omega);
  const w0 = Math.sin((1 - progress) * omega) / sinOmega;
  const w1 = Math.sin(progress * omega) / sinOmega;

  return unitVectorToLatLon({
    x: w0 * a.x + w1 * b.x,
    y: w0 * a.y + w1 * b.y,
    z: w0 * a.z + w1 * b.z,
  });
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
