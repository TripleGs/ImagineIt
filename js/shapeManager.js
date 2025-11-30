import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

class ShapeManager {
    constructor() {
        this.shapes = [
            {
                id: 'box',
                name: 'Box',
                type: 'stl',
                url: 'assets/box.stl',
                icon: 'check_box_outline_blank'
            },
            {
                id: 'cylinder',
                name: 'Cylinder',
                type: 'stl',
                url: 'assets/cylinder.stl',
                icon: 'token'
            },
            {
                id: 'sphere',
                name: 'Sphere',
                type: 'stl',
                url: 'assets/sphere.stl',
                icon: 'circle'
            },
            {
                id: 'tetrahedron',
                name: 'Tetrahedron',
                type: 'stl',
                url: 'assets/tetrahedron.stl',
                icon: 'change_history'
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

        if (shape.type === 'primitive') {
            return shape.create();
        } else if (shape.type === 'stl') {
            return new Promise((resolve, reject) => {
                this.loader.load(shape.url, (geometry) => {
                    resolve(geometry);
                }, undefined, (error) => {
                    reject(error);
                });
            });
        }
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
            metalness: 0.1
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

export const shapeManager = new ShapeManager();
