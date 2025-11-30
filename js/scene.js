import * as THREE from 'three';

export let scene;
export let camera;
export let renderer;
export let gridHelper;

export function initScene() {
    // Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(50, 50, 50);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);

    // Grid
    gridHelper = new THREE.GridHelper(200, 20);
    scene.add(gridHelper);

    const planeGeometry = new THREE.PlaneGeometry(200, 200);
    const planeMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export function updateGrid(size) {
    scene.remove(gridHelper);
    const divisions = size / 10;
    gridHelper = new THREE.GridHelper(size, divisions);
    scene.add(gridHelper);
}

let galaxySystem = null;

function createGalaxySystem() {
    const system = new THREE.Group();

    // 1. Stars (White/Blue-ish) - Fixed in space relative to user (large sphere)
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        // Create stars in a large sphere around the scene
        const r = 400 + Math.random() * 400; // Distance from center (400-800)
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPositions[i * 3 + 2] = r * Math.cos(phi);

        starSizes[i] = Math.random() * 1.5 + 0.5;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.5,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    system.add(stars);

    // 2. Golden Dust - Moving slightly
    const dustGeometry = new THREE.BufferGeometry();
    const dustCount = 1000;
    const dustPositions = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount; i++) {
        // Dust distributed more densely but still widespread
        const r = 200 + Math.random() * 400;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        dustPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        dustPositions[i * 3 + 2] = r * Math.cos(phi);
    }

    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    // Store original positions for animation
    dustGeometry.userData = { originalPositions: dustPositions.slice() };

    const dustMaterial = new THREE.PointsMaterial({
        color: 0xffd700, // Gold
        size: 2.0,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending
    });

    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.name = 'galaxyDust';
    system.add(dust);

    return system;
}

function animateGalaxy() {
    if (!galaxySystem) return;

    const dust = galaxySystem.getObjectByName('galaxyDust');
    if (dust) {
        const positions = dust.geometry.attributes.position.array;
        const original = dust.geometry.userData.originalPositions;
        const time = Date.now() * 0.0005;

        for (let i = 0; i < positions.length; i += 3) {
            // Gentle wave motion
            positions[i] = original[i] + Math.sin(time + original[i] * 0.01) * 5;
            positions[i + 1] = original[i + 1] + Math.cos(time + original[i + 1] * 0.01) * 5;
            positions[i + 2] = original[i + 2] + Math.sin(time + original[i + 2] * 0.01) * 5;
        }
        dust.geometry.attributes.position.needsUpdate = true;

        // Slowly rotate the whole dust cloud
        dust.rotation.y = time * 0.05;
    }

    requestAnimationFrame(animateGalaxy);
}

export function setBackgroundTheme(themeName) {
    // Clear existing galaxy system if any
    if (galaxySystem) {
        scene.remove(galaxySystem);
        galaxySystem = null;
    }

    if (themeName === 'galaxy') {
        scene.background = new THREE.Color(0x050510); // Dark background
        galaxySystem = createGalaxySystem();
        scene.add(galaxySystem);
        animateGalaxy();
    } else if (themeName === 'dark') {
        scene.background = new THREE.Color(0x1a1a2e); // Dark blue-ish gray
    } else {
        // Default
        scene.background = new THREE.Color(0xf0f0f0);
    }
}

