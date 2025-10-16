// backend/server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = 8080;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const initialPlots = [
    { id: "PLT-001", lat: 1.8243, lng: 102.3442 },
    { id: "PLT-002", lat: 1.8255, lng: 102.3460 },
    { id: "PLT-003", lat: 1.8230, lng: 102.3455 },
    { id: "PLT-004", lat: 1.8261, lng: 102.3430 },
    { id: "PLT-005", lat: 1.8219, lng: 102.3421 },
];
const plantationData = new Map();

const vary = (value, amount) => value + (Math.random() - 0.5) * amount;

function generateDummyData(id, lat, lng) {
    const lastData = plantationData.get(id) || { ph: 6.5, n: 25, p: 15, k: 23, moisture: 70, temperature: 28 };
    const newData = {
        id, lat, lng,
        ph: parseFloat(vary(lastData.ph, 0.2).toFixed(1)),
        n: Math.round(vary(lastData.n, 4)),
        p: Math.round(vary(lastData.p, 3)),
        k: Math.round(vary(lastData.k, 4)),
        moisture: Math.round(vary(lastData.moisture, 5)),
        temperature: parseFloat(vary(lastData.temperature, 1).toFixed(1)),
        recommendation: "Apply 50kg NPK Mix",
        timestamp: new Date().toISOString()
    };
    plantationData.set(id, newData);
    return newData;
}

wss.on('connection', ws => {
    console.log('Client terhubung');
    const initialData = initialPlots.map(p => generateDummyData(p.id, p.lat, p.lng));
    ws.send(JSON.stringify({ type: 'initial', payload: initialData }));

    ws.on('close', () => {
        console.log('Client terputus');
    });
});

setInterval(() => {
    const randomPlot = initialPlots[Math.floor(Math.random() * initialPlots.length)];
    const updatedData = generateDummyData(randomPlot.id, randomPlot.lat, randomPlot.lng);
    const message = JSON.stringify({ type: 'update', payload: updatedData });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}, 5000);

// Simulate robot movement
let robotPosition = { id: "RB-01", lat: 1.8243, lng: 102.3442 };

// Fungsi simulasi gerak robot
function moveRobot() {
  const deltaLat = (Math.random() - 0.5) * 0.0003;
  const deltaLng = (Math.random() - 0.5) * 0.0003;
  robotPosition = {
    ...robotPosition,
    lat: robotPosition.lat + deltaLat,
    lng: robotPosition.lng + deltaLng,
    timestamp: new Date().toISOString()
  };
  const message = JSON.stringify({ type: "robot_position", payload: robotPosition });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Kirim posisi robot tiap 2 detik
setInterval(moveRobot, 2000);

server.listen(PORT, () => {
    console.log(`✅ Server data berjalan di ws://localhost:${PORT}`);
});