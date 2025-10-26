import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { gsap } from 'gsap';

const ThreeDViewer = ({ robotPath = [], detectedTrees = [], activeTreeIds = [] }) => {
  const mountRef = useRef(null);
  const robotRef = useRef();
  const sceneRef = useRef();
  const clockRef = useRef(new THREE.Clock());

  const [treeModel, setTreeModel] = useState(null);
  const [displayedTrees, setDisplayedTrees] = useState({});

  // --- Setup Scene ---
  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0d8ef);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    currentMount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    // Loaders
    const gltfLoader = new GLTFLoader();
    const rgbeLoader = new RGBELoader();

    rgbeLoader.load('/3d-assets/HDRs/kloppenheim_02_2k.hdr', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
    });

    gltfLoader.load('/3d-assets/assets/Scene_Morning.glb', (gltf) => {
      gltf.scene.scale.set(0.5, 0.5, 0.5);
      scene.add(gltf.scene);
    });

    gltfLoader.load('/3d-assets/assets/robot.glb', (gltf) => {
      const robot = gltf.scene;
      robot.scale.set(0.2, 0.2, 0.2);
      scene.add(robot);
      robotRef.current = robot;
      if (robotPath.length > 0)
        robot.position.set(robotPath[0].x, robotPath[0].y, robotPath[0].z);
    });

    gltfLoader.load('/3d-assets/assets/tree.glb', (gltf) => {
      const model = gltf.scene;
      model.scale.set(0.3, 0.3, 0.3);
      setTreeModel(model);
      console.log('Tree model loaded');
    });

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      gsap.killTweensOf(robotRef.current?.position);
      if (currentMount && renderer.domElement)
        currentMount.removeChild(renderer.domElement);
    };
  }, [robotPath]);

  // --- Animasi Robot ---
  useEffect(() => {
    if (!robotRef.current || robotPath.length < 2) return;
    const robot = robotRef.current;
    const tl = gsap.timeline();
    robot.position.set(robotPath[0].x, robotPath[0].y, robotPath[0].z);
    for (let i = 1; i < robotPath.length; i++) {
      const p1 = robotPath[i - 1];
      const p2 = robotPath[i];
      const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const duration = dist * 0.5;
      tl.to(robot.position, {
        x: p2.x,
        y: p2.y,
        z: p2.z,
        duration,
        ease: 'linear',
        onUpdate: () => robot.lookAt(p2.x, p2.y, p2.z),
      });
    }
    return () => tl.kill();
  }, [robotPath]);

  useEffect(() => {
    if (!treeModel || !sceneRef.current) return;
    const scene = sceneRef.current;
    const map = { ...displayedTrees };
    let changed = false;

    // Tambah yang aktif
    detectedTrees.forEach((tree) => {
      const id = tree.id;
      if (!map[id] && activeTreeIds.includes(id)) {
        const inst = treeModel.clone();
        inst.position.set(tree.x, tree.y || 0, tree.z); // ⬅️ dunia (tetap)
        scene.add(inst);
        map[id] = inst;
        changed = true;
      }
    });

    // Hapus yang tidak aktif / menjauh
    Object.entries(map).forEach(([id, obj]) => {
      if (!activeTreeIds.includes(id)) {
        scene.remove(obj);
        obj.traverse(n => {
          if (n.geometry) n.geometry.dispose();
          if (n.material) n.material.dispose?.();
        });
        delete map[id];
        changed = true;
      }
    });

    if (changed) setDisplayedTrees(map);
  }, [detectedTrees, activeTreeIds, treeModel]);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '400px',
        position: 'relative',
        background: '#cce5ff',
        borderRadius: '0.5rem',
      }}
    />
  );
};

export default ThreeDViewer;