import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { state } from './state.js';
import { scene } from './scene.js';
import { selectObject } from './selection.js';
import { createMesh } from './objects.js';
import { detachHelperLines, serializeProjectObjects } from './projectSerialization.js';

function normalizeProjectName(name) {
    return name.trim().replace(/\.imagine$/i, '');
}

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

export async function exportImagine() {
    if (state.objects.length === 0) {
        alert('No objects to export!');
        return;
    }

    // We serialize the individual objects in the list (without helper lines)
    const serializedObjects = serializeProjectObjects(state.objects);

    const data = {
        metadata: {
            version: 1.0,
            type: 'ImagineIt_Project',
            date: new Date().toISOString()
        },
        objects: serializedObjects
    };

    const json = JSON.stringify(data, null, 2);

    if (window.electronAPI) {
        let name = state.currentProjectName || 'project';
        const nameInput = document.getElementById('project-name-input');
        if (nameInput && nameInput.value) {
            name = nameInput.value;
        } else {
            name = prompt('Enter project name:', name);
        }

        name = name ? normalizeProjectName(name) : '';

        if (name) {
            try {
                const result = await window.electronAPI.saveFile(name, json);
                const baseName = result?.name ? result.name.replace(/\.imagine$/i, '') : name;
                state.currentProjectName = baseName;
                state.hasProjectFile = true;
                if (nameInput) nameInput.value = baseName;
                alert('Saved to library!');
                // Refresh library if UI is open (it does it automatically via poll? No, we might need to trigger refresh)
                // For now, next time library opens it will refresh. Or we can dispatch event.
                // But let's keep it simple.
            } catch (e) {
                console.error(e);
                alert('Failed to save file');
            }
        }
    } else {
        const filename = `${normalizeProjectName(state.currentProjectName || 'project')}.imagine`;
        saveString(json, filename);
    }
}

export function importFile(file) {
    const filename = file.name.toLowerCase();
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('visible');

    // Use setTimeout to allow UI to render the loader
    setTimeout(() => {
        if (filename.endsWith('.stl')) {
            loadSTL(file);
        } else if (filename.endsWith('.imagine') || filename.endsWith('.json')) {
            loadImagine(file);
        } else {
            alert('Unsupported file format. Please use .stl or .imagine');
            if (overlay) overlay.classList.remove('visible');
        }
    }, 100);
}

function loadSTL(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const loader = new STLLoader();
            const geometry = loader.parse(e.target.result);
            normalizeGeometry(geometry);

            // Use createMesh to ensure edges are added automatically
            const mesh = createMesh(geometry, Math.random() * 0xffffff, new THREE.Vector3(0, 10, 0), file.name);

            selectObject(mesh);
        } catch (err) {
            console.error(err);
            alert('Failed to parse STL file.');
        } finally {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.classList.remove('visible');
        }
    };
    reader.onerror = function () {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('visible');
    };
    reader.readAsArrayBuffer(file);
}

function loadImagine(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            loadProjectData(data);
        } catch (err) {
            console.error(err);
            alert('Failed to load project: ' + err.message);
        } finally {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.classList.remove('visible');
        }
    };
    reader.onerror = function () {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('visible');
    };
    reader.readAsText(file);
}

export function loadProjectData(data) {
    // Check if valid structure
    if (!data.objects) {
        throw new Error('Invalid .imagine file structure');
    }

    // Clear existing scene? Optional, but usually desired for "Open"
    // state.objects.forEach(obj => scene.remove(obj));
    // state.objects = [];
    // But current implementation appends (Merge). Let's stick to append or maybe we should clear?
    // The user didn't specify. Tinkercad usually opens a new workspace.
    // For now, we will APPEND (Merge) to keep existing behavior compliant with importFile, 
    // BUT for "Open from Library" usually implies Replace. 
    // Let's Clear if coming from Library? No, simpler to Append for now to avoid losing work accidentally.

    // Actually, let's clear if it's a full project load.
    // Only if confirm? libraryUI already asks confirm.
    // Let's clear scene for Library loads.
    // But this function is used by `importFile` too which might be "Import".
    // `importFile` implies Import.
    // Let's keep Append behavior for now to be safe.

    const loader = new THREE.ObjectLoader();
    const loadedObjects = [];

    // Parse each object and add to scene
    data.objects.forEach(objData => {
        const obj = loader.parse(objData);

        // Ensure it's treated as a mesh if possible
        if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;

            detachHelperLines(obj);
            if (obj.userData && Object.prototype.hasOwnProperty.call(obj.userData, 'helper')) {
                delete obj.userData.helper;
            }

            const edgesGeo = new THREE.EdgesGeometry(obj.geometry, 15);
            const edges = new THREE.LineSegments(edgesGeo);
            edges.material.depthTest = true;
            edges.material.opacity = 1;
            edges.material.transparent = false;
            edges.material.color.set(0x000000);
            edges.matrixAutoUpdate = false;
            edges.userData.isHelper = true;
            edges.name = '__helper_edges__';
            obj.add(edges);
            obj.userData.helper = edges;

            scene.add(obj);
            state.objects.push(obj);
            loadedObjects.push(obj);
        }
    });

    if (data.objects.length === 0) {
        selectObject(null);
        return;
    }

    if (loadedObjects.length > 0) {
        // Select the last loaded object
        selectObject(loadedObjects[loadedObjects.length - 1]);
    } else {
        alert('No valid objects found in file.');
    }
}

// Listen for library load events
document.addEventListener('load-imagine-file', async (e) => {
    const filename = e.detail.filename;
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('visible');
    const baseName = filename.replace(/\.imagine$/i, '');
    const nameInput = document.getElementById('project-name-input');
    if (nameInput) nameInput.value = baseName;
    state.currentProjectName = baseName;
    state.hasProjectFile = true;

    try {
        const content = await window.electronAPI.loadFile(filename);
        const data = JSON.parse(content);

        // Clear scene for Library Open
        // Improve: moving clear logic here
        [...state.objects].forEach(obj => {
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
        });
        state.objects = [];
        selectObject(null);

        loadProjectData(data);
    } catch (err) {
        console.error(err);
        alert('Failed to load file: ' + err.message);
    } finally {
        if (overlay) overlay.classList.remove('visible');
    }
});

function saveString(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

export function normalizeGeometry(geometry) {
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

    // allow the transform tool to see the correct/new size immediately
    geometry.computeBoundingBox();
}
