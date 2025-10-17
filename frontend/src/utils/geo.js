// src/utils/geo.js
const R = 6371000; // Earth radius (m)
const d2r = (d) => d * Math.PI / 180;
const r2d = (r) => r * 180 / Math.PI;
const norm180 = (a) => ((a + 540) % 360) - 180; // normalize to (-180,180]

export function haversineDistance(a, b) {
  const φ1 = d2r(a.lat), φ2 = d2r(b.lat);
  const Δφ = d2r(b.lat - a.lat);
  const Δλ = d2r(b.lng - a.lng);
  const s = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingBetween(a, b) {
  const φ1 = d2r(a.lat), φ2 = d2r(b.lat);
  const Δλ = d2r(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (r2d(Math.atan2(y, x)) + 360) % 360; // [0,360)
}

export function destinationPoint(from, bearingDeg, distanceM) {
  const δ = distanceM / R;
  const θ = d2r(bearingDeg);
  const φ1 = d2r(from.lat), λ1 = d2r(from.lng);

  const sinφ2 = Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return { lat: r2d(φ2), lng: ((r2d(λ2) + 540) % 360) - 180 };
}

export function angleDelta(a, b) {
  // smallest signed angle difference (deg) between two bearings
  return norm180(a - b);
}