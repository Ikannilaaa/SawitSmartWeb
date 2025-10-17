import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- helper functions ---
function frameObject(object, camera, fitOffset = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const halfFov = (camera.fov * Math.PI) / 360;
  const distance = (maxSize / (2 * Math.tan(halfFov))) * fitOffset;
  return { center, size, distance };
}
function dropToGround(root) {
  const box = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(box.min.y)) root.position.y -= box.min.y;
}
function fixCommonTilt(root, axis = 'x', sign = -1) {
  const rad = sign * Math.PI / 2;
  if (axis === 'x') root.rotateX(rad);
  else root.rotateZ(rad);
}
function normalizeUp(scene) {
  scene.up.set(0, 1, 0);
}
// -------------------------

export default function ThreeDViewer({
  height = 560,
  modelUrl = '/3d-assets/assets/Scene_Morning.glb',
}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth || 1, height, true);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0xf3f4f6, 0);
    el.appendChild(renderer.domElement);

    // Scene & Camera
    const scene = new THREE.Scene();
    normalizeUp(scene);
    const camera = new THREE.PerspectiveCamera(
      70,
      (el.clientWidth || 1) / height,
      0.05,
      5000
    );
    camera.position.set(0, 1, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(60, 120, -40);
    scene.add(sun);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableKeys = false; // no keyboard
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 500;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 0.8;

    // Placeholder
    const placeholder = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x55aaff })
    );
    scene.add(placeholder);

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (res) => {
        scene.remove(placeholder);
        const model = res.scene;
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        fixCommonTilt(model, 'x', -1);
        dropToGround(model);
        scene.add(model);

        const fit = frameObject(model, camera, 1);
        if (!fit) return;

        // Kamera dalam bounding box model
        const center = fit.center;
        const size = fit.size;
        // posisi kamera di tengah + sedikit ke atas
        camera.position.copy(center.clone().add(new THREE.Vector3(0, size.y * 0.3, 0)));
        controls.target.copy(center);
        camera.lookAt(center);
        controls.update();

        // batasi rotasi
        controls.minDistance = 0.1;
        controls.maxDistance = Math.max(10, size.length() * 1.5);
      },
      undefined,
      (err) => {
        console.error('GLB error', err);
      }
    );

    // Resize
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 1;
      renderer.setSize(w, height, true);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    // Loop
    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [height, modelUrl]);

  return (
    <div
      ref={mountRef}
      className="w-full"
      style={{ height, pointerEvents: 'auto' }}
    />
  );
}