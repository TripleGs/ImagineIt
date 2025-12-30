
import * as THREE from 'three';
import { scene, camera, renderer, updateGrid } from './scene.js';
import { state } from './state.js';
import { saveState } from './history.js';


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

        // Track the current sign of the drag (1 or -1) for mirroring
        this.dragScaleSigns = new THREE.Vector3(1, 1, 1);

        // Bind methods
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
    }

    activate() {
        if (this.isActive) return;

        // Add group to scene if not already added
        if (!this.groupAdded) {
            if (scene) {
                scene.add(this.group);
                this.groupAdded = true;
            } else {
                console.error("TransformTool: Scene not found during activation");
            }
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
        // If selection changed externally, update handles
        // We can check if handles match current selection
        // For now, rely on explicit calls or check active object
        if (state.selectedObjects.length >= 1) {
            // We might want to optimize this to not update on every frame if not needed
            // but previously it was checking strict single object equality
            // For now, let's just let explicit calls handle major updates, 
            // and here we just check if we should be active.
        } else if (state.selectedObjects.length === 0) {
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
        if (state.selectedObjects.length === 0) {
            this.clearHandles();
            return;
        }

        // Calculate Group Bounding Box
        const groupMin = new THREE.Vector3(Infinity, Infinity, Infinity);
        const groupMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

        state.selectedObjects.forEach(object => {
            if (object.isMesh && object.geometry && !object.geometry.boundingBox) {
                object.geometry.computeBoundingBox();
            }
            const box = new THREE.Box3().setFromObject(object);
            if (isFinite(box.min.x)) {
                groupMin.min(box.min);
                groupMax.max(box.max);
            }
        });

        if (!isFinite(groupMin.x)) {
            // No valid bounds found
            this.clearHandles();
            return;
        }

        // Store group bounds for drag logic
        this.groupBounds = { min: groupMin.clone(), max: groupMax.clone() };

        // Generate Handles based on Group Bounds (World Aligned)
        const size = new THREE.Vector3().subVectors(groupMax, groupMin);
        const center = new THREE.Vector3().addVectors(groupMin, groupMax).multiplyScalar(0.5);
        const maxDim = Math.max(size.x, size.y, size.z);
        const handleSize = 2.5; // Fixed scale to prevent handle resizing based on object size

        const handleDefs = [
            // Corners (Bottom)
            { pos: new THREE.Vector3(groupMin.x, groupMin.y, groupMin.z), dir: new THREE.Vector3(-1, -1, -1), type: 'corner' },
            { pos: new THREE.Vector3(groupMax.x, groupMin.y, groupMin.z), dir: new THREE.Vector3(1, -1, -1), type: 'corner' },
            { pos: new THREE.Vector3(groupMin.x, groupMin.y, groupMax.z), dir: new THREE.Vector3(-1, -1, 1), type: 'corner' },
            { pos: new THREE.Vector3(groupMax.x, groupMin.y, groupMax.z), dir: new THREE.Vector3(1, -1, 1), type: 'corner' },

            // Sides (Bottom)
            { pos: new THREE.Vector3(center.x, groupMin.y, groupMin.z), dir: new THREE.Vector3(0, -1, -1), type: 'side' }, // Front
            { pos: new THREE.Vector3(center.x, groupMin.y, groupMax.z), dir: new THREE.Vector3(0, -1, 1), type: 'side' }, // Back
            { pos: new THREE.Vector3(groupMin.x, groupMin.y, center.z), dir: new THREE.Vector3(-1, -1, 0), type: 'side' }, // Left
            { pos: new THREE.Vector3(groupMax.x, groupMin.y, center.z), dir: new THREE.Vector3(1, -1, 0), type: 'side' }, // Right

            // Top (Center Top)
            { pos: new THREE.Vector3(center.x, groupMax.y, center.z), dir: new THREE.Vector3(0, 1, 0), type: 'top' }
        ];

        // Ensure handles exist
        while (this.handles.length < handleDefs.length) {
            this.createNewHandle();
        }

        // Update handle positions and scale
        handleDefs.forEach((def, index) => {
            const handle = this.handles[index];
            handle.visible = true;

            // Adjust position based on dragScaleSigns (Mirroring)
            // If scale sign is negative, the "min" side becomes "max" side visually and vice versa.
            // Determine which side (min or max) this handle belongs to originally.
            // def.dir components are -1 (min), 1 (max), or 0 (center).

            const currentPos = def.pos.clone();
            const signs = this.dragScaleSigns || new THREE.Vector3(1, 1, 1);

            // Re-calculate handle position dynamically based on bounds? 
            // The bounds passed in 'groupMin'/'groupMax' are re-calculated every frame in updateHandles.
            // If object is negatively scaled, computeBoundingBox might return "correct" min/max (swapped internally or just numerical min/max).
            // THREE.Box3.setFromObject handles negative scale by fixing min/max.
            // So groupMin is always the numerical minimum.
            // BUT, if we mirrored, the "Right" handle (originally +1) should now be at the "Left" (numerical min) position?
            // Let's trace:
            // Original Right Handle (dir +1). Object scale +1. Handle at Max.
            // Scale becomes -1. Object flips. 
            // Visual Right side of the object is now at Min X.
            // Visual Left side of the object is now at Max X.
            // We want the handle to follow the "visual" side it was attached to.
            // Logic:
            // If original dir is +1 and scale is -1 -> We want the side that looks like the "new right"?
            // Wait, if I drag the Right handle to the Left past the anchor:
            // The anchor is Left. The object flips.
            // I am now dragging the "visual right" edge which is moving further Left.
            // So the handle should be at the new "visual right" (which is numerically Min).
            // So:
            // if (dir * sign > 0) -> Max
            // if (dir * sign < 0) -> Min
            // if (dir == 0) -> Center

            if (def.type !== 'top') {
                // X Axis
                if (def.dir.x !== 0) {
                    currentPos.x = (def.dir.x * signs.x > 0) ? groupMax.x : groupMin.x;
                } else {
                    currentPos.x = center.x;
                }

                // Y Axis (for corner/side handles which are at the 'base' usually, or 'top')
                // original handles are at Min Y (base).
                // if dir.y is -1 (base). if scaleY is -1, base is now top?
                if (def.dir.y !== 0) {
                    currentPos.y = (def.dir.y * signs.y > 0) ? groupMax.y : groupMin.y;
                } else {
                    currentPos.y = center.y;
                }

                // Z Axis
                if (def.dir.z !== 0) {
                    currentPos.z = (def.dir.z * signs.z > 0) ? groupMax.z : groupMin.z;
                } else {
                    currentPos.z = center.z;
                }
            } else {
                // Top Handle special case: dir is (0, 1, 0)
                currentPos.x = center.x;
                currentPos.z = center.z;
                if (def.dir.y !== 0) {
                    currentPos.y = (def.dir.y * signs.y > 0) ? groupMax.y : groupMin.y;
                }
            }

            handle.position.copy(currentPos);
            handle.scale.set(handleSize, handleSize, handleSize);

            // Adjust handle visual for top vs corner vs side? 
            // Reuse logic: Corner (3-axis or 2-axis at base) vs Side (1-axis at base) vs Top
            handle.userData.direction = def.dir;
            handle.userData.type = def.type;

            const nonZero = Math.abs(def.dir.x) + Math.abs(def.dir.y) + Math.abs(def.dir.z);
            handle.material.color.set(def.type === 'corner' ? 0xffffff : 0x333333);
            if (def.type === 'top') handle.material.color.set(0xffffff);
        });

        // Hide extra handles
        for (let i = handleDefs.length; i < this.handles.length; i++) {
            this.handles[i].visible = false;
        }
    }

    createNewHandle() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
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
            // Only highlight if visible
            if (handle.visible) {
                if (this.hoveredHandle !== handle) {
                    this.hoveredHandle = handle;
                    handle.material.color.set(0xff0000); // Highlight
                    document.body.style.cursor = 'pointer';
                }
            }
        } else {
            if (this.hoveredHandle) {
                // Reset color
                const dir = this.hoveredHandle.userData.direction;
                const nonZero = Math.abs(dir.x) + Math.abs(dir.y) + Math.abs(dir.z);
                this.hoveredHandle.material.color.set(nonZero > 1 ? 0xffffff : 0x333333);

                this.hoveredHandle = null;
                document.body.style.cursor = 'default';
            }
        }
    }

    onPointerUp(event) {
        if (this.activeHandle) {
            this.activeHandle = null;
            state.isDragging = false;
        }
    }

    onPointerDown(event) {
        if (!this.isActive || !this.hoveredHandle) return;

        event.stopPropagation(); // Prevent object selection

        this.activeHandle = this.hoveredHandle;
        state.isDragging = true; // Block orbit controls

        // Reset scale signs on new drag
        this.dragScaleSigns.set(1, 1, 1);

        saveState();

        // Capture initial state for ALL selected objects
        this.initialObjectStates = state.selectedObjects.map(obj => ({
            object: obj,
            position: obj.position.clone(),
            scale: obj.scale.clone(),
            quaternion: obj.quaternion.clone(),
            // Store World Box for group calculations relative to this object?
            // Actually we are manipulating the GROUP box.
        }));

        this.initialGroupBounds = {
            min: this.groupBounds.min.clone(),
            max: this.groupBounds.max.clone(),
            size: new THREE.Vector3().subVectors(this.groupBounds.max, this.groupBounds.min)
        };

        this.raycaster.setFromCamera(this.mouse, camera);

        // Define Drag Plane
        const dir = this.activeHandle.userData.direction;
        const type = this.activeHandle.userData.type;

        if (type === 'top') {
            // Vertical Drag
            this.dragPlane = new THREE.Plane();
            this.dragPlane.setFromNormalAndCoplanarPoint(
                camera.position.clone().sub(this.activeHandle.position).setY(0).normalize(),
                this.activeHandle.position
            );
        } else {
            // Horizontal Drag on object base plane (groupMin.y)
            this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.initialGroupBounds.min.y);
        }

        const intersection = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.dragPlane, intersection);
        this.initialDragPoint = intersection;
    }

    handleDrag() {
        if (!this.activeHandle || !this.initialDragPoint) return;

        this.raycaster.setFromCamera(this.mouse, camera);
        const currentPoint = new THREE.Vector3();

        if (!this.raycaster.ray.intersectPlane(this.dragPlane, currentPoint)) return;

        // Calculate Delta
        const delta = currentPoint.clone().sub(this.initialDragPoint);
        if (state.snapValue > 0) {
            delta.x = Math.round(delta.x / state.snapValue) * state.snapValue;
            delta.y = Math.round(delta.y / state.snapValue) * state.snapValue;
            delta.z = Math.round(delta.z / state.snapValue) * state.snapValue;
        }

        const dir = this.activeHandle.userData.direction;
        const initialSize = this.initialGroupBounds.size;

        // Calculate Scale Factor based on drag
        // NewSize = OldSize + Delta * Dir (roughly)
        // If dragging Right (+1), dx adds to width.
        // If dragging Left (-1), dx subtracts from width? No, -dx adds to width?
        // Delta is world movement.
        // If direction is -1 (Left), and we move Left (-5), delta is -5. 
        // We want size to INCREASE by 5.
        // So change in size = delta * direction? (-5 * -1 = +5). Yes.

        const dSize = new THREE.Vector3(
            delta.x * (dir.x !== 0 ? Math.sign(dir.x) : 0),
            delta.y * (dir.y !== 0 ? Math.sign(dir.y) : 0), // Top handle is +1 Y
            delta.z * (dir.z !== 0 ? Math.sign(dir.z) : 0)
        );

        // Only scale relevant axes
        // Allow negative scaling for mirroring
        let scaleX = dir.x !== 0 ? (initialSize.x + dSize.x) / initialSize.x : 1;
        let scaleY = dir.y !== 0 ? (initialSize.y + dSize.y) / initialSize.y : 1;
        let scaleZ = dir.z !== 0 ? (initialSize.z + dSize.z) / initialSize.z : 1;

        // Update drag signs and prevent exact zero scale to avoid singularities
        const epsilon = 0.001;
        if (Math.abs(scaleX) < epsilon) scaleX = epsilon * Math.sign(scaleX || 1);
        if (Math.abs(scaleY) < epsilon) scaleY = epsilon * Math.sign(scaleY || 1);
        if (Math.abs(scaleZ) < epsilon) scaleZ = epsilon * Math.sign(scaleZ || 1);

        this.dragScaleSigns.set(
            Math.sign(scaleX),
            Math.sign(scaleY),
            Math.sign(scaleZ)
        );

        // Apply to all objects
        // We need an "Anchor Point" for the scale.
        // If dragging Right, Anchor is Left.
        // Anchor = Center - (Size/2 * Direction).
        // Actually simpler:
        // center = min + size/2.
        // If dir is +1, anchor is min.
        // If dir is -1, anchor is max.
        // If dir is 0, anchor is center (for that axis)?

        const anchor = new THREE.Vector3(
            // Use original direction to determine anchor.
            // If dragging Right (+1), Anchor is Left (min).
            // If dragging Left (-1), Anchor is Right (max).
            // This logic stays the same regardless of current scale sign?
            // Yes, because "Left" and "Right" sides of the original box haven't moved, 
            // we are projecting FROM the anchor.
            dir.x >= 0 ? this.initialGroupBounds.min.x : this.initialGroupBounds.max.x,
            dir.y >= 0 ? this.initialGroupBounds.min.y : this.initialGroupBounds.max.y,
            dir.z >= 0 ? this.initialGroupBounds.min.z : this.initialGroupBounds.max.z
        );

        // However, if dir is 0 for an axis (e.g. Side handle), we scale outward from center?
        // No, side handle (1, 0, 0) scales X. Y and Z are untouched (scale=1).
        // So Anchor Y/Z don't matter much if scale is 1.

        this.initialObjectStates.forEach(state => {
            const obj = state.object;
            const initialPos = state.position;
            const initialScale = state.scale;

            // 1. Update Scale
            // Simply multiply? 
            // obj.scale.x = initialScale.x * scaleX
            obj.scale.set(
                initialScale.x * scaleX,
                initialScale.y * scaleY,
                initialScale.z * scaleZ
            );

            // 2. Update Position
            // P_new = Anchor + (P_old - Anchor) * ScaleFactor
            const vecFromAnchor = initialPos.clone().sub(anchor);
            vecFromAnchor.x *= scaleX;
            vecFromAnchor.y *= scaleY;
            vecFromAnchor.z *= scaleZ;

            obj.position.copy(anchor).add(vecFromAnchor);
        });

        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('transformUpdated', { detail: state.selectedObjects }));

        this.updateHandles();
    }
}

export const transformTool = new TransformTool();

