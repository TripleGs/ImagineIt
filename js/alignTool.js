import * as THREE from 'three';
import { scene, camera, renderer } from './scene.js';
import { state } from './state.js';
import { saveState } from './history.js';

export class AlignTool {
    constructor() {
        this.isActive = false;
        this.handles = [];
        this.previewMeshes = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredHandle = null;

        // Group to hold all alignment visuals
        this.group = new THREE.Group();
        this.groupAdded = false;

        // Bind methods
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
    }

    activate() {
        if (this.isActive) return;
        if (state.selectedObjects.length < 2) {
            alert("Select at least 2 objects to align.");
            return;
        }

        // Add group to scene if not already added
        if (!this.groupAdded && scene) {
            scene.add(this.group);
            this.groupAdded = true;
        }

        this.isActive = true;
        this.createHandles();

        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerdown', this.onPointerDown, true);
    }

    deactivate() {
        if (!this.isActive) return;

        this.isActive = false;
        this.clearHandles();
        this.clearPreview();

        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerdown', this.onPointerDown, true);
    }

    toggle() {
        if (this.isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    createHandles() {
        this.clearHandles();

        // Calculate bounding box of all selected objects
        const selectionBox = new THREE.Box3();
        state.selectedObjects.forEach(obj => {
            selectionBox.expandByObject(obj);
        });

        const min = selectionBox.min;
        const max = selectionBox.max;
        const center = new THREE.Vector3();
        selectionBox.getCenter(center);
        const size = new THREE.Vector3();
        selectionBox.getSize(size);

        // Offset for handles to be slightly outside the bounding box
        const padding = 5;

        // Helper to create a handle
        const createHandle = (x, y, z, axis, type) => {
            const geometry = new THREE.SphereGeometry(2, 16, 16);
            const material = new THREE.MeshBasicMaterial({ color: 0x888888 });
            const handle = new THREE.Mesh(geometry, material);
            handle.position.set(x, y, z);
            handle.userData = { isAlignHandle: true, axis, type };

            // Add a black outline or circle to make it look like Tinkercad
            const outlineGeo = new THREE.RingGeometry(2, 2.5, 32);
            const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
            const outline = new THREE.Mesh(outlineGeo, outlineMat);
            outline.lookAt(camera.position); // Billboard effect
            handle.add(outline);
            handle.userData.outline = outline;

            this.group.add(handle);
            this.handles.push(handle);
        };

        // X Axis Handles (at min Y, min Z usually, or just outside the box)
        // Tinkercad places them on the ground plane or relative to the selection.
        // Let's place them along the axes relative to the selection center.

        // We'll place handles for X axis alignment along the X axis, positioned at min Y and min Z (front-left-bottom corner area)
        // Actually, Tinkercad puts them on a "grid" around the object.
        // Let's put X handles at (x_pos, center.y, min.z - padding)
        // Let's put Y handles at (min.x - padding, y_pos, center.z)
        // Let's put Z handles at (max.x + padding, min.y, z_pos) -> this is getting complicated.

        // Simple approach: 
        // X handles: varying X, fixed Y (min), fixed Z (min - padding)
        createHandle(min.x, min.y, min.z - padding, 'x', 'min');
        createHandle(center.x, min.y, min.z - padding, 'x', 'center');
        createHandle(max.x, min.y, min.z - padding, 'x', 'max');

        // Y handles: fixed X (min - padding), varying Y, fixed Z (min)
        createHandle(min.x - padding, min.y, min.z, 'y', 'min');
        createHandle(min.x - padding, center.y, min.z, 'y', 'center');
        createHandle(min.x - padding, max.y, min.z, 'y', 'max');

        // Z handles: fixed X (max + padding), fixed Y (min), varying Z
        createHandle(max.x + padding, min.y, min.z, 'z', 'min');
        createHandle(max.x + padding, min.y, center.z, 'z', 'center');
        createHandle(max.x + padding, min.y, max.z, 'z', 'max');
    }

    clearHandles() {
        while (this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
        this.handles = [];
    }

    update() {
        if (!this.isActive) return;

        // Billboard the outlines
        this.handles.forEach(handle => {
            if (handle.userData.outline) {
                handle.userData.outline.lookAt(camera.position);
            }
        });
    }

    onPointerMove(event) {
        if (!this.isActive) return;

        const rect = renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, camera);

        const intersects = this.raycaster.intersectObjects(this.handles, true);

        if (intersects.length > 0) {
            // Find the root handle object (in case we hit the outline child)
            let hitObject = intersects[0].object;
            while (hitObject && !hitObject.userData.isAlignHandle && hitObject.parent) {
                hitObject = hitObject.parent;
            }

            if (hitObject && hitObject.userData.isAlignHandle) {
                const handle = hitObject;
                if (this.hoveredHandle !== handle) {
                    this.hoveredHandle = handle;
                    this.highlightHandle(handle);
                    this.showPreview(handle.userData.axis, handle.userData.type);
                }
            }
        } else {
            if (this.hoveredHandle) {
                this.resetHandle(this.hoveredHandle);
                this.hoveredHandle = null;
                this.clearPreview();
            }
        }
    }

    onPointerDown(event) {
        if (!this.isActive || !this.hoveredHandle) return;

        event.stopPropagation();

        // Prevent deselecting objects when clicking a handle
        // We might need to stop propagation if the selection logic is also listening on window
        // But selection logic checks for renderer.domElement target. 
        // If handles are part of the scene, selection logic might pick them up?
        // Selection logic ignores things that are not in state.objects usually.

        const axis = this.hoveredHandle.userData.axis;
        const type = this.hoveredHandle.userData.type;

        this.performAlignment(axis, type);

        // Re-calculate handles for new positions
        this.createHandles();
        this.clearPreview();
    }

    highlightHandle(handle) {
        handle.material.color.set(0xff0000); // Red highlight
    }

    resetHandle(handle) {
        handle.material.color.set(0x888888);
    }

    showPreview(axis, type) {
        this.clearPreview();

        // Calculate where objects would go
        const { targetPosition } = this.calculateAlignmentTarget(axis, type);

        state.selectedObjects.forEach(obj => {
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            let newPos = obj.position.clone();

            // Calculate new position for this axis
            let desiredCenter;
            if (type === 'min') {
                desiredCenter = targetPosition + size[axis] / 2;
            } else if (type === 'max') {
                desiredCenter = targetPosition - size[axis] / 2;
            } else {
                desiredCenter = targetPosition;
            }

            const currentPosToCenter = center[axis] - obj.position[axis];
            newPos[axis] = desiredCenter - currentPosToCenter;

            // Create a ghost box
            const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffaa00,
                transparent: true,
                opacity: 0.3,
                wireframe: true
            });
            const ghost = new THREE.Mesh(geometry, material);
            ghost.position.copy(newPos);
            ghost.rotation.copy(obj.rotation); // Approximation, might be off if rotated

            // Better approximation for rotated objects: clone the object and change material
            // But for simple primitives BoxGeometry is okay. For complex meshes, cloning is better.

            this.group.add(ghost);
            this.previewMeshes.push(ghost);
        });
    }

    clearPreview() {
        this.previewMeshes.forEach(mesh => this.group.remove(mesh));
        this.previewMeshes = [];
    }

    calculateAlignmentTarget(axis, type) {
        const objectInfo = state.selectedObjects.map(obj => {
            const box = new THREE.Box3().setFromObject(obj);
            return {
                min: box.min[axis],
                max: box.max[axis],
                center: (box.min[axis] + box.max[axis]) / 2
            };
        });

        let targetPosition;
        if (type === 'min') {
            targetPosition = Math.min(...objectInfo.map(i => i.min));
        } else if (type === 'max') {
            targetPosition = Math.max(...objectInfo.map(i => i.max));
        } else {
            // Average center
            targetPosition = objectInfo.reduce((sum, i) => sum + i.center, 0) / objectInfo.length;
        }
        return { targetPosition };
    }

    performAlignment(axis, type) {
        saveState();
        const { targetPosition } = this.calculateAlignmentTarget(axis, type);

        state.selectedObjects.forEach(obj => {
            const box = new THREE.Box3().setFromObject(obj);
            const size = box.max[axis] - box.min[axis];
            const center = (box.min[axis] + box.max[axis]) / 2;

            let desiredCenter;
            if (type === 'min') {
                desiredCenter = targetPosition + size / 2;
            } else if (type === 'max') {
                desiredCenter = targetPosition - size / 2;
            } else {
                desiredCenter = targetPosition;
            }

            const currentPosToCenter = center - obj.position[axis];
            obj.position[axis] = desiredCenter - currentPosToCenter;
        });
    }
}

export const alignTool = new AlignTool();
