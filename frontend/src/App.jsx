// frontend/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ForwardLidarFOV from './components/ForwardLidarFOV';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, TimeScale
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Sun, Moon, AlertTriangle, Thermometer, Droplets, Leaf } from 'lucide-react';
import ThreeDViewer from './components/ThreeDViewer';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, TimeScale);

// ---------------- Helpers ----------------
const getStatus = (d) => {
  if (!d) return 'nodata';
  const t = { ph: { moderate: [5.5, 7.5] }, moisture: { moderate: [40, 90] } };
  let s = 0;
  if (d.ph < t.ph.moderate[0] || d.ph > t.ph.moderate[1]) s++;
  if (d.moisture < t.moisture.moderate[0]) s++;
  return s >= 1 ? 'critical' : 'optimal';
};
const getStatusColor = (status) => ({ optimal: '#2E7D32', critical: '#D32F2F', nodata: '#6b7280' }[status]);

const MapReady = () => {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 0); }, [map]);
  return null;
};

const FORCE_ROBOT = true;
const FORCED_COORDS = { id: 'SawITSmart', lat: 0.3845999500559381, lng: 115.77952148203585 };

const hashCode = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const seededRand01 = (seed) => {
  let x = seed + 0x6D2B79F5;
  x = Math.imul(x ^ (x >>> 15), 1 | x);
  x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const metersToDeg = (latDeg, dxMeters, dyMeters) => {
  const latRad = (latDeg * Math.PI) / 180;
  const dLat = dyMeters / 111320;
  const dLng = dxMeters / (111320 * Math.cos(latRad));
  return [dLat, dLng];
};
const bearingBetween = (a, b) => {
  const d2r = (d) => (d * Math.PI) / 180; const r2d = (r) => (r * 180) / Math.PI;
  const φ1 = d2r(a.lat), φ2 = d2r(b.lat), Δλ = d2r(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (r2d(Math.atan2(y, x)) + 360) % 360;
};

const getPalmAroundRobotMulti = (robot, itemId, ring) => {
  const baseSeed = hashCode(itemId);
  const a = seededRand01(baseSeed) * Math.PI * 2;
  const t = seededRand01(baseSeed ^ 0x9e3779b9);
  const r = ring.rMin + t * (ring.rMax - ring.rMin);
  const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
  const [dLat, dLng] = metersToDeg(robot.lat, dx, dy);
  return { lat: robot.lat + dLat, lng: robot.lng + dLng };
};

const palmIcon = new Icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="36" height="36">
      <g fill="#16a34a">
        <path d="M24 4c6 0 11 4 12 9-5-3-9-3-12-3s-7 0-12 3c1-5 6-9 12-9z"/>
        <path d="M9 17c4-3 9-4 15-4s11 1 15 4c-3 3-8 4-15 4s-12-1-15-4z"/>
        <path d="M14 24c3-2 6-3 10-3s7 1 10 3c-2 2-5 3-10 3s-8-1-10-3z"/>
      </g>
      <rect x="22.5" y="24" width="3" height="18" fill="#8b5e3c" rx="1.5"/>
    </svg>`
  )}`,
  iconSize: [36, 36], iconAnchor: [18, 34], popupAnchor: [0, -28],
});
const robotIcon = new Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/18355/18355220.png',
  iconSize: [50, 50], iconAnchor: [25, 25],
});

const RINGS = [
  { name: 'inner', rMin: 20, rMax: 35 },
  { name: 'middle', rMin: 40, rMax: 70 },
  { name: 'outer', rMin: 80, rMax: 120 },
];
const pickRingIndexByStatus = (s) => (s === 'critical' ? 0 : s === 'optimal' ? 1 : 2);

// ---- World frame (pohon diam) ----
const WORLD_ORIGIN = { ...FORCED_COORDS };   // titik (0,0) dunia
const WORLD_SCALE = 10; // 1 unit three.js = 10 meter

const toWorldXZ = (lat, lng) => {
  const latRad = (WORLD_ORIGIN.lat * Math.PI) / 180;
  const mPerDegLng = 111320 * Math.cos(latRad);
  const mPerDegLat = 111320;
  const dxM = (lng - WORLD_ORIGIN.lng) * mPerDegLng;  // +X ke timur
  const dyM = (lat - WORLD_ORIGIN.lat) * mPerDegLat;  // +Y ke utara
  return { x: dxM / WORLD_SCALE, z: -dyM / WORLD_SCALE }; // Z ke selatan
};

const NEAR_SHOW_M = 45;
const NEAR_HIDE_M = 52;

// ---------------- Grid Kebun Sawit ----------------
const GRID_CFG = { rows: 8, cols: 14, rowSpacingM: 30, colSpacingM: 30, jitterM: 0 };
const buildPalmGrid = (origin, headingDeg = 90) => {
  const latRad = (origin.lat * Math.PI) / 180;
  const rightCos = Math.cos((headingDeg * Math.PI) / 180);
  const rightSin = Math.sin((headingDeg * Math.PI) / 180);
  const upCos = Math.cos(((headingDeg + 90) * Math.PI) / 180);
  const upSin = Math.sin(((headingDeg + 90) * Math.PI) / 180);

  const toLatLng = (dxMeters, dyMeters) => {
    const dLat = dyMeters / 111320;
    const dLng = dxMeters / (111320 * Math.cos(latRad));
    return [dLat, dLng];
  };

  const items = [];
  const rowOffset = -(GRID_CFG.rows - 1) / 2;
  for (let r = 0; r < GRID_CFG.rows; r++) {
    for (let c = 0; c < GRID_CFG.cols; c++) {
      const x = c * GRID_CFG.colSpacingM;               // timur
      const y = (rowOffset + r) * GRID_CFG.rowSpacingM; // utara(+)/selatan(-)
      const dx = x * rightCos + y * upCos;
      const dy = x * rightSin + y * upSin;
      const jx = (Math.random() - 0.5) * GRID_CFG.jitterM;
      const jy = (Math.random() - 0.5) * GRID_CFG.jitterM;
      const [dLat, dLng] = toLatLng(dx + jx, dy + jy);
      items.push({
        id: `PLM-${r + 1}-${c + 1}`,
        lat: origin.lat + dLat,
        lng: origin.lng + dLng,
        n: 120, p: 30, k: 130, ph: 6.5, moisture: 55, temperature: 28,
      });
    }
  }
  return items;
};

const FLIP_ORCHARD = true;
const EAST_FIRST = false;

// ===== Pola dua baris dot hijau (lorong di tengah) =====
const DOT_COLS = 5;        // berapa banyak titik sepanjang baris
const DOT_SPACING_M = 30;    // jarak antar pohon sepanjang baris
const ROW_OFFSET_M = 40;     // jarak dari lorong ke masing-masing baris (atas & bawah)
const ORCHARD_HEADING_DEG = 180; // 180 = barat
const ORCHARD_HEADING_APPLIED = (ORCHARD_HEADING_DEG + (FLIP_ORCHARD ? 180 : 0)) % 360; // timur

function buildPalmRowsPattern(origin, headingDeg = ORCHARD_HEADING_APPLIED) {
  const latRad = (origin.lat * Math.PI) / 180;
  const toLatLng = (dx, dy) => {
    const dLat = dy / 111320;
    const dLng = dx / (111320 * Math.cos(latRad));
    return [origin.lat + dLat, origin.lng + dLng];
  };

  // vektor sumbu kanan (arah baris) & atas (arah lintas baris)
  const rightCos = Math.cos((headingDeg * Math.PI) / 180);
  const rightSin = Math.sin((headingDeg * Math.PI) / 180);
  const upCos    = Math.cos(((headingDeg + 90) * Math.PI) / 180);
  const upSin    = Math.sin(((headingDeg + 90) * Math.PI) / 180);

  const items = [];
  // tiga baris: atas, tengah, bawah
  const rowYs = [ +ROW_OFFSET_M, 0, -ROW_OFFSET_M ];

  rowYs.forEach((yRow, rowIdx) => {
    for (let c = 0; c < DOT_COLS; c++) {
      const x = c * DOT_SPACING_M;      // maju ke timur
      const xAdj = rowIdx === 1 ? x + DOT_SPACING_M * 0.5 : x;

      // rotasi ke arah global sesuai heading
      const dx = xAdj * rightCos + yRow * upCos;
      const dy = xAdj * rightSin + yRow * upSin;

      const [lat, lng] = toLatLng(dx, dy);
      items.push({
        id: `PLM-${rowIdx + 1}-${c + 1}`,
        lat, lng,
        n: 120, p: 30, k: 130, ph: 6.5, moisture: 55, temperature: 28,
      });
    }
  });

  return items;
}

// ===== Rute serpentine di lorong tengah (bolak-balik) =====
// function buildSerpentineWaypoints(origin, headingDeg = ORCHARD_HEADING_APPLIED) {
//   const latRad = (origin.lat * Math.PI) / 180;

//   const toLatLng = (dx, dy) => {
//     const dLat = dy / 111320;
//     const dLng = dx / (111320 * Math.cos(latRad));
//     return { lat: origin.lat + dLat, lng: origin.lng + dLng };
//   };

//   // Arah barisan (kanan) & tegak barisan (atas)
//   const rightCos = Math.cos((headingDeg * Math.PI) / 180);
//   const rightSin = Math.sin((headingDeg * Math.PI) / 180);
//   const upCos    = Math.cos(((headingDeg + 90) * Math.PI) / 180);
//   const upSin    = Math.sin(((headingDeg + 90) * Math.PI) / 180);

//   // lorong tengah (Y=0), titik di sepanjang X
//   const xs = Array.from({ length: DOT_COLS }, (_, i) => i * DOT_SPACING_M);
//   const yLane = 0;

//   const p = (x) => {
//     const dx = x * rightCos + yLane * upCos;
//     const dy = x * rightSin + yLane * upSin;
//     return toLatLng(dx, dy);
//   };

//   // tentukan arah timur (lng bertambah)
//   const p0 = p(xs[0]);
//   const pN = p(xs[xs.length - 1]);
//   const eastFirst = pN.lng > p0.lng;
//   const xsEast = eastFirst ? xs : xs.slice().reverse();

//   const forward = xsEast.map(p);                        // ke timur
//   const backward = forward.slice(0, -1).reverse();      // balik lewat titik yang sama
//   return [...forward, ...backward];
// }

// ===== Rute: timur di lorong atas → U-turn → barat di lorong bawah → naik ke titik awal =====
function buildSerpentineWaypoints(origin, headingDeg = ORCHARD_HEADING_APPLIED) {
  const latRad = (origin.lat * Math.PI) / 180;

  const toLatLng = (dxMeters, dyMeters) => {
    const dLat = dyMeters / 111320;
    const dLng = dxMeters / (111320 * Math.cos(latRad));
    return { lat: origin.lat + dLat, lng: origin.lng + dLng };
  };

  const rightCos = Math.cos((headingDeg * Math.PI) / 180);
  const rightSin = Math.sin((headingDeg * Math.PI) / 180);
  const upCos    = Math.cos(((headingDeg + 90) * Math.PI) / 180);
  const upSin    = Math.sin(((headingDeg + 90) * Math.PI) / 180);

  const LANE_OFFSET = ROW_OFFSET_M * 0.6; // jarak dari lorong ke barisan
  const yTop =  +LANE_OFFSET;
  const yBot =  -LANE_OFFSET;

  const xs = Array.from({ length: DOT_COLS }, (_, i) => i * DOT_SPACING_M);

  const pt = (x, y) => {
    const dxM = x * rightCos + y * upCos;
    const dyM = x * rightSin + y * upSin;
    return toLatLng(dxM, dyM);
  };

  // pastikan mulai ke TIMUR di lorong atas
  const eastFirst = pt(xs.at(-1), yTop).lng > pt(xs[0], yTop).lng;
  const xsEast = eastFirst ? xs : xs.slice().reverse();
  const xsWest = xsEast.slice().reverse();

  const eastTop  = xsEast.map((x) => pt(x, yTop));  // timur di atas
  const westBot  = xsWest.map((x) => pt(x, yBot));  // barat di bawah

  // --- Konektor U-turn di ujung timur (turun dari atas ke bawah) ---
  const turnSegs = 10; // semakin besar semakin halus
  const xEastEnd = xsEast.at(-1);
  const downTurn = Array.from({ length: turnSegs }, (_, i) => {
    const t = (i + 1) / turnSegs;                 // 0→1
    const y = yTop + (yBot - yTop) * t;           // turun
    return pt(xEastEnd, y);
  });

  // --- Konektor naik di ujung barat (naik dari bawah ke atas untuk menutup loop) ---
  const xWestEnd = xsWest.at(-1);
  const upTurn = Array.from({ length: turnSegs }, (_, i) => {
    const t = (i + 1) / turnSegs;
    const y = yBot + (yTop - yBot) * t;           // naik
    return pt(xWestEnd, y);
  });

  // urutan lengkap (closed loop)
  return [...eastTop, ...downTurn, ...westBot, ...upTurn];
}

// ---------------- Simulasi Robot ke Timur ----------------
const SIMULATE_RIGHTWARD = false;
const STEP_MS = 200;        // ms
const SPEED_KMH = 10;   // km/h
const SPEED_MPS = SPEED_KMH * 1000 / 3600;
const ROUTE_LEN_M = 1000;    // m

const dummyRobotPath = [
  { x: -5, y: 0, z: 0 },
  { x: -3, y: 0, z: 1 },
  { x:  0, y: 0, z: 0 },
  { x:  3, y: 0, z: -1 },
  { x:  5, y: 0, z: 0 },
  { x:  7, y: 0, z: 1 },
];

const ROBOT_SOURCE = 'sim';

// Bootstrap deteksi awal (agar tidak kosong di awal)
const AUTO_BOOTSTRAP = false;
const BOOT_MAX_RANGE_M = 30;     // jarak bootstrap
const BOOT_FOV_DEG = 120;        // sektor bootstrap (sesuai FOV)

// ---------------- App ----------------
export default function App() {
  const [plantationData, setPlantationData] = useState(new Map());
  const [connectionStatus, setConnectionStatus] = useState('Menyambungkan...');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [robotPosition, setRobotPosition] = useState(null);

  const [gridTrees, setGridTrees] = useState([]);
  const [robotRoute] = useState(dummyRobotPath);

  const [visibleTreeIds, setVisibleTreeIds] = useState(new Set());
  const [detectedTrees3D, setDetectedTrees3D] = useState([]);
  const seenTreeIdsRef = React.useRef(new Set());
  const bootstrappedRef = React.useRef(false);
  const [waypoints, setWaypoints] = useState([]);

  const dataArray = Array.from(plantationData.values());

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Build grid kebun sawit
  useEffect(() => {
    setGridTrees(buildPalmRowsPattern(FORCED_COORDS, ORCHARD_HEADING_APPLIED));
  }, []);

  // WS
  const handleDataUpdate = useCallback((data) => {
    setPlantationData((prev) => new Map(prev).set(data.id, data));
  }, []);
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => setConnectionStatus('Terhubung');
    ws.onclose = () => setConnectionStatus('Terputus');
    ws.onerror = () => setConnectionStatus('Error');
    ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);
      if (type === 'initial') setPlantationData(new Map(payload.map((i) => [i.id, i])));
      if (type === 'update') handleDataUpdate(payload);
      if (type === 'robot_position' && ROBOT_SOURCE === 'ws') {
        const next = FORCE_ROBOT
          ? { ...FORCED_COORDS, timestamp: Date.now(), id: payload?.id || FORCED_COORDS.id }
          : { ...payload, timestamp: Date.now() };
        setRobotPosition((prev) => {
          const headingDeg = prev ? bearingBetween(prev, next) : prev?.headingDeg ?? 0;
          return { ...next, headingDeg };
        });
      }
    };
    return () => ws.close();
  }, [handleDataUpdate]);

  useEffect(() => {
    if (!gridTrees.length) return;
    setWaypoints(buildSerpentineWaypoints(FORCED_COORDS, ORCHARD_HEADING_APPLIED));
  }, [gridTrees.length]);

  useEffect(() => {
    if (ROBOT_SOURCE !== 'sim' || !waypoints.length) return;

    // posisi awal
    let last = { ...FORCED_COORDS };
    setRobotPosition({ ...last, headingDeg: 90, timestamp: Date.now() });

    let seg = 0;
    const it = setInterval(() => {
      const target = waypoints[seg];
      if (!target) return;

      const latRad = (last.lat * Math.PI) / 180;
      const mPerDegLng = 111320 * Math.cos(latRad);
      const mPerDegLat = 111320;

      const dxM = (target.lng - last.lng) * mPerDegLng;
      const dyM = (target.lat - last.lat) * mPerDegLat;
      const dist = Math.hypot(dxM, dyM);
      const stepM = SPEED_MPS * (STEP_MS / 1000);
      const prev = { ...last };

      if (dist <= stepM) {
        // sampai ke waypoint → lanjut
        last = { lat: target.lat, lng: target.lng };
        seg = seg + 1;
        if (seg >= waypoints.length) seg = 0;
        // seg = Math.min(seg + 1, waypoints.length - 1);
      } else {
        const r = stepM / dist;
        last = { lat: last.lat + (target.lat - last.lat) * r,
                lng: last.lng + (target.lng - last.lng) * r };
      }
      const headingDeg = bearingBetween(prev, last);
      // const headingDeg = bearingBetween(robotPosition || last, { lat: last.lat, lng: last.lng });
      setRobotPosition({ ...last, id: FORCED_COORDS.id, headingDeg, timestamp: Date.now() });
    }, STEP_MS);

    return () => clearInterval(it);
  }, [ROBOT_SOURCE, waypoints, SPEED_MPS, STEP_MS]);

  // Simulasi: posisi awal & gerak ke timur
  useEffect(() => {
    if (!SIMULATE_RIGHTWARD) return;
    setRobotPosition((prev) => ({
      ...(prev || {}), ...FORCED_COORDS, headingDeg: 90, timestamp: Date.now(),
    }));
  }, []);
  useEffect(() => {
    if (!SIMULATE_RIGHTWARD) return;
    const start = { ...FORCED_COORDS };
    let traveled = 0;
    const it = setInterval(() => {
      const stepM = SPEED_MPS * (STEP_MS / 1000);
      if (traveled > ROUTE_LEN_M) return;
      traveled += stepM;
      const [dLat, dLng] = metersToDeg(start.lat, stepM, 0); // +x m timur
      setRobotPosition((prev) => ({
        id: start.id,
        lat: (prev?.lat ?? start.lat) + dLat,
        lng: (prev?.lng ?? start.lng) + dLng,
        headingDeg: 90,
        timestamp: Date.now(),
      }));
    }, STEP_MS);
    return () => clearInterval(it);
  }, []);

  // Deteksi ➜ tampil; terlewati ➜ hilang
  const pushTreesFromHits = useCallback((hits, robot) => {
    if (!robot || !hits?.length) return;

    const addIds = [];
    const new3D = [];

    hits.forEach((h) => {
      const id = h.id || h.label;
      if (!id) return;
      addIds.push(id);

      if (!seenTreeIdsRef.current.has(id)) {
        seenTreeIdsRef.current.add(id);
        const obj = gridTrees.find((d) => d.id === id);
        if (obj) {
          const dLat = obj.lat - robot.lat;
          const dLng = obj.lng - robot.lng;
          const latRad = (robot.lat * Math.PI) / 180;
          const dx = dLng * 111320 * Math.cos(latRad);
          const dy = dLat * 111320;
          new3D.push({ id, x: dx / 10, y: 0, z: -dy / 10, __lng: obj.lng });
        }
      }
    });

    if (addIds.length) {
      setVisibleTreeIds((prev) => {
        const s = new Set(prev);
        addIds.forEach((id) => s.add(id));
        return s;
      });
    }
    if (new3D.length) setDetectedTrees3D((prev) => [...prev, ...new3D]);
  }, [gridTrees]);

  // Pohon tampak hanya saat dekat robot, dan hilang saat menjauh
  useEffect(() => {
    if (!robotPosition || !gridTrees.length) return;

    const latRad = (robotPosition.lat * Math.PI) / 180;
    const mPerDegLng = 111320 * Math.cos(latRad);
    const mPerDegLat = 111320;

    const nowVisible = new Set();

    gridTrees.forEach((t) => {
      const dxM = (t.lng - robotPosition.lng) * mPerDegLng;
      const dyM = (t.lat - robotPosition.lat) * mPerDegLat;
      const dist = Math.hypot(dxM, dyM);

      const already = visibleTreeIds.has(t.id);
      const th = already ? NEAR_HIDE_M : NEAR_SHOW_M; // hysteresis anti-flicker
      if (dist <= th) nowVisible.add(t.id);
    });

    setVisibleTreeIds(nowVisible);

    // 3D view
    // const lat0 = (FORCED_COORDS.lat * Math.PI) / 180;
    // const mLng0 = 111320 * Math.cos(lat0), mLat0 = 111320, WORLD_SCALE = 10;
    // setDetectedTrees3D(
    //   gridTrees.filter(t => nowVisible.has(t.id)).map(t => ({
    //     id: t.id,
    //     x: ((t.lng - FORCED_COORDS.lng) * mLng0) / WORLD_SCALE,
    //     y: 0,
    //     z: -((t.lat - FORCED_COORDS.lat) * mLat0) / WORLD_SCALE,
    //   }))
    // );
  }, [robotPosition, gridTrees]);

  // Bootstrap: sekali, ambil pohon di depan robot dalam sektor FOV dan jarak tertentu
  // useEffect(() => {
  //   if (!AUTO_BOOTSTRAP || bootstrappedRef.current) return;
  //   if (!robotPosition || !gridTrees.length) return;

  //   const latRad = (robotPosition.lat * Math.PI) / 180;
  //   const mPerDegLng = 111320 * Math.cos(latRad);
  //   const mPerDegLat = 111320;

  //   const headingDeg = 90; // timur
  //   const halfFov = BOOT_FOV_DEG / 2;

  //   const ahead = [];
  //   gridTrees.forEach((t) => {
  //     const dx = (t.lng - robotPosition.lng) * mPerDegLng; // +X ke timur
  //     const dy = (t.lat - robotPosition.lat) * mPerDegLat; // +Y ke utara
  //     const dist = Math.hypot(dx, dy);
  //     if (dist > BOOT_MAX_RANGE_M) return;
  //     const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = timur
  //     const rel = ((angle - headingDeg + 540) % 360) - 180; // -180..180 relatif heading
  //     if (Math.abs(rel) <= halfFov) ahead.push({ id: t.id, __lng: t.lng, dx, dy });
  //   });

  //   if (!ahead.length) return;

  //   // ambil sebagian biar nggak kebanyakan (mis. 12 terdekat)
  //   ahead.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  //   const pick = ahead.slice(0, 12);

  //   setVisibleTreeIds((prev) => {
  //     const s = new Set(prev);
  //     pick.forEach((p) => s.add(p.id));
  //     return s;
  //   });

  //   setDetectedTrees3D((prev) => [
  //     ...prev,
  //     ...pick.map((p) => ({ id: p.id, x: p.dx / 10, y: 0, z: -p.dy / 10, __lng: p.__lng })),
  //   ]);

  //   pick.forEach((p) => seenTreeIdsRef.current.add(p.id));
  //   bootstrappedRef.current = true;
  // }, [robotPosition, gridTrees]);

  // Pruning: pohon di belakang robot disembunyikan (map & 3D)
  // useEffect(() => {
  //   if (!robotPosition) return;
  //   const latRad = (robotPosition.lat * Math.PI) / 180;
  //   const dLngTrail = TRAIL_WINDOW_M / (111320 * Math.cos(latRad));
  //   const thresholdLng = robotPosition.lng - dLngTrail;

  //   setVisibleTreeIds((prev) => {
  //     const next = new Set(
  //       [...prev].filter((id) => {
  //         const obj = gridTrees.find((d) => d.id === id);
  //         return obj && obj.lng >= thresholdLng; // masih di depan/samping
  //       })
  //     );
  //     return next;
  //   });

  //   setDetectedTrees3D((prev) => prev.filter((t) => (t.__lng ?? robotPosition.lng) >= thresholdLng));
  // }, [robotPosition, gridTrees]);

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-dark-primary">
      <Header connectionStatus={connectionStatus} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
          <KPIs data={dataArray} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="rounded-lg shadow-md overflow-hidden relative h-[500px]">
                <MapComponent
                  data={gridTrees}                             // katalog kebun berbaris
                  robot={robotPosition}
                  visibleTreeIds={visibleTreeIds}              // hanya yang terlihat
                />
              </div>
              <div className="rounded-lg shadow-md overflow-hidden">
                <ThreeDViewer
                  robotPath={robotRoute}
                  detectedTrees={detectedTrees3D}
                  activeTreeIds={[...visibleTreeIds]}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <ChartCard title="Level NPK (ppm)">
                <NPKChart data={dataArray} />
              </ChartCard>
              <ChartCard title="Parameter Tanah">
                <SoilChart data={dataArray} />
              </ChartCard>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------- UI Pieces ----------------
const Header = ({ connectionStatus, isDarkMode, setIsDarkMode }) => {
  const statusColor = { Terhubung: 'bg-green-500', 'Menyambungkan...': 'bg-yellow-500 animate-pulse' }[connectionStatus] || 'bg-red-500';
  return (
    <header className="bg-sawit-green dark:bg-dark-secondary shadow-lg z-20 flex items-center justify-between p-4 text-white">
      <h1 className="text-2xl font-bold">SawITSmart</h1>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className={`h-3 w-3 rounded-full ${statusColor}`} />
          <span>{connectionStatus}</span>
        </div>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full hover:bg-white/20">
          {isDarkMode ? <Sun /> : <Moon />}
        </button>
      </div>
    </header>
  );
};

const KPIs = ({ data }) => {
  if (data.length === 0) return <div className="text-center">Memuat data...</div>;
  const avgPH = data.reduce((acc, item) => acc + item.ph, 0) / data.length;
  const criticalCount = data.filter((d) => getStatus(d) === 'critical').length;
  const avgMoisture = data.reduce((acc, item) => acc + item.moisture, 0) / data.length;
  const avgTemp = data.reduce((acc, item) => acc + item.temperature, 0) / data.length;
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard icon={<Leaf size={24} />} title="Rata-rata pH" value={avgPH.toFixed(2)} />
      <KpiCard icon={<Droplets size={24} />} title="Kelembapan" value={`${avgMoisture.toFixed(1)}%`} />
      <KpiCard icon={<Thermometer size={24} />} title="Suhu" value={`${avgTemp.toFixed(1)}°C`} />
      <KpiCard icon={<AlertTriangle size={24} />} title="Peringatan Kritis" value={criticalCount} color="text-sawit-red" />
    </section>
  );
};

const KpiCard = ({ icon, title, value, color = 'text-sawit-green' }) => (
  <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg shadow-md flex items-center space-x-4">
    <div className={`p-3 rounded-full bg-opacity-20 ${color.replace('text-', 'bg-')}`}>{React.cloneElement(icon, { className: color })}</div>
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  </div>
);

// MapComponent menerima visibleTreeIds
const MapComponent = ({ data, robot, visibleTreeIds, onHits }) => {
  const center = robot ? [robot.lat, robot.lng] : [FORCED_COORDS.lat, FORCED_COORDS.lng];

  return (
    <MapContainer center={center} zoom={19} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }} className="bg-transparent h-full w-full">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
        crossOrigin
      />
      <MapReady />

      {/* Pohon di posisi ABSOLUT, tidak ikut robot */}
      {data
        .filter((item) => visibleTreeIds?.has(item.id))
        .map((item) => {
          const status = getStatus(item);
          const color = getStatusColor(status);
          return (
            <Marker key={item.id} position={[item.lat, item.lng]} icon={palmIcon}>
              <Popup>
                <div className="font-sans text-black leading-tight">
                  <strong className="block text-base mb-1">Pohon {item.id}</strong>
                  <div className="text-sm">
                    <span className="font-semibold">Status:</span>{' '}
                    <span style={{ color }}>{status}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {robot && (
        <Marker position={[robot.lat, robot.lng]} icon={robotIcon}>
          <Popup>
            <div className="text-black">
              <strong>Robot {robot.id || 'SawITSmart'}</strong><br />
              📍 {robot.lat.toFixed(5)}, {robot.lng.toFixed(5)}<br />
              🕒 {new Date(robot.timestamp).toLocaleTimeString()}
            </div>
          </Popup>
        </Marker>
      )}

      {robot && (
        <ForwardLidarFOV
          robot={{ lat: robot.lat, lng: robot.lng, headingDeg: robot.headingDeg ?? 0 }}
          objects={data.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, label: d.id }))}
          fovDeg={120}
          maxRange={100}
          warnRange={40}
          dangerRange={15}
          onDetect={(hits) => hits?.length && onHits?.(hits)}
        />
      )}

      {robot && <RobotFollower robot={robot} />}
    </MapContainer>
  );
};

const ChartCard = ({ title, children }) => (
  <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg shadow-md h-[300px] md:h-[400px] flex flex-col">
    <h3 className="font-semibold mb-2">{title}</h3>
    <div className="flex-1 relative">{children}</div>
  </div>
);

const chartOptions = (isDarkMode) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: isDarkMode ? '#d1d5db' : '#374151' } } },
  scales: {
    x: { ticks: { color: isDarkMode ? '#9ca3af' : '#6b7280' }, grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } },
    y: { ticks: { color: isDarkMode ? '#9ca3af' : '#6b7280' }, grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } },
  },
});

const NPKChart = ({ data }) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const chartData = {
    labels: data.map((d) => d.id),
    datasets: [
      { label: 'N', data: data.map((d) => d.n), backgroundColor: '#A5D6A7' },
      { label: 'P', data: data.map((d) => d.p), backgroundColor: '#64b5f6' },
      { label: 'K', data: data.map((d) => d.k), backgroundColor: '#ffb74d' },
    ],
  };
  return <Bar className="h-full" options={chartOptions(isDarkMode)} data={chartData} />;
};

const SoilChart = ({ data }) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const chartData = {
    labels: data.map((d) => d.id),
    datasets: [
      { label: 'pH', data: data.map((d) => d.ph), borderColor: '#FDD835', backgroundColor: '#FDD835' },
      { label: 'Moisture (%)', data: data.map((d) => d.moisture), borderColor: '#3b82f6', backgroundColor: '#3b82f6' },
    ],
  };
  return <Line className="h-full" options={{ ...chartOptions(isDarkMode), tension: 0.3 }} data={chartData} />;
};

const RobotFollower = ({ robot }) => {
  const map = useMap();
  useEffect(() => { if (robot) map.panTo([robot.lat, robot.lng]); }, [robot, map]);
  return null;
};