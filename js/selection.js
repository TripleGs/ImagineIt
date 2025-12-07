import * as THREE from 'three';
import { state } from './state.js';
import { orbitControls } from './controls.js';
import { scene } from './scene.js';
import { saveState } from './history.js';
import { transformTool } from './transformTool.js';

let onSelectionChangeCallbacks = [];
let camera, renderer;

export function onSelectionChange(callback) {
    onSelectionChangeCallbacks.push(callback);
}

// Exported for UI
export function selectAll() {
    // Clear existing
    state.selectedObjects.forEach(obj => {
        if (obj.userData.helper) {
            obj.remove(obj.userData.helper);
            obj.userData.helper = null;
        }
    });

    // Select all
    state.selectedObjects = [...state.objects];

    state.selectedObjects.forEach(obj => {
        addWireframeHelper(obj);
    });

    // Deactivate transform tool if multiple
    if (state.selectedObjects.length === 1) {
        state.selectedObject = state.selectedObjects[0];
        transformTool.activate();
    } else {
        state.selectedObject = null;
        transformTool.deactivate();
    }

    // Notify
    onSelectionChangeCallbacks.forEach(cb => cb(state.selectedObjects));
}

export function initSelection(cam, rend) {
    camera = cam;
    renderer = rend;

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
}


function onPointerDown(event) {
    if (state.toolMode !== 'select') return;
    if (event.target !== renderer.domElement) return;

    const isMultiSelect = event.ctrlKey || event.metaKey;

    if (isMultiSelect) {
        // Box Selection Mode Start
        state.isBoxSelecting = true;
        state.boxStartPoint = { x: event.clientX, y: event.clientY };

        // Disable orbit controls to prevent panning
        if (orbitControls) orbitControls.enabled = false;

        const box = document.getElementById('selection-box');
        box.style.left = event.clientX + 'px';
        box.style.top = event.clientY + 'px';
        box.style.width = '0px';
        box.style.height = '0px';
        box.style.display = 'block';
        return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    state.raycaster.setFromCamera(state.mouse, camera);
    const intersects = state.raycaster.intersectObjects(state.objects);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        if (!state.selectedObjects.includes(object)) {
            selectObject(object);
        }
        startDrag(intersects[0].point);
    } else {
        selectObject(null);
    }
}

function onPointerMove(event) {
    if (state.isBoxSelecting) {
        const start = state.boxStartPoint;
        const current = { x: event.clientX, y: event.clientY };

        const minX = Math.min(start.x, current.x);
        const maxX = Math.max(start.x, current.x);
        const minY = Math.min(start.y, current.y);
        const maxY = Math.max(start.y, current.y);

        const box = document.getElementById('selection-box');
        box.style.left = minX + 'px';
        box.style.top = minY + 'px';
        box.style.width = (maxX - minX) + 'px';
        box.style.height = (maxY - minY) + 'px';
        return;
    }

    if (!state.isDragging || state.selectedObjects.length === 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    state.raycaster.setFromCamera(state.mouse, camera);

    if (state.raycaster.ray.intersectPlane(state.dragPlane, state.dragIntersection)) {
        let newPosition = state.dragIntersection.clone();

        // Apply snapping if enabled
        if (state.snapValue > 0) {
            newPosition.x = Math.round(newPosition.x / state.snapValue) * state.snapValue;
            newPosition.y = Math.round(newPosition.y / state.snapValue) * state.snapValue;
            newPosition.z = Math.round(newPosition.z / state.snapValue) * state.snapValue;
        }

        // Calculate offset from primary object's start position
        state.currentOffset.subVectors(newPosition, state.dragStartPosition);

        // Move all selected objects by the same offset
        state.selectedObjects.forEach(obj => {
            const startPos = state.dragStartPositions.get(obj);
            if (startPos) {
                obj.position.copy(startPos).add(state.currentOffset);
            }
        });

        // Notify UI
        notifyDragUpdate();

        // Update transform handles if active
        if (state.selectedObjects.length === 1) {
            transformTool.updateHandles();
        }
    }
}

function onPointerUp(event) {
    if (state.isBoxSelecting) {
        state.isBoxSelecting = false;
        document.getElementById('selection-box').style.display = 'none';

        // Use standard Frustum checking? Or simple Screen Space check?
        // Screen space is enough for "Box Select".

        // Define selection rectangle in screen coords
        const start = state.boxStartPoint;
        const end = { x: event.clientX, y: event.clientY };
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        // Avoid selecting if simple click
        if (maxX - minX < 5 && maxY - minY < 5) return;

        // Check all objects
        const rect = renderer.domElement.getBoundingClientRect();

        // If explicitly box selecting, do we append or replace?
        // Usually add to selection if Shift, replace if not?
        // But we are in "Ctrl" mode.
        // Let's Add to existing selection for now (Union).
        // Actually, user said "cntrl cmd select".
        // Let's default to Union.

        state.objects.forEach(obj => {
            // Project object position to screen
            // Use center? Or vertex check? Center is faster.
            const pos = obj.position.clone();
            pos.project(camera); // -1 to 1

            // Convert to screen px
            const x = (pos.x * .5 + .5) * rect.width + rect.left;
            const y = (pos.y * -.5 + .5) * rect.height + rect.top; // y is inverted in CSS

            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                if (!state.selectedObjects.includes(obj)) {
                    state.selectedObjects.push(obj);
                    addWireframeHelper(obj);
                }
            }
        });

        // Update UI
        if (state.selectedObjects.length === 1) {
            transformTool.activate();
        } else {
            transformTool.deactivate();
        }
        onSelectionChangeCallbacks.forEach(cb => cb(state.selectedObjects));

        // Re-enable orbit controls
        if (orbitControls) orbitControls.enabled = true;
        return;
    }

    if (state.isDragging) {
        state.isDragging = false;
        orbitControls.enabled = true;

        // Save state after dragging ends
        saveState();
    }
}

function startDrag(point) {
    if (state.selectedObjects.length === 0) return;

    state.isDragging = true;
    orbitControls.enabled = false;

    // Store start positions for all selected objects
    state.dragStartPositions.clear();
    state.selectedObjects.forEach(obj => {
        state.dragStartPositions.set(obj, obj.position.clone());
    });

    // Use the primary selected object for the drag plane
    const primaryObject = state.selectedObjects[0];
    state.dragStartPosition.copy(primaryObject.position);

    // Set up drag plane at the object's current position, parallel to ground
    state.dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        primaryObject.position
    );
}

function createMovementHelper() {
    removeMovementHelper();

    const group = new THREE.Group();

    // Create lines for X, Y, Z axes showing movement
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    // We'll update these in updateMovementHelper
    const xLineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0)
    ]);
    const yLineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0)
    ]);
    const zLineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0)
    ]);

    const xLine = new THREE.Line(xLineGeometry, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    const yLine = new THREE.Line(yLineGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    const zLine = new THREE.Line(zLineGeometry, new THREE.LineBasicMaterial({ color: 0x0000ff }));

    xLine.userData.axis = 'x';
    yLine.userData.axis = 'y';
    zLine.userData.axis = 'z';

    group.add(xLine);
    group.add(yLine);
    group.add(zLine);

    state.movementHelper = group;
    scene.add(group);
}

export function updateMovementHelper() {
    if (!state.movementHelper || !state.selectedObject) return;

    const start = state.dragStartPosition;
    const current = state.selectedObject.position;

    // Update X line
    const xLine = state.movementHelper.children.find(c => c.userData.axis === 'x');
    if (xLine) {
        const positions = xLine.geometry.attributes.position.array;
        positions[0] = start.x;
        positions[1] = start.y;
        positions[2] = start.z;
        positions[3] = current.x;
        positions[4] = start.y;
        positions[5] = start.z;
        xLine.geometry.attributes.position.needsUpdate = true;
    }

    // Update Y line
    const yLine = state.movementHelper.children.find(c => c.userData.axis === 'y');
    if (yLine) {
        const positions = yLine.geometry.attributes.position.array;
        positions[0] = current.x;
        positions[1] = start.y;
        positions[2] = start.z;
        positions[3] = current.x;
        positions[4] = current.y;
        positions[5] = start.z;
        yLine.geometry.attributes.position.needsUpdate = true;
    }

    // Update Z line
    const zLine = state.movementHelper.children.find(c => c.userData.axis === 'z');
    if (zLine) {
        const positions = zLine.geometry.attributes.position.array;
        positions[0] = current.x;
        positions[1] = current.y;
        positions[2] = start.z;
        positions[3] = current.x;
        positions[4] = current.y;
        positions[5] = current.z;
        zLine.geometry.attributes.position.needsUpdate = true;
    }
}

export function showMovementHelper() {
    if (!state.movementHelper && state.selectedObject) {
        createMovementHelper();
    }
}

function removeMovementHelper() {
    if (state.movementHelper) {
        scene.remove(state.movementHelper);
        state.movementHelper = null;
    }
}

function notifyDragUpdate() {
    // Notify UI about drag update
    window.dispatchEvent(new CustomEvent('objectDragged', {
        detail: { offset: state.currentOffset }
    }));
}

function toggleObjectSelection(object) {
    const index = state.selectedObjects.indexOf(object);

    if (index > -1) {
        // Deselect this object
        state.selectedObjects.splice(index, 1);
        if (object.userData.helper) {
            object.remove(object.userData.helper);
            object.userData.helper = null;
        }
    } else {
        // Add to selection
        state.selectedObjects.push(object);
        addWireframeHelper(object);
    }

    // Update Transform Tool state
    if (state.selectedObjects.length === 1) {
        transformTool.activate();
    } else {
        transformTool.deactivate();
        // If > 1, maybe show align tool or different handles later
    }

    // Update primary selection
    state.selectedObject = state.selectedObjects.length > 0 ? state.selectedObjects[0] : null;

    // Notify listeners
    onSelectionChangeCallbacks.forEach(cb => cb(state.selectedObjects));
}

function addWireframeHelper(object) {
    // Disabled for performance with complex STLs
    /*
    if (object.userData.helper) return;

    const wireframeGeo = new THREE.WireframeGeometry(object.geometry);
    const wireframe = new THREE.LineSegments(wireframeGeo);
    wireframe.material.depthTest = false;
    wireframe.material.opacity = 0.25;
    wireframe.material.transparent = true;
    wireframe.material.color.set(0x000000);

    object.add(wireframe);
    object.userData.helper = wireframe;
    */
}

export function selectObject(object) {
    // Clean up previous selection
    state.selectedObjects.forEach(obj => {
        if (obj.userData.helper) {
            obj.remove(obj.userData.helper);
            obj.userData.helper = null;
        }
    });

    removeMovementHelper();

    state.selectedObjects = [];
    state.selectedObject = object;

    if (object) {
        state.selectedObjects.push(object);

        // Store initial position
        state.dragStartPosition.copy(object.position);
        state.currentOffset.set(0, 0, 0);

        // Add wireframe helper
        addWireframeHelper(object);

        // Activate Transform Tool for single selection
        if (state.selectedObjects.length === 1) {
            transformTool.activate();
        }
    } else {
        transformTool.deactivate();
    }

    // Notify listeners
    onSelectionChangeCallbacks.forEach(cb => cb(state.selectedObjects));
}
