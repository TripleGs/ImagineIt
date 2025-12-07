
import * as THREE from 'three';
import { scene, camera, renderer, updateGrid } from './scene.js';
import { state } from './state.js';
import { saveState } from './history.js';
import { updatePropertiesPanel } from './ui.js';

export class TransformTool {
    constructor() {
        this.isActive = false;
        this.handles = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredHandle = null;
        this.activeHandle = null;
        this.initialDragPoint = null;
        this.initialObjectScale = new THREE.Vector3();
        this.initialObjectPosition = new THREE.Vector3();

        // Group to hold all transform handles
        this.group = new THREE.Group();
        this.groupAdded = false;

        // Bind methods
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
    }

    activate() {
        if (this.isActive) return;

        // Add group to scene if not already added
        if (!this.groupAdded && scene) {
            scene.add(this.group);
            this.groupAdded = true;
        }

        this.isActive = true;

        // Listeners for interaction
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerdown', this.onPointerDown, true); // Capture phase to block selection
        window.addEventListener('pointerup', this.onPointerUp);

        this.updateHandles();
    }

    deactivate() {
        if (!this.isActive) return;

        this.isActive = false;
        this.clearHandles();

        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerdown', this.onPointerDown, true);
        window.removeEventListener('pointerup', this.onPointerUp);
    }

    update() {
        if (!this.isActive) return;

        // If selection changed externally, update handles
        // We can check if handles match current selection
        // For now, rely on explicit calls or check active object
        if (state.selectedObjects.length === 1 && (!this.lastSelected || this.lastSelected !== state.selectedObjects[0])) {
            this.updateHandles();
        } else if (state.selectedObjects.length !== 1) {
            this.clearHandles();
        }
    }

    createHandle(position, axis, direction) {
        // Create a small cube handle
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        // Color based on axis or standard white/black for corners/edges?
        // Tinkercad uses: 
        // - White Squares for Corners (scale 2 axes)
        // - Black Squares for Mid-points (scale 1 axis)
        // - White Cone for Z-lift (move Y)

        // Let's implement simplified corner/side logic.
        // Corner: Scales relevant X/Z dimensions.
        // Top: Scales Y.

        let color = 0xffffff; // White for corners
        let isCorner = false;

        // Simple logic: if direction has 2 or more non-zero components (excluding Y for now if strictly planar), it's a corner
        // Actually, let's categorize:
        // direction: [x, y, z] -> e.g. [1, 0, 1] is corner. [1, 0, 0] is side.

        const nonZero = Math.abs(direction.x) + Math.abs(direction.y) + Math.abs(direction.z);
        if (nonZero === 1) {
            color = 0x333333; // Dark/Black for sides
        }

        const material = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            depthTest: false,
            transparent: true
        });

        const handle = new THREE.Mesh(geometry, material);
        handle.position.copy(position);
        handle.userData = {
            isTransformHandle: true,
            direction: direction
        };
        handle.renderOrder = 999; // Always on top

        // Add outline for visibility
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
        handle.add(line);

        this.group.add(handle);
        this.handles.push(handle);
    }

    clearHandles() {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        this.handles = [];
        this.lastSelected = null;
    }

    updateHandles() {
        this.clearHandles();

        if (state.selectedObjects.length !== 1) return;

        const object = state.selectedObjects[0];
        this.lastSelected = object;

        // Calculate bounding box in world space? 
        // Or local? Handles should rotate with object?
        // Tinkercad handles rotate with object usually.
        // Let's place handles in object space and parent them to a group that follows object transform, 
        // OR calculate positions in world space.
        // World space is easier for "Drag to resize" logic usually if we want alignment to grid?
        // But if object is rotated 45deg, dragging a corner should scale along that 45deg axis.

        // Let's attach handles to the object temporarily or do math.
        // Easier: Transform controls should probably align with object rotation.

        const box = new THREE.BoxGeometry(1, 1, 1); // Unit box to find localized positions?
        // No, let's use the object's geometry bounding box.

        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        const bbox = object.geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        // Generate handles relative to center
        // Grid of 3x3x3 points?
        // We want:
        // 4 Bottom Corners (X/Z scaling)
        // 4 Bottom Mid-points (X or Z scaling)
        // 1 Top Center (Y scaling)

        const min = bbox.min;
        const max = bbox.max;
        const midX = (min.x + max.x) / 2;
        const midY = (min.y + max.y) / 2; // Actually we want handles at min.y usually? Or mid?
        const midZ = (min.z + max.z) / 2;

        const yPos = min.y; // Handles at base?

        // Z Min/Max, X Min/Max
        // Corners
        this.createHandleLocal(new THREE.Vector3(min.x, yPos, min.z), new THREE.Vector3(-1, 0, -1)); // Front-Left
        this.createHandleLocal(new THREE.Vector3(max.x, yPos, min.z), new THREE.Vector3(1, 0, -1)); // Front-Right
        this.createHandleLocal(new THREE.Vector3(min.x, yPos, max.z), new THREE.Vector3(-1, 0, 1)); // Back-Left
        this.createHandleLocal(new THREE.Vector3(max.x, yPos, max.z), new THREE.Vector3(1, 0, 1)); // Back-Right

        // Sides
        this.createHandleLocal(new THREE.Vector3(midX, yPos, min.z), new THREE.Vector3(0, 0, -1)); // Front
        this.createHandleLocal(new THREE.Vector3(midX, yPos, max.z), new THREE.Vector3(0, 0, 1)); // Back
        this.createHandleLocal(new THREE.Vector3(min.x, yPos, midZ), new THREE.Vector3(-1, 0, 0)); // Left
        this.createHandleLocal(new THREE.Vector3(max.x, yPos, midZ), new THREE.Vector3(1, 0, 0)); // Right

        // Top
        this.createHandleLocal(new THREE.Vector3(midX, max.y, midZ), new THREE.Vector3(0, 1, 0)); // Top
    }

    createHandleLocal(localPosition, direction) {
        const object = state.selectedObjects[0];

        // Transform local position to world
        const worldPos = localPosition.clone().applyMatrix4(object.matrixWorld);

        this.createHandle(worldPos, null, direction);
    }

    onPointerMove(event) {
        if (!this.isActive) return;

        const rect = renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.activeHandle) {
            // Dragging behavior
            this.handleDrag();
            return;
        }

        this.raycaster.setFromCamera(this.mouse, camera);

        // Intersect with handles specifically
        const intersects = this.raycaster.intersectObjects(this.handles, false); // No recursive as handles are simple meshes

        if (intersects.length > 0) {
            const handle = intersects[0].object;
            if (this.hoveredHandle !== handle) {
                this.hoveredHandle = handle;
                handle.material.color.set(0xff0000); // Highlight
                document.body.style.cursor = 'pointer';
            }
        } else {
            if (this.hoveredHandle) {
                // Reset color
                const dir = this.hoveredHandle.userData.direction;
                const nonZero = Math.abs(dir.x) + Math.abs(dir.y) + Math.abs(dir.z);
                this.hoveredHandle.material.color.set(nonZero === 1 ? 0x333333 : 0xffffff);

                this.hoveredHandle = null;
                document.body.style.cursor = 'default';
            }
        }
    }

    onPointerDown(event) {
        if (!this.isActive || !this.hoveredHandle) return;

        event.stopPropagation(); // Prevent object selection

        this.activeHandle = this.hoveredHandle;
        state.isDragging = true; // Block orbit controls

        const object = state.selectedObjects[0];

        // Store initial state
        saveState();
        this.initialObjectScale.copy(object.scale);
        this.initialObjectPosition.copy(object.position);

        // Find intersection point on a plane
        this.raycaster.setFromCamera(this.mouse, camera);

        // Define a drag plane.
        // If Y scaling, plane is vertical or facing camera?
        // If X/Z scaling, plane is horizontal (ground) usually.
        const dir = this.activeHandle.userData.direction;

        if (Math.abs(dir.y) > 0.5) {
            // Vertical Drag - Plane passing through handle, facing camera?
            // Simple: Vertical plane aligned with camera view direction
            const normal = new THREE.Vector3();
            camera.getWorldDirection(normal);
            normal.y = 0;
            normal.normalize();
            // Or just a plane perpendicular to camera?
            // Let's use a plane at the handle's position with normal pointing to X or Z?
            // Actually for Y scaling, we likely just want a vertical plane. 
            // Let's try camera-facing vertical plane.
            this.dragPlane = new THREE.Plane();
            this.dragPlane.setFromNormalAndCoplanarPoint(
                camera.position.clone().sub(this.activeHandle.position).setY(0).normalize(), // pseudo-billboard
                this.activeHandle.position
            );
        } else {
            // Horizontal Drag - Ground plane
            this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.activeHandle.position.y);
        }

        const intersection = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.dragPlane, intersection);
        this.initialDragPoint = intersection;
    }

    onPointerUp(event) {
        if (this.activeHandle) {
            this.activeHandle = null;
            state.isDragging = false;
        }
    }

    handleDrag() {
        if (!this.activeHandle || !this.initialDragPoint) return;

        this.raycaster.setFromCamera(this.mouse, camera);
        const currentPoint = new THREE.Vector3();

        if (!this.raycaster.ray.intersectPlane(this.dragPlane, currentPoint)) return;

        // Calculate Delta in world space
        const delta = currentPoint.clone().sub(this.initialDragPoint);

        // Snap delta?
        if (state.snapValue > 0) {
            delta.x = Math.round(delta.x / state.snapValue) * state.snapValue;
            delta.y = Math.round(delta.y / state.snapValue) * state.snapValue;
            delta.z = Math.round(delta.z / state.snapValue) * state.snapValue;
        }

        const object = state.selectedObjects[0];
        const dir = this.activeHandle.userData.direction; // Local direction relative to box center (-1, 0, -1 etc)

        // We need to apply scaling.
        // If direction is (1, 0, 0) -> Scale X.
        // Delta needs to be projected onto the object's local axes.

        // Get object's local X, Y, Z axes in world space
        const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(object.quaternion);
        const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
        const axisZ = new THREE.Vector3(0, 0, 1).applyQuaternion(object.quaternion);

        // Project delta onto axes
        const dx = delta.dot(axisX);
        const dy = delta.dot(axisY);
        const dz = delta.dot(axisZ);

        // Resize logic:
        // If direction.x is 1 (Positive X face), dragging +dx increases size.
        // If direction.x is -1 (Negative X face), dragging -dx increases size?

        // We also need to move the position so the OPPOSITE face stays valid.
        // Current scale
        const currentScale = this.initialObjectScale.clone();

        // Original size in local units?
        // Assuming geometry is normalized to roughly 1 or dimensions known?
        // Objects.js primitives have dimensions passed to constructor, 
        // but mesh.scale might be 1. 
        // We generally modify .scale.

        // We need the unscaled size to know how much scale factor changes.
        // Bounding box size (world) = local_bbox_size * scale.

        const bbox = object.geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);

        // Allow scaling
        const newScale = currentScale.clone();
        const startPos = this.initialObjectPosition.clone();
        const posOffset = new THREE.Vector3();

        if (dir.x !== 0) {
            // Change in width
            const dSize = dx * dir.x; // If pulling right (+1) and moving right (+dx) -> grow
            const newSize = (size.x * currentScale.x) + dSize;
            if (newSize > 0.1) {
                newScale.x = newSize / size.x;
                // Move center: Shift by dSize/2 in direction of drag
                posOffset.add(axisX.clone().multiplyScalar(dx / 2));
            }
        }

        if (dir.y !== 0) {
            const dSize = dy * dir.y;
            const newSize = (size.y * currentScale.y) + dSize;
            if (newSize > 0.1) {
                newScale.y = newSize / size.y;
                posOffset.add(axisY.clone().multiplyScalar(dy / 2));
            }
        }

        if (dir.z !== 0) {
            const dSize = dz * dir.z;
            const newSize = (size.z * currentScale.z) + dSize;
            if (newSize > 0.1) {
                newScale.z = newSize / size.z;
                posOffset.add(axisZ.clone().multiplyScalar(dz / 2));
            }
        }

        object.scale.copy(newScale);
        object.position.copy(startPos).add(posOffset);

        updatePropertiesPanel([object]);

        // Update handles
        this.updateHandles();
    }
}

export const transformTool = new TransformTool();
