import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { state } from './state.js';

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

function saveString(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}
