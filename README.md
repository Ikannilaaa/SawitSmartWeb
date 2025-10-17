## Input frontend + Data typenya

## State Robot
<br>

```
type RobotState = {
  id: string;                 // e.g. "robot1"
  ts: string;                 // ISO8601
  lat: number;                // derajat (WGS84)
  lng: number;                // derajat (WGS84)
  headingDeg: number;         // 0–360, 0=utara, searah jarum jam
  lidarFront?: {
    nearest_m?: number;       // meter, jarak obstacle terdekat di FOV depan
    angle_rad?: number;       // radian, relatif ke heading (0=depan, +CCW)
    warn?: boolean;           // true jika nearest_m <= warnRange (default 40m)
    danger?: boolean;         // true jika nearest_m <= dangerRange (default 15m)
  };
};
```

## Data hasil sensor tanah
<br>

```
type PlantationItem = {
  id: string;          // unik
  lat: number;         // derajat
  lng: number;         // derajat
  ph: number;          // pH tanah
  moisture: number;    // % kelembapan
  n: number;           // ppm Nitrogen
  p: number;           // ppm Phosphorus
  k: number;           // ppm Potassium
  // opsional
  name?: string;
  ts?: string;         // ISO8601 timestamp pengambilan
};

type InitialPayload = PlantationItem[];
type UpdatePayload = PlantationItem; // satu item per update
```

## Props ForwardLidarFOV
<br>

```
type ForwardLidarFOVProps = {
  robot: { lat: number; lng: number; headingDeg: number; };
  objects: { id: string; lat: number; lng: number; label?: string; }[]; // “objek” yang mau dicek dalam sektor
  fovDeg?: number;      // default 120
  maxRange?: number;    // default 100 (meter)
  warnRange?: number;   // default 40
  dangerRange?: number; // default 15
  onDetect?: (hits: Array<{ id: string; distance: number; angleDiff: number }>) => void;
};
```
