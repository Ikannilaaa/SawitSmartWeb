// frontend/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ForwardLidarFOV from './components/ForwardLidarFOV';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Sun, Moon, AlertTriangle, Thermometer, Droplets, Leaf } from 'lucide-react';
import ThreeDViewer from './components/ThreeDViewer';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, TimeScale);

const getStatus = (data) => {
  if (!data) return 'nodata';
  const thresholds = { ph: { moderate: [5.5, 7.5] }, moisture: { moderate: [40, 90] } };
  let score = 0;
  if (data.ph < thresholds.ph.moderate[0] || data.ph > thresholds.ph.moderate[1]) score++;
  if (data.moisture < thresholds.moisture.moderate[0]) score++;
  return score >= 1 ? 'critical' : 'optimal';
};

const getStatusColor = (status) => ({ optimal: '#2E7D32', critical: '#D32F2F', nodata: '#6b7280' }[status]);

const MapReady = () => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0);
  }, [map]);
  return null;
};

const FORCE_ROBOT = true;
const FORCED_COORDS = {
  id: 'SawITSmart',
  lat: 0.3845999500559381,
  lng: 115.77952148203585,
};

const hashCode = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
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

const getFertilizerRecommendation = (n, p, k) => {
  const target = { N: [120, 200], P: [20, 40], K: [100, 180] };
  const rec = [];
  const needN = n < target.N[0];
  const highN = n > target.N[1];
  const needP = p < target.P[0];
  const highP = p > target.P[1];
  const needK = k < target.K[0];
  const highK = k > target.K[1];
  if (needN) {
    const dose = Math.max(0.5, Math.round(((target.N[0] - n) / 10) * 10) / 10);
    rec.push(`N rendah → beri ±${dose} kg **Urea**/pohon`);
  } else if (highN) {
    rec.push(`N tinggi → tunda pupuk kaya N, fokus P/K`);
  }
  if (needP) {
    const dose = Math.max(0.2, Math.round(((target.P[0] - p) / 5) * 10) / 10);
    rec.push(`P rendah → beri ±${dose} kg **TSP/SP-36**/pohon`);
  } else if (highP) {
    rec.push(`P tinggi → kurangi fosfat sementara`);
  }
  if (needK) {
    const dose = Math.max(0.5, Math.round(((target.K[0] - k) / 10) * 10) / 10);
    rec.push(`K rendah → beri ±${dose} kg **MOP/KCl**/pohon`);
  } else if (highK) {
    rec.push(`K tinggi → hindari pupuk kalium`);
  }
  if (rec.length === 0) rec.push('Status baik — pertahankan dosis pemeliharaan.');
  return rec;
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
  iconSize: [36, 36],
  iconAnchor: [18, 34],
  popupAnchor: [0, -28],
});

const RADAR_RINGS = [
  { name: 'Inner', radius: 30, color: '#22c55e', fill: '#22c55e' },
  { name: 'Middle', radius: 60, color: '#eab308', fill: '#eab308' },
  { name: 'Outer', radius: 100, color: '#ef4444', fill: '#ef4444' },
];

const RINGS = [
  { name: 'inner', rMin: 20, rMax: 35 },
  { name: 'middle', rMin: 40, rMax: 70 },
  { name: 'outer', rMin: 80, rMax: 120 },
];

const pickRingIndexByStatus = (status) => {
  if (status === 'critical') return 0;
  if (status === 'optimal') return 1;
  return 2;
};

const getPalmAroundRobotMulti = (robot, itemId, ring) => {
  const baseSeed = hashCode(itemId);
  const a = seededRand01(baseSeed) * Math.PI * 2;
  const t = seededRand01(baseSeed ^ 0x9e3779b9);
  const r = ring.rMin + t * (ring.rMax - ring.rMin);
  const dx = Math.cos(a) * r;
  const dy = Math.sin(a) * r;
  const [dLat, dLng] = metersToDeg(robot.lat, dx, dy);
  return { lat: robot.lat + dLat, lng: robot.lng + dLng };
};

const bearingBetween = (a, b) => {
  const d2r = (d) => (d * Math.PI) / 180;
  const r2d = (r) => (r * 180) / Math.PI;
  const φ1 = d2r(a.lat),
    φ2 = d2r(b.lat);
  const Δλ = d2r(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (r2d(Math.atan2(y, x)) + 360) % 360;
};

const robotIcon = new Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/18355/18355220.png',
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});

export default function App() {
  const [plantationData, setPlantationData] = useState(new Map());
  const [connectionStatus, setConnectionStatus] = useState('Menyambungkan...');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [robotPosition, setRobotPosition] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

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
      if (type === 'initial') {
        setPlantationData(new Map(payload.map((item) => [item.id, item])));
      }
      if (type === 'update') {
        handleDataUpdate(payload);
      }
      if (type === 'robot_position') {
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

  const dataArray = Array.from(plantationData.values());

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-dark-primary">
      <Header connectionStatus={connectionStatus} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
          <KPIs data={dataArray} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="rounded-lg shadow-md overflow-hidden relative h-[500px]">
                <MapComponent data={dataArray} robot={robotPosition} />
              </div>
              <div className="rounded-lg shadow-md overflow-hidden">
                <ThreeDViewer height={560} modelUrl="/3d-assets/assets/Scene_Morning.glb" hdrUrl="/3d-assets/HDRs/kloppenheim_02_2k.hdr" />
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

const MapComponent = ({ data, robot }) => {
  const center = robot ? [robot.lat, robot.lng] : [1.8243, 102.3442];

  return (
    <MapContainer center={center} zoom={18} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }} className="bg-transparent h-full w-full">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        crossOrigin
      />
      <MapReady />
      {robot &&
        data.map((item) => {
          const status = getStatus(item);
          const ringIdx = pickRingIndexByStatus(status);
          const ring = RINGS[ringIdx];
          const pos = getPalmAroundRobotMulti(robot, item.id, ring);
          const color = getStatusColor(status);
          const recs = getFertilizerRecommendation(item.n, item.p, item.k);
          return (
            <Marker key={item.id} position={[pos.lat, pos.lng]} icon={palmIcon}>
              <Popup>
                <div className="font-sans text-black leading-tight">
                  <strong className="block text-base mb-1">Pohon {item.id}</strong>
                  <div className="text-xs mb-1 opacity-70">
                    Ring: {ring.name} ({Math.round(ring.rMin)}–{Math.round(ring.rMax)} m)
                  </div>
                  <div className="text-sm mb-1">
                    <span className="font-semibold">Status:</span> <span style={{ color }}>{status}</span>
                  </div>
                  <div className="text-xs mb-2">N: {item.n} ppm • P: {item.p} ppm • K: {item.k} ppm</div>
                  <div className="text-sm font-semibold mb-1">🚩 Rekomendasi Pupuk</div>
                  <ul className="text-sm list-disc pl-4">
                    {recs.map((r, i) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: r.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} />
                    ))}
                  </ul>
                </div>
              </Popup>
            </Marker>
          );
        })}
      {robot && (
        <Marker position={[robot.lat, robot.lng]} icon={robotIcon}>
          <Popup>
            <div className="text-black">
              <strong>Robot {robot.id || 'SawITSmart'}</strong>
              <br />
              📍 {robot.lat.toFixed(5)}, {robot.lng.toFixed(5)}
              <br />
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
          onDetect={(hits) => {
            if (hits[0]) console.log('DETEKSI DEPAN:', hits[0].label, hits[0].distance.toFixed(1), 'm');
          }}
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
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: isDarkMode ? '#d1d5db' : '#374151' } },
  },
  scales: {
    x: {
      ticks: { color: isDarkMode ? '#9ca3af' : '#6b7280' },
      grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
    },
    y: {
      ticks: { color: isDarkMode ? '#9ca3af' : '#6b7280' },
      grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
    },
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
  useEffect(() => {
    if (robot) map.panTo([robot.lat, robot.lng]);
  }, [robot, map]);
  return null;
};