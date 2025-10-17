// src/components/ForwardLidarFOV.jsx
import { useMemo, useEffect } from 'react';
import { LayerGroup, Polygon, CircleMarker, Popup } from 'react-leaflet';
import { destinationPoint, bearingBetween, haversineDistance, angleDelta } from '../utils/geo';

/**
 * props:
 *  - robot: { lat, lng, headingDeg }  // heading robot (0-360, 0 = utara)
 *  - objects: Array<{ id, lat, lng, label? }>
 *  - fovDeg?: number   // default 120
 *  - maxRange?: number // meter, default 100
 *  - warnRange?: number // kuning, default 40
 *  - dangerRange?: number // merah, default 15
 *  - onDetect?(list)   // callback ketika ada deteksi di dalam sektor
 */
export default function ForwardLidarFOV({
  robot,
  objects = [],
  fovDeg = 120,
  maxRange = 100,
  warnRange = 40,
  dangerRange = 15,
  onDetect,
}) {
  const half = fovDeg / 2;

  // Buat polygon sektor (garis melengkung) dengan sampling tiap 4°
  const sectorPoly = useMemo(() => {
    if (!robot) return null;
    const pts = [{ lat: robot.lat, lng: robot.lng }]; // vertex di posisi robot
    for (let a = -half; a <= half; a += 4) {
      const brg = (robot.headingDeg + a + 360) % 360;
      pts.push(destinationPoint(robot, brg, maxRange));
    }
    pts.push({ lat: robot.lat, lng: robot.lng });
    return pts;
  }, [robot, half, maxRange]);

  // Filter objek yang berada di arah depan (±half) dan dalam jarak maxRange
  const detections = useMemo(() => {
    if (!robot) return [];
    return objects
      .map(o => {
        const d = haversineDistance(robot, o);
        const brg = bearingBetween(robot, o);
        const ad = Math.abs(angleDelta(brg, robot.headingDeg));
        return { ...o, distance: d, bearing: brg, angleDiff: ad };
      })
      .filter(o => o.distance <= maxRange && o.angleDiff <= half)
      .sort((a,b) => a.distance - b.distance);
  }, [objects, robot, half, maxRange]);

  useEffect(() => {
    onDetect?.(detections);
  }, [detections, onDetect]);

  if (!robot) return null;

  // warna sektor: hijau normal, kuning/merah bila ada deteksi dekat
  const nearest = detections[0];
  let fill = 'rgba(34,197,94,0.15)'; // green-500/15
  let stroke = '#22c55e';
  if (nearest?.distance <= warnRange) { fill = 'rgba(250,204,21,0.18)'; stroke = '#f59e0b'; } // yellow
  if (nearest?.distance <= dangerRange) { fill = 'rgba(239,68,68,0.20)'; stroke = '#ef4444'; } // red

  return (
    <LayerGroup>
      {/* sektor FOV */}
      {sectorPoly && (
        <Polygon
          positions={sectorPoly}
          pathOptions={{ color: stroke, weight: 2, fillColor: fill, fillOpacity: 0.6 }}
        />
      )}

      {/* titik deteksi di dalam sektor */}
      {detections.map(o => (
        <CircleMarker
          key={o.id}
          center={{ lat: o.lat, lng: o.lng }}
          radius={6}
          pathOptions={{
            color: o.distance <= dangerRange ? '#ef4444'
                 : o.distance <= warnRange ? '#f59e0b' : '#22c55e',
            weight: 2,
            fillOpacity: 0.9
          }}
        >
          <Popup>
            <div style={{fontSize:'12px'}}>
              <b>{o.label ?? o.id}</b><br/>
              Jarak: {o.distance.toFixed(1)} m<br/>
              Sudut: {o.angleDiff.toFixed(1)}°
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}