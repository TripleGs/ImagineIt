import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';


class ShapeManager {
    constructor() {
        this.shapes = [
            {
                id: 'box',
                name: 'Box',
                type: 'primitive',
                create: () => new THREE.BoxGeometry(20, 20, 20),
                iconKey: 'cube'
            },
            {
                id: 'cylinder',
                name: 'Cylinder',
                type: 'primitive',
                create: () => new THREE.CylinderGeometry(10, 10, 20, 32),
                iconKey: 'cylinder'
            },
            {
                id: 'sphere',
                name: 'Sphere',
                type: 'primitive',
                create: () => new THREE.SphereGeometry(10, 32, 32),
                iconKey: 'sphere'
            },
            {
                id: 'tetrahedron',
                name: 'Tetrahedron',
                type: 'primitive',
                create: () => {
                    const geo = new THREE.TetrahedronGeometry(15);
                    const matrix = new THREE.Matrix4().makeRotationFromEuler(
                        new THREE.Euler(
                            THREE.MathUtils.degToRad(144),
                            THREE.MathUtils.degToRad(12),
                            THREE.MathUtils.degToRad(-36),
                            'XYZ'
                        )
                    );
                    geo.applyMatrix4(matrix);
                    return geo;
                },
                iconKey: 'cone' // Tetrahedron looks like a tripod/cone roughly
            },
            {
                id: 'octahedron',
                name: 'Octahedron (d8)',
                type: 'primitive',
                create: () => {
                    const geo = new THREE.OctahedronGeometry(15);
                    const matrix = new THREE.Matrix4().makeRotationFromEuler(
                        new THREE.Euler(
                            THREE.MathUtils.degToRad(70),
                            THREE.MathUtils.degToRad(52),
                            THREE.MathUtils.degToRad(70),
                            'XYZ'
                        )
                    );
                    geo.applyMatrix4(matrix);
                    return geo;
                },
                iconKey: 'diamond' // No d8 yet, maybe diamond or just fallback
            },
            {
                id: 'pentagonal_trapezohedron',
                name: 'Pentagonal Trapezohedron (d10)',
                type: 'primitive',
                create: () => {
                    const geo = createPentagonalTrapezohedron(13, 12.5);
                    const matrix = new THREE.Matrix4().makeRotationFromEuler(
                        new THREE.Euler(
                            THREE.MathUtils.degToRad(44),
                            THREE.MathUtils.degToRad(-52),
                            THREE.MathUtils.degToRad(-102),
                            'XYZ'
                        )
                    );
                    geo.applyMatrix4(matrix);
                    return geo;
                },
                iconKey: 'd10'
            },
            {
                id: 'dodecahedron',
                name: 'Dodecahedron (d12)',
                type: 'primitive',
                create: () => {
                    const geo = new THREE.DodecahedronGeometry(15);
                    const matrix = new THREE.Matrix4().makeRotationFromEuler(
                        new THREE.Euler(
                            THREE.MathUtils.degToRad(72),
                            THREE.MathUtils.degToRad(27),
                            THREE.MathUtils.degToRad(36),
                            'XYZ'
                        )
                    );
                    geo.applyMatrix4(matrix);
                    return geo;
                },
                iconKey: 'd12'
            },
            {
                id: 'icosahedron',
                name: 'Icosahedron (d20)',
                type: 'primitive',
                create: () => {
                    const geo = new THREE.IcosahedronGeometry(15);
                    const matrix = new THREE.Matrix4().makeRotationFromEuler(
                        new THREE.Euler(
                            0,
                            0,
                            THREE.MathUtils.degToRad(111),
                            'XYZ'
                        )
                    );
                    geo.applyMatrix4(matrix);
                    return geo;
                },
                iconKey: 'd20'
            }
        ];
        this.loader = new STLLoader();
    }

    getShapes() {
        return this.shapes;
    }

    async loadShapeGeometry(shapeId) {
        const shape = this.shapes.find(s => s.id === shapeId);
        if (!shape) throw new Error(`Shape ${shapeId} not found`);
        console.log(`Loading geometry for shape: ${shapeId}, type: ${shape.type}`);


        if (shape.type === 'primitive') {
            return shape.create();
        }

        return new Promise((resolve, reject) => {
            this.loader.load(shape.url, (geometry) => {
                resolve(geometry);
            }, undefined, (error) => {
                reject(error);
            });
        });
    }

    async generatePreview(shapeId) {
        const shape = this.shapes.find(s => s.id === shapeId);
        if (!shape) return null;

        // Create a temporary scene for rendering the preview
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5f5f5); // Match UI background

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        scene.add(dirLight);

        // Get geometry
        let geometry;
        try {
            geometry = await this.loadShapeGeometry(shapeId);
        } catch (e) {
            console.error('Failed to load geometry for preview:', e);
            return null;
        }

        // Create mesh
        const material = new THREE.MeshStandardMaterial({
            color: 0x2196f3,
            roughness: 0.5,
            metalness: 0.1,
            flatShading: shapeId === 'pentagonal_trapezohedron' // Better look for d10
        });
        const mesh = new THREE.Mesh(geometry, material);

        // Center and scale geometry
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);

        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const scale = 4 / maxDim; // Scale to fit in view
            mesh.scale.set(scale, scale, scale);
        }

        scene.add(mesh);

        // Camera
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.set(5, 5, 5);
        camera.lookAt(0, 0, 0);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(128, 128);
        renderer.render(scene, camera);

        const dataUrl = renderer.domElement.toDataURL();

        // Cleanup
        geometry.dispose();
        material.dispose();
        renderer.dispose();

        return dataUrl;
    }
}


function createPentagonalTrapezohedron(radius, halfHeight) {
    // Parameters H (half-height of poles) vs radius.
    // User requested specific sizing generally around 25.
    // We allow passing halfHeight (H) explicitly.
    const H = halfHeight || radius * 1.5;

    // Calculate h (offset of equator vertices) to ensure planarity
    // h = H * (1 - cos(36)) / (1 + cos(36))
    const angleStep = Math.PI / 5; // 36 degrees
    const c = Math.cos(angleStep);
    const h = H * (1 - c) / (1 + c);

    const vertices = [];
    const indices = [];

    // Vertices
    // 0: Top Pole
    vertices.push(0, H, 0);
    // 1: Bottom Pole
    vertices.push(0, -H, 0);

    // Equator Rings
    // Ring A (Upper/Base) - 5 vertices
    // Ring B (Lower/Cross) - 5 vertices
    // Angles: A starts at 0. B starts at 36.

    // We add them in order. Let's store indices for easier reference.
    const ringA = [];
    const ringB = [];

    for (let i = 0; i < 5; i++) {
        const thetaA = i * 2 * angleStep; // 0, 72, 144...
        const thetaB = thetaA + angleStep; // 36, 108...

        // Ring A
        vertices.push(radius * Math.cos(thetaA), h, radius * Math.sin(thetaA));
        ringA.push(2 + i * 2); // 2, 4, 6, 8, 10

        // Ring B
        vertices.push(radius * Math.cos(thetaB), -h, radius * Math.sin(thetaB));
        ringB.push(2 + i * 2 + 1); // 3, 5, 7, 9, 11
    }

    // Indices
    const topPole = 0;
    const botPole = 1;

    for (let i = 0; i < 5; i++) {
        const aCurr = ringA[i];
        const bCurr = ringB[i];
        const aNext = ringA[(i + 1) % 5];
        const bNext = ringB[(i + 1) % 5];

        // Top Faces (Top, A_curr, B_curr, A_next)
        // Normal must point OUT.
        // T is peak. B is below A.
        // T -> B -> A gives Out normal.
        indices.push(topPole, bCurr, aCurr);
        indices.push(topPole, aNext, bCurr);

        // Bottom Faces (Bot, B_curr, A_next, B_next)
        // Bot is Down.
        // B -> A -> Bot gives Out normal.
        indices.push(bCurr, aNext, botPole);
        indices.push(aNext, bNext, botPole);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

export const shapeManager = new ShapeManager();
