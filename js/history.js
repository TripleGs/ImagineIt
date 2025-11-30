import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';
import { selectObject } from './selection.js';

export function saveState() {
    // Create a snapshot of the current scene state
    const snapshot = {
        objects: state.objects.map(obj => serializeObject(obj)),
        timestamp: Date.now()
    };

    // Remove any history after current index (for redo after undo)
    state.history = state.history.slice(0, state.historyIndex + 1);

    // Add new snapshot
    state.history.push(snapshot);

    // Limit history size
    if (state.history.length > state.maxHistorySize) {
        state.history.shift();
    } else {
        state.historyIndex++;
    }

    console.log(`State saved. History size: ${state.history.length}, Index: ${state.historyIndex}`);
}

export function undo() {
    if (state.historyIndex <= 0) {
        console.log('Nothing to undo');
        return;
    }

    state.historyIndex--;
    restoreState(state.history[state.historyIndex]);
    console.log(`Undone. History index: ${state.historyIndex}`);
}

export function redo() {
    if (state.historyIndex >= state.history.length - 1) {
        console.log('Nothing to redo');
        return;
    }

    state.historyIndex++;
    restoreState(state.history[state.historyIndex]);
    console.log(`Redone. History index: ${state.historyIndex}`);
}

function serializeObject(obj) {
    return {
        geometry: {
            type: obj.geometry.type,
            parameters: obj.geometry.parameters,
            // Store the actual geometry data for combined objects
            positionArray: obj.geometry.attributes.position ?
                Array.from(obj.geometry.attributes.position.array) : null,
            normalArray: obj.geometry.attributes.normal ?
                Array.from(obj.geometry.attributes.normal.array) : null,
            indexArray: obj.geometry.index ?
                Array.from(obj.geometry.index.array) : null
        },
        material: {
            color: obj.material.color.getHex(),
            transparent: obj.material.transparent,
            opacity: obj.material.opacity
        },
        position: obj.position.toArray(),
        rotation: obj.rotation.toArray(),
        scale: obj.scale.toArray(),
        userData: JSON.parse(JSON.stringify(obj.userData)), // Deep clone
        castShadow: obj.castShadow,
        receiveShadow: obj.receiveShadow
    };
}

function deserializeObject(data) {
    let geometry;

    // Restore combined object geometry
    if (data.geometry.positionArray) {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(data.geometry.positionArray, 3));
        if (data.geometry.normalArray) {
            geometry.setAttribute('normal',
                new THREE.Float32BufferAttribute(data.geometry.normalArray, 3));
        }
        if (data.geometry.indexArray) {
            geometry.setIndex(new THREE.Uint32BufferAttribute(data.geometry.indexArray, 1));
        }
    } else {
        // Restore primitive geometry
        switch (data.geometry.type) {
            case 'BoxGeometry':
                const bp = data.geometry.parameters;
                geometry = new THREE.BoxGeometry(bp.width, bp.height, bp.depth);
                break;
            case 'CylinderGeometry':
                const cp = data.geometry.parameters;
                geometry = new THREE.CylinderGeometry(
                    cp.radiusTop, cp.radiusBottom, cp.height, cp.radialSegments
                );
                break;
            case 'SphereGeometry':
                const sp = data.geometry.parameters;
                geometry = new THREE.SphereGeometry(
                    sp.radius, sp.widthSegments, sp.heightSegments
                );
                break;
            default:
                console.warn('Unknown geometry type:', data.geometry.type);
                geometry = new THREE.BoxGeometry(1, 1, 1);
        }
    }

    const material = new THREE.MeshStandardMaterial({
        color: data.material.color,
        transparent: data.material.transparent,
        opacity: data.material.opacity
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(data.position);
    mesh.rotation.fromArray(data.rotation);
    mesh.scale.fromArray(data.scale);
    mesh.userData = data.userData;
    mesh.castShadow = data.castShadow;
    mesh.receiveShadow = data.receiveShadow;

    return mesh;
}

function restoreState(snapshot) {
    // Clear current scene
    state.objects.forEach(obj => {
        if (obj.userData.helper) {
            obj.remove(obj.userData.helper);
        }
        scene.remove(obj);
    });

    // Restore objects from snapshot
    state.objects = [];
    snapshot.objects.forEach(objData => {
        const mesh = deserializeObject(objData);
        scene.add(mesh);
        state.objects.push(mesh);
    });

    // Clear selection
    selectObject(null);
}
