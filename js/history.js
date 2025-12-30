import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';
import { selectObject } from './selection.js';
import { queueAutosave } from './autosave.js';

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
    queueAutosave();
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
    // Check if geometry is already cached
    if (!obj.geometry.userData.uuid) {
        obj.geometry.userData.uuid = THREE.MathUtils.generateUUID();
    }
    const geoUUID = obj.geometry.userData.uuid;

    if (!state.geometryCache.has(geoUUID)) {
        // Cache the geometry data
        state.geometryCache.set(geoUUID, {
            type: obj.geometry.type,
            parameters: obj.geometry.parameters,
            positionArray: obj.geometry.attributes.position ?
                Array.from(obj.geometry.attributes.position.array) : null,
            normalArray: obj.geometry.attributes.normal ?
                Array.from(obj.geometry.attributes.normal.array) : null,
            indexArray: obj.geometry.index ?
                Array.from(obj.geometry.index.array) : null,
            uvArray: obj.geometry.attributes.uv ?
                Array.from(obj.geometry.attributes.uv.array) : null
        });
    }

    return {
        geometryUUID: geoUUID,
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

    // Retrieve from cache
    const geoData = state.geometryCache.get(data.geometryUUID);

    if (geoData) {
        if (geoData.positionArray) {
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(geoData.positionArray, 3));
            if (geoData.normalArray) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(geoData.normalArray, 3));
            if (geoData.indexArray) geometry.setIndex(new THREE.Uint32BufferAttribute(geoData.indexArray, 1));
            if (geoData.uvArray) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(geoData.uvArray, 2));
        } else {
            // Primitive reconstruction
            switch (geoData.type) {
                case 'BoxGeometry':
                    const bp = geoData.parameters;
                    geometry = new THREE.BoxGeometry(bp.width, bp.height, bp.depth);
                    break;
                case 'CylinderGeometry':
                    const cp = geoData.parameters;
                    geometry = new THREE.CylinderGeometry(cp.radiusTop, cp.radiusBottom, cp.height, cp.radialSegments);
                    break;
                case 'SphereGeometry':
                    const sp = geoData.parameters;
                    geometry = new THREE.SphereGeometry(sp.radius, sp.widthSegments, sp.heightSegments);
                    break;
                case 'TetrahedronGeometry':
                    const tp = geoData.parameters;
                    geometry = new THREE.TetrahedronGeometry(tp.radius, tp.detail);
                    break;
                case 'DodecahedronGeometry':
                    const dp = geoData.parameters;
                    geometry = new THREE.DodecahedronGeometry(dp.radius, dp.detail);
                    break;
                case 'IcosahedronGeometry':
                    const ip = geoData.parameters;
                    geometry = new THREE.IcosahedronGeometry(ip.radius, ip.detail);
                    break;
                case 'OctahedronGeometry':
                    const op = geoData.parameters;
                    geometry = new THREE.OctahedronGeometry(op.radius, op.detail);
                    break;
                default:
                    // Try to reconstruct from shape manager if params missing or complex
                    // For now fallback to box if totally lost
                    geometry = new THREE.BoxGeometry(1, 1, 1);
            }
        }

        // Restore UUID to keep cache linkage
        geometry.userData.uuid = data.geometryUUID;

    } else {
        console.warn('Geometry missing from cache:', data.geometryUUID);
        geometry = new THREE.BoxGeometry(5, 5, 5); // Error placeholder
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
    queueAutosave();
}
