import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';

let objectCounter = { box: 0, cylinder: 0, sphere: 0 };

export function createMesh(geometry, color, position, type = 'object') {
    console.log('objects.js: createMesh called, scene is:', scene);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        transparent: false,
        opacity: 1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Set default name based on type
    if (type in objectCounter) {
        objectCounter[type]++;
        mesh.userData.name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${objectCounter[type]}`;
    } else {
        mesh.userData.name = type;
    }

    // Default to solid
    mesh.userData.isSolid = true;

    scene.add(mesh);
    state.objects.push(mesh);
    return mesh;
}
