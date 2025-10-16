// src/components/ThreeDViewer.jsx

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { gsap } from 'gsap';

const ThreeDViewer = () => {
    const mountRef = useRef(null);

    useEffect(() => {
        const currentMount = mountRef.current;
        let scene, camera, renderer, controls, model;

        // Inisialisasi Scene
        const init = () => {
            // Scene
            scene = new THREE.Scene();

            // Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.outputEncoding = THREE.sRGBEncoding;
            currentMount.appendChild(renderer.domElement);

            // Camera
            camera = new THREE.PerspectiveCamera(45, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
            camera.position.set(0, 2, 10);
            scene.add(camera);

            // Controls
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.target.set(0, 1, 0);

            // Loaders
            loadModels();
            loadEnvironment();
        };

        // Memuat Model 3D
        const loadModels = () => {
            const loader = new GLTFLoader();
            // Perhatikan path menuju aset yang sudah dipindahkan
            loader.load('/3d-assets/assets/Scene_Morning.glb', (gltf) => {
                model = gltf.scene;
                scene.add(model);
                applyMaterials();
                fitCameraToObject(camera, model, 1.5, controls);
            });
        };

        // Memuat Lingkungan (Environment Map)
        const loadEnvironment = () => {
            const rgbeLoader = new RGBELoader();
            // Perhatikan path menuju aset yang sudah dipindahkan
            rgbeLoader.load('/3d-assets/HDRs/kloppenheim_02_2k.hdr', (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                scene.environment = texture;
            });
        };
        
        // Menerapkan Tekstur/Material
        const applyMaterials = () => {
             const textureLoader = new THREE.TextureLoader();
             const grassTexture = textureLoader.load('/3d-assets/Textures/aerial_grass_rock_2k_jpg/aerial_grass_rock_diff_2k.jpg');
             grassTexture.wrapS = THREE.RepeatWrapping;
             grassTexture.wrapT = THREE.RepeatWrapping;
             grassTexture.repeat.set(8, 8);
             
             const grassMaterial = new THREE.MeshStandardMaterial({ map: grassTexture });

             if(model) {
                 model.traverse((child) => {
                     if (child.isMesh && child.name === 'Ground') {
                         child.material = grassMaterial;
                     }
                 });
             }
        };

        // Fungsi agar kamera fokus ke objek
        const fitCameraToObject = (camera, object, offset, controls) => {
            offset = offset || 1.25;
            const boundingBox = new THREE.Box3();
            boundingBox.setFromObject(object);

            const center = new THREE.Vector3();
            boundingBox.getCenter(center);

            const size = new THREE.Vector3();
            boundingBox.getSize(size);

            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= offset;
            
            gsap.to(camera.position, {
                duration: 1,
                x: center.x,
                y: center.y,
                z: center.z + cameraZ,
                ease: 'power2.inOut',
            });
            
            if (controls) {
                 gsap.to(controls.target, {
                    duration: 1,
                    x: center.x,
                    y: center.y,
                    z: center.z,
                    ease: 'power2.inOut',
                });
            }
        };
        
        // Animation Loop
        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };

        // Handle Resize
        const onResize = () => {
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };

        window.addEventListener('resize', onResize);
        
        init();
        animate();

        // Cleanup function
        return () => {
            window.removeEventListener('resize', onResize);
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }
        };
    }, []);

    return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

export default ThreeDViewer;