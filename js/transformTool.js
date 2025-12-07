
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
        // Optimization: Don't remove/dispose, just hide.
        // We reuse these handles in updateHandles via Object Pooling.
        this.handles.forEach(handle => {
            handle.visible = false;
        });
        // We keep this.handles array populated.
        this.lastSelected = null;
    }

    updateHandles() {
        if (state.selectedObjects.length !== 1) {
            this.clearHandles();
            return;
        }

        const object = state.selectedObjects[0];

        // Ensure we are watching the active object
        if (this.lastSelected !== object) {
            this.clearHandles();
            this.lastSelected = object;
        }

        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        const bbox = object.geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        const min = bbox.min;
        const max = bbox.max;

        // --- Adaptive Orientation Logic ---
        // Find which local axis is pointing "Down" in World Space
        const axes = [
            { dir: new THREE.Vector3(0, -1, 0), name: '-y', localVal: min.y, oppositeVal: max.y, u: 'x', v: 'z' },
            { dir: new THREE.Vector3(0, 1, 0), name: '+y', localVal: max.y, oppositeVal: min.y, u: 'x', v: 'z' },
            { dir: new THREE.Vector3(-1, 0, 0), name: '-x', localVal: min.x, oppositeVal: max.x, u: 'z', v: 'y' }, // If X is up/down, Z/Y are plane
            { dir: new THREE.Vector3(1, 0, 0), name: '+x', localVal: max.x, oppositeVal: min.x, u: 'z', v: 'y' },
            { dir: new THREE.Vector3(0, 0, -1), name: '-z', localVal: min.z, oppositeVal: max.z, u: 'x', v: 'y' },
            { dir: new THREE.Vector3(0, 0, 1), name: '+z', localVal: max.z, oppositeVal: min.z, u: 'x', v: 'y' }
        ];

        let bestAxis = axes[0];
        let maxDot = -Infinity;

        // We want the face that is physically lowest.
        // A face normal points OUT.
        // Bottom face normal points DOWN (0, -1, 0).
        // So we want the local axis whose world direction is closest to (0, -1, 0).

        axes.forEach(axis => {
            const worldDir = axis.dir.clone().applyQuaternion(object.quaternion).normalize();
            const dot = worldDir.dot(new THREE.Vector3(0, -1, 0));
            if (dot > maxDot) {
                maxDot = dot;
                bestAxis = axis;
            }
        });

        // "Base" is at bestAxis.localVal on axis.
        // "Top" is at bestAxis.oppositeVal.

        // Define handle points on this local plane.
        // Limits for U and V axes
        const uMin = min[bestAxis.u];
        const uMax = max[bestAxis.u];
        const uMid = (uMin + uMax) / 2;

        const vMin = min[bestAxis.v];
        const vMax = max[bestAxis.v];
        const vMid = (vMin + vMax) / 2;

        const baseLevel = bestAxis.localVal;

        // Helper to construct vector given u,v,base coords
        const makeVec = (u, v, base) => {
            const v3 = new THREE.Vector3();
            v3[bestAxis.u] = u;
            v3[bestAxis.v] = v;
            // The main axis component
            if (bestAxis.name.includes('x')) v3.x = base;
            if (bestAxis.name.includes('y')) v3.y = base;
            if (bestAxis.name.includes('z')) v3.z = base;
            return v3;
        };

        // Helper to make direction vector (normalized)
        const makeDir = (u, v, baseDir) => {
            const v3 = new THREE.Vector3();
            v3[bestAxis.u] = u;
            v3[bestAxis.v] = v;
            // The scaling direction along the main axis should be 0 for base handles usually?
            // Actually, for "Corner" handles, we scale in 2 dims (U and V).
            // For "Side" handles, we scale in 1 dim.

            // The 'direction' stored involves how the handle affects scale.
            // If I pull the Right handle (+X), I scale X.
            // The logic in handleDrag() uses `dir.x` etc.
            // So we just need to return the direction vector in local space consistent with the handle.

            // BaseDir is 0 for base ring handles (no height scaling).
            if (bestAxis.name.includes('x')) v3.x = baseDir;
            if (bestAxis.name.includes('y')) v3.y = baseDir;
            if (bestAxis.name.includes('z')) v3.z = baseDir;
            return v3;
        };

        const handleDefs = [
            // CORNERS (4)
            // U-Min, V-Min
            { pos: makeVec(uMin, vMin, baseLevel), dir: makeDir(-1, -1, 0) },
            // U-Max, V-Min
            { pos: makeVec(uMax, vMin, baseLevel), dir: makeDir(1, -1, 0) },
            // U-Min, V-Max
            { pos: makeVec(uMin, vMax, baseLevel), dir: makeDir(-1, 1, 0) },
            // U-Max, V-Max
            { pos: makeVec(uMax, vMax, baseLevel), dir: makeDir(1, 1, 0) },

            // SIDES (4)
            // U-Mid, V-Min (Front equivalent)
            { pos: makeVec(uMid, vMin, baseLevel), dir: makeDir(0, -1, 0) },
            // U-Mid, V-Max (Back)
            { pos: makeVec(uMid, vMax, baseLevel), dir: makeDir(0, 1, 0) },
            // U-Min, V-Mid (Left)
            { pos: makeVec(uMin, vMid, baseLevel), dir: makeDir(-1, 0, 0) },
            // U-Max, V-Mid (Right)
            { pos: makeVec(uMax, vMid, baseLevel), dir: makeDir(1, 0, 0) },

            // TOP (1) - Opposite face center
            { pos: makeVec(uMid, vMid, bestAxis.oppositeVal), dir: makeDir(0, 0, 1) }
            // Ideally Top handle scales along the main axis. 
            // Note: makeDir sets '0' for main axis for base handles.
            // For Top handle, we want it to scale the main axis.
            // If bestAxis is +Y, direction should be (0,1,0). if -Y, direction should be (0,-1,0)?
            // Wait, handleDrag logic interprets non-zero component as "scale this axis".
            // If I pull the +Y handle UP, dy is +ve. dSize is +ve. Size grows. Correct.
            // If I pull the -Y handle DOWN, dy is -ve. dir.y is -1. dSize is +ve. Size grows. Correct.

            // So, the direction for the Top Handle should match the logical direction of that face.
            // If Top Face is at max.y, dir is +1 Y.
            // If Top Face is at min.y (because object is flipped?? No, top is always opposite to bottom).
            // If Bottom is max.y (Upside Down), then Top is min.y.
            // Handle at min.y should have direction -1 Y.
        ];

        // Correct the TOP handle direction logic:
        const topHandle = handleDefs[8];
        const isMaxFace = (bestAxis.oppositeVal === max[bestAxis.name.charAt(1)]); // e.g. max.y
        // If opposite is Max, direction is +1. If Min, -1.
        if (bestAxis.name.includes('x')) topHandle.dir.x = isMaxFace ? 1 : -1;
        if (bestAxis.name.includes('y')) topHandle.dir.y = isMaxFace ? 1 : -1;
        if (bestAxis.name.includes('z')) topHandle.dir.z = isMaxFace ? 1 : -1;


        // Ensure we have enough handles
        while (this.handles.length < handleDefs.length) {
            this.createNewHandle();
        }

        // Hide extra handles (instead of removing them)
        for (let i = handleDefs.length; i < this.handles.length; i++) {
            this.handles[i].visible = false;
        }

        // Update positions
        handleDefs.forEach((def, index) => {
            const handle = this.handles[index];
            handle.visible = true; // Make sure it's visible

            // Calculate World Position
            const worldPos = def.pos.clone().applyMatrix4(object.matrixWorld);
            handle.position.copy(worldPos);

            // Update Data
            handle.userData.direction = def.dir;

            // Update Color
            // Top handle (index 8) is usually distinct? Or just by nonZero components.
            // Corner vs Side logic:
            const nonZero = Math.abs(def.dir.x) + Math.abs(def.dir.y) + Math.abs(def.dir.z);
            handle.material.color.set(nonZero > 1 ? 0xffffff : 0x333333);
        });
    }

    createNewHandle() {
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthTest: false,
            transparent: true
        });

        const handle = new THREE.Mesh(geometry, material);
        handle.userData = { isTransformHandle: true };
        handle.renderOrder = 999;

        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
        handle.add(line);

        this.group.add(handle);
        this.handles.push(handle);
        return handle;
    }

    createHandleLocal(localPosition, direction) {
        // Deprecated by updateHandles logic
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
