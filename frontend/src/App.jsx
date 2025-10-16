// frontend/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
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

const createMarkerIcon = (color) => new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="40px" height="40px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`)}`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
});

const MapReady = () => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0); // paksa hitung ulang ukuran
  }, [map]);
  return null;
};

export default function App() {
  const [plantationData, setPlantationData] = useState(new Map());
  const [connectionStatus, setConnectionStatus] = useState('Menyambungkan...');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [robotPosition, setRobotPosition] = useState(null); //

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const handleDataUpdate = useCallback((data) => {
    setPlantationData(prev => new Map(prev).set(data.id, data));
  }, []);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => setConnectionStatus('Terhubung');
    ws.onclose = () => setConnectionStatus('Terputus');
    ws.onerror = () => setConnectionStatus('Error');

    ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);

      if (type === 'initial') {
        setPlantationData(new Map(payload.map(item => [item.id, item])));
      }
      if (type === 'update') {
        handleDataUpdate(payload);
      }
      if (type === 'robot_position') {
        setRobotPosition(payload); // <-- update posisi robot
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
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[500px]">
                <div className="lg:col-span-2 rounded-lg shadow-md overflow-hidden">
                  <MapComponent data={dataArray} robot={robotPosition} />
                </div>
                <div className="space-y-4">
                  <ChartCard title="Level NPK (ppm)"><NPKChart data={dataArray} /></ChartCard>
                  <ChartCard title="Parameter Tanah"><SoilChart data={dataArray} /></ChartCard>
                </div>
              </div>

              {/* ▼▼▼ 2. TAMBAHKAN SECTION BARU UNTUK 3D VIEWER ▼▼▼ */}
              <section className="bg-white dark:bg-dark-secondary rounded-lg shadow-md h-[500px] flex flex-col p-4">
                <h3 className="font-semibold mb-2 text-lg">Visualisasi 3D Perkebunan</h3>
                <div className="flex-1 relative rounded-lg overflow-hidden">
                    <ThreeDViewer />
                </div>
              </section>
              {/* ▲▲▲ SELESAI ▲▲▲ */}

            </div>
          </main>
        </div>
      );
}

const Header = ({ connectionStatus, isDarkMode, setIsDarkMode }) => {
    const statusColor = { 'Terhubung': 'bg-green-500', 'Menyambungkan...': 'bg-yellow-500 animate-pulse' }[connectionStatus] || 'bg-red-500';
    return (
        <header className="bg-sawit-green dark:bg-dark-secondary shadow-lg z-20 flex items-center justify-between p-4 text-white">
            <h1 className="text-2xl font-bold">SawITSmart</h1>
            <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2"><div className={`h-3 w-3 rounded-full ${statusColor}`}></div><span>{connectionStatus}</span></div>
                <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full hover:bg-white/20">{isDarkMode ? <Sun /> : <Moon />}</button>
            </div>
        </header>
    );
};

const KPIs = ({ data }) => {
    if (data.length === 0) return <div className="text-center">Memuat data...</div>;
    const avgPH = data.reduce((acc, item) => acc + item.ph, 0) / data.length;
    const criticalCount = data.filter(d => getStatus(d) === 'critical').length;
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
        <div><p className="text-sm text-gray-500 dark:text-gray-400">{title}</p><p className="text-2xl font-bold">{value}</p></div>
    </div>
);

const MapComponent = ({ data, robot }) => (
  <MapContainer
    center={[1.8243, 102.3442]}
    zoom={16}
    scrollWheelZoom={false}
    style={{ height: '100%', width: '100%' }}
    className="bg-transparent"
  >

    <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        crossOrigin
    />

    <MapReady />
    
    {/* Marker tanaman */}
    {data.map(item => {
      const status = getStatus(item);
      const color = getStatusColor(status);
      return (
        <Marker key={item.id} position={[item.lat, item.lng]} icon={createMarkerIcon(color)}>
          <Popup>
            <div className="font-sans text-white">
              <strong className="text-lg block mb-2">{item.id}</strong>
              <p><strong>Status:</strong> <span style={{ color }}>{status}</span></p>
              <p><strong>pH:</strong> {item.ph} | <strong>Moisture:</strong> {item.moisture}%</p>
            </div>
          </Popup>
        </Marker>
      );
    })}

    {/* Marker robot */}
    {robot && (
      <Marker position={[robot.lat, robot.lng]} icon={robotIcon}>
        <Popup>
          <div className="text-white">
            <strong>Robot {robot.id}</strong><br />
            <span>📍 {robot.lat.toFixed(5)}, {robot.lng.toFixed(5)}</span><br />
            <span>🕒 {new Date(robot.timestamp).toLocaleTimeString()}</span>
          </div>
        </Popup>
      </Marker>
    )}

    {robot && <RobotFollower robot={robot} />}
  </MapContainer>
);

const ChartCard = ({ title, children }) => (
  <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg shadow-md h-[300px] md:h-[400px] flex flex-col">
    <h3 className="font-semibold mb-2">{title}</h3>
    <div className="flex-1 relative">{children}</div>
  </div>
);

const chartOptions = (isDarkMode) => ({
  responsive: true,
  maintainAspectRatio: false, // <-- penting
  plugins: {
    legend: { labels: { color: isDarkMode ? '#d1d5db' : '#374151' } }
  },
  scales: {
    x: {
      ticks: { color: isDarkMode ? '#9ca3af' : '#6b7280' },
      grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
    },
    y: {
      ticks: { color: isDarkMode ? '#9ca3af' : '#6b7280' },
      grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
    }
  }
});

const NPKChart = ({ data }) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const chartData = {
    labels: data.map(d => d.id),
    datasets: [
      { label: 'N', data: data.map(d => d.n), backgroundColor: '#A5D6A7' },
      { label: 'P', data: data.map(d => d.p), backgroundColor: '#64b5f6' },
      { label: 'K', data: data.map(d => d.k), backgroundColor: '#ffb74d' }
    ]
  };
  return <Bar className="h-full" options={chartOptions(isDarkMode)} data={chartData} />;
};

const SoilChart = ({ data }) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const chartData = {
    labels: data.map(d => d.id),
    datasets: [
      { label: 'pH', data: data.map(d => d.ph), borderColor: '#FDD835', backgroundColor: '#FDD835' },
      { label: 'Moisture (%)', data: data.map(d => d.moisture), borderColor: '#3b82f6', backgroundColor: '#3b82f6' }
    ]
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

const robotIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/4712/4712105.png",
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});