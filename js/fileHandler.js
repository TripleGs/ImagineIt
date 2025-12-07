import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { state } from './state.js';
import { scene } from './scene.js';
import { selectObject } from './selection.js';

export function exportSTL() {
    if (state.selectedObject && state.selectedObject.userData.helper) {
        state.selectedObject.remove(state.selectedObject.userData.helper);
    }

    const exporter = new STLExporter();
    let result;

    if (state.selectedObject) {
        result = exporter.parse(state.selectedObject);
        saveString(result, 'object.stl');
        if (state.selectedObject.userData.helper) {
            state.selectedObject.add(state.selectedObject.userData.helper);
        }
    } else if (state.objects.length > 0) {
        const group = new THREE.Group();
        state.objects.forEach(obj => {
            const clone = obj.clone();
            if (clone.userData.helper) {
                clone.remove(clone.userData.helper);
            }
            group.add(clone);
        });
        result = exporter.parse(group);
        saveString(result, 'scene.stl');
    } else {
        alert('No objects to export!');
    }
}

export function exportImagine() {
    if (state.objects.length === 0) {
        alert('No objects to export!');
        return;
    }

    // We serialize the individual objects in the list
    const serializedObjects = state.objects.map(obj => obj.toJSON());

    const data = {
        metadata: {
            version: 1.0,
            type: 'ImagineIt_Project',
            date: new Date().toISOString()
        },
        objects: serializedObjects
    };

    const json = JSON.stringify(data, null, 2);
    saveString(json, 'project.imagine');
}

export function importFile(file) {
    const filename = file.name.toLowerCase();

    if (filename.endsWith('.stl')) {
        loadSTL(file);
    } else if (filename.endsWith('.imagine') || filename.endsWith('.json')) {
        loadImagine(file);
    } else {
        alert('Unsupported file format. Please use .stl or .imagine');
    }
}

function loadSTL(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const loader = new STLLoader();
            const geometry = loader.parse(e.target.result);
            normalizeGeometry(geometry);

            // Create mesh with random color
            const material = new THREE.MeshStandardMaterial({
                color: Math.random() * 0xffffff,
                roughness: 0.5,
                metalness: 0.1
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.name = file.name;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Position it
            mesh.position.set(0, 10, 0);

            // Add to scene
            scene.add(mesh);
            state.objects.push(mesh);
            selectObject(mesh);
        } catch (err) {
            console.error(err);
            alert('Failed to parse STL file.');
        }
    };
    reader.readAsArrayBuffer(file);
}

function loadImagine(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            // Check if valid structure
            if (!data.objects) {
                throw new Error('Invalid .imagine file structure');
            }

            const loader = new THREE.ObjectLoader();
            const loadedObjects = [];

            // Parse each object and add to scene
            data.objects.forEach(objData => {
                const obj = loader.parse(objData);

                // Ensure it's treated as a mesh if possible
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;

                    scene.add(obj);
                    state.objects.push(obj);
                    loadedObjects.push(obj);
                }
            });

            if (loadedObjects.length > 0) {
                // Select the last loaded object
                selectObject(loadedObjects[loadedObjects.length - 1]);
                alert(`Imported ${loadedObjects.length} objects.`);
            } else {
                alert('No valid objects found in file.');
            }

        } catch (err) {
            console.error(err);
            alert('Failed to load project: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function saveString(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function normalizeGeometry(geometry) {
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);

    // Normalize scale roughly to 20 units
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
        const scale = 20 / maxDim;
        geometry.scale(scale, scale, scale);
    }
}
