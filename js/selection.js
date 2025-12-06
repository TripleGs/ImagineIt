import * as THREE from 'three';
import { state } from './state.js';
import { orbitControls } from './controls.js';
import { scene } from './scene.js';
import { saveState } from './history.js';

let onSelectionChangeCallbacks = [];
let camera, renderer;

export function onSelectionChange(callback) {
    onSelectionChangeCallbacks.push(callback);
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

    const rect = renderer.domElement.getBoundingClientRect();
    state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    state.raycaster.setFromCamera(state.mouse, camera);
    const intersects = state.raycaster.intersectObjects(state.objects);

    const isMultiSelect = event.ctrlKey || event.metaKey;

    if (intersects.length > 0) {
        const object = intersects[0].object;

        if (isMultiSelect) {
            // Multi-select mode
            toggleObjectSelection(object);
        } else {
            // Single select mode
            if (!state.selectedObjects.includes(object)) {
                selectObject(object);
            }
            // Start dragging all selected objects
            startDrag(intersects[0].point);
        }
    } else {
        // Clicked on empty space - deselect all
        if (!isMultiSelect) {
            selectObject(null);
        }
    }
}

function onPointerMove(event) {
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
    }
}

function onPointerUp(event) {
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

    // Update primary selection
    state.selectedObject = state.selectedObjects.length > 0 ? state.selectedObjects[0] : null;

    // Notify listeners
    onSelectionChangeCallbacks.forEach(cb => cb(state.selectedObjects));
}

function addWireframeHelper(object) {
    if (object.userData.helper) return;

    const wireframeGeo = new THREE.WireframeGeometry(object.geometry);
    const wireframe = new THREE.LineSegments(wireframeGeo);
    wireframe.material.depthTest = false;
    wireframe.material.opacity = 0.25;
    wireframe.material.transparent = true;
    wireframe.material.color.set(0x000000);

    object.add(wireframe);
    object.userData.helper = wireframe;
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
    }

    // Notify listeners
    onSelectionChangeCallbacks.forEach(cb => cb(state.selectedObjects));
}
