import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';
import { saveState } from './history.js';

let isActive = false;
let step = 0; // 0: None, 1: Source Selected
let sourceSelection = null; // { object, faceIndex, normal, point }
let hoverMesh = null;
let camera, renderer;

export const faceSnapTool = {
    init(cam, rend) {
        camera = cam;
        renderer = rend;

        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);

        // Create hover highlight mesh
        const geometry = new THREE.BufferGeometry();
        // Initial dummy data
        const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthTest: false
        });
        hoverMesh = new THREE.Mesh(geometry, material);
        hoverMesh.visible = false;
        hoverMesh.renderOrder = 999;
        scene.add(hoverMesh);
    },

    activate() {
        isActive = true;
        step = 0;
        sourceSelection = null;
        state.toolMode = 'face-snap';

        // Reset visual state
        if (hoverMesh) {
            hoverMesh.material.color.setHex(0x00ff00);
            hoverMesh.visible = false;
        }

        console.log('Face Snap Tool Activated');
    },

    deactivate() {
        isActive = false;
        step = 0;
        sourceSelection = null;
        if (hoverMesh) hoverMesh.visible = false;
        state.toolMode = 'select';
        console.log('Face Snap Tool Deactivated');
    }
};

function onPointerDown(event) {
    if (!isActive) return;
    if (event.target !== renderer.domElement) return;

    const hit = raycast(event);
    if (!hit) return;

    if (step === 0) {
        // Step 1: Select Source Face
        // Must select an actual object, not the ground
        if (!hit.object) {
            console.log('Must select an object face first');
            return;
        }

        sourceSelection = {
            object: hit.object,
            face: hit.face,
            point: hit.point,
            normal: hit.face.normal.clone().applyQuaternion(hit.object.quaternion).normalize()
        };

        // Visual feedback: Change color for step 2 (Target)
        hoverMesh.material.color.setHex(0xff0000);
        step = 1;

        console.log('Source Face Selected');

    } else if (step === 1) {
        // Step 2: Select Target Face
        if (hit.object && hit.object === sourceSelection.object) {
            console.warn('Cannot snap object to itself');
            return;
        }

        let targetNormal;
        if (hit.object) {
            targetNormal = hit.face.normal.clone().applyQuaternion(hit.object.quaternion).normalize();
        } else {
            // Ground hit
            targetNormal = hit.normal;
        }

        performSnap(sourceSelection.object, sourceSelection.normal, sourceSelection.point, hit.point, targetNormal);

        // Reset
        faceSnapTool.deactivate();
        saveState();

        // Notify UI
        window.dispatchEvent(new CustomEvent('toolDeactivated', { detail: { tool: 'face-snap' } }));
    }
}

function onPointerMove(event) {
    if (!isActive) return;
    // if (event.target !== renderer.domElement) return; // Removed strict check to fix issue with overlays

    const hit = raycast(event);

    if (hit) {
        hoverMesh.visible = true;
        updateHoverMesh(hit);
    } else {
        hoverMesh.visible = false;
    }
}

function raycast(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    state.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const intersects = state.raycaster.intersectObjects(state.objects, false);

    if (intersects.length > 0) {
        return intersects[0];
    }

    // Check intersection with Plane Y=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    const hit = state.raycaster.ray.intersectPlane(plane, target);

    if (hit) {
        // Create a synthetic hit result for the ground
        return {
            point: target,
            normal: new THREE.Vector3(0, 1, 0),
            face: { normal: new THREE.Vector3(0, 1, 0) }, // Mock face
            object: null // Null object means ground
        };
    }

    return null;
}

function updateHoverMesh(hit) {
    if (!hit.object) {
        // Ground hit highlight
        const size = 10;
        const positions = new Float32Array([
            hit.point.x - size, 0.1, hit.point.z - size,
            hit.point.x + size, 0.1, hit.point.z - size,
            hit.point.x - size, 0.1, hit.point.z + size,

            hit.point.x + size, 0.1, hit.point.z - size,
            hit.point.x + size, 0.1, hit.point.z + size,
            hit.point.x - size, 0.1, hit.point.z + size
        ]);

        // Dispose of old attribute to prevent memory leaks and update issues
        const oldPositionAttr = hoverMesh.geometry.attributes.position;
        if (oldPositionAttr) {
            oldPositionAttr.array = null;
        }

        hoverMesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        hoverMesh.geometry.attributes.position.needsUpdate = true;
        hoverMesh.geometry.computeVertexNormals();
        hoverMesh.geometry.computeBoundingSphere();
        hoverMesh.geometry.computeBoundingBox();
        hoverMesh.position.set(0, 0, 0);
        return;
    }

    // Highlight the face under cursor
    const obj = hit.object;

    // We want to highlight ALL triangles that are coplanar with the hit face
    const posAttribute = obj.geometry.attributes.position;
    const vertexCount = posAttribute.count;

    const highlightVertices = [];

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    // 1. Establish Reference Normal and Point from the HIT FACE
    // This ensures consistency between our reference and the loop calculation.
    let refNormal = new THREE.Vector3();
    let refPoint = new THREE.Vector3();

    if (hit.face && hit.face.a !== undefined) {
        pA.fromBufferAttribute(posAttribute, hit.face.a);
        pB.fromBufferAttribute(posAttribute, hit.face.b);
        pC.fromBufferAttribute(posAttribute, hit.face.c);

        cb.subVectors(pC, pB);
        ab.subVectors(pA, pB);
        cb.cross(ab).normalize();

        refNormal.copy(cb);
        refPoint.copy(pA); // Any point on the face is fine
    } else {
        // Fallback if something is weird
        console.warn('FaceSnap: hit.face or its indices are undefined. Falling back to hit.face.normal and hit.point.');
        refNormal.copy(hit.face.normal);
        refPoint.copy(hit.point); // World point
        hit.object.worldToLocal(refPoint); // Convert to local
    }

    // Scan geometry
    let matchCount = 0;

    // Helper to process triangle
    const processTriangle = (ia, ib, ic) => {
        pA.fromBufferAttribute(posAttribute, ia);
        pB.fromBufferAttribute(posAttribute, ib);
        pC.fromBufferAttribute(posAttribute, ic);

        // Compute normal
        cb.subVectors(pC, pB);
        ab.subVectors(pA, pB);
        cb.cross(ab).normalize();

        // Check 1: Normal Alignment (Coplanar orientation)
        // Dot product should be close to 1
        const dot = cb.dot(refNormal);
        if (dot > 0.99) {
            // Check 2: Plane Distance (Coplanar position)
            // Projected distance from refPoint to this triangle's plane should be near 0
            // vector (pA - refPoint) dot refNormal should be ~0
            const dist = pA.clone().sub(refPoint).dot(refNormal);

            if (Math.abs(dist) < 0.1) { // 0.1 unit tolerance
                const vA = pA.clone().applyMatrix4(obj.matrixWorld);
                const vB = pB.clone().applyMatrix4(obj.matrixWorld);
                const vC = pC.clone().applyMatrix4(obj.matrixWorld);

                highlightVertices.push(vA.x, vA.y, vA.z);
                highlightVertices.push(vB.x, vB.y, vB.z);
                highlightVertices.push(vC.x, vC.y, vC.z);
                matchCount++;
            }
        }
    };

    if (obj.geometry.index) {
        const index = obj.geometry.index;
        for (let i = 0; i < index.count; i += 3) {
            processTriangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
        }
    } else {
        for (let i = 0; i < vertexCount; i += 3) {
            processTriangle(i, i + 1, i + 2);
        }
    }

    // Fallback: If no matches found
    if (highlightVertices.length === 0) {
        console.warn(`FaceSnap: No coplanar faces found coverage. hitFace: a=${hit.face.a}. fallback.`);
        if (hit.face.a !== undefined) {
            const getV = (idx) => {
                const v = new THREE.Vector3().fromBufferAttribute(posAttribute, idx);
                return v.applyMatrix4(obj.matrixWorld);
            };
            const vA = getV(hit.face.a);
            const vB = getV(hit.face.b);
            const vC = getV(hit.face.c);
            highlightVertices.push(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);
        }
    }

    const positions = new Float32Array(highlightVertices);

    // Calculate the world normal for offset
    const worldNormal = hit.face.normal.clone().applyQuaternion(obj.quaternion).normalize();
    const offset = worldNormal.multiplyScalar(0.05); // Small offset to prevent z-fighting

    // Apply offset to all vertices
    for (let i = 0; i < positions.length; i += 3) {
        positions[i] += offset.x;
        positions[i + 1] += offset.y;
        positions[i + 2] += offset.z;
    }

    // Dispose of old attribute to prevent memory leaks and update issues
    const oldPositionAttr = hoverMesh.geometry.attributes.position;
    if (oldPositionAttr) {
        oldPositionAttr.array = null;
    }

    hoverMesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Force update of position attribute
    hoverMesh.geometry.attributes.position.needsUpdate = true;

    hoverMesh.geometry.computeVertexNormals();
    hoverMesh.geometry.computeBoundingSphere();
    hoverMesh.geometry.computeBoundingBox();

    // Reset mesh position to origin since vertices are already in world space
    hoverMesh.position.set(0, 0, 0);
}

function performSnap(object, sourceNormal, sourcePoint, targetPoint, targetNormal) {
    // 1. Rotate Object so Source Normal is opposite to Target Normal
    // We want sourceNormal to point in direction of -targetNormal
    const desiredDirection = targetNormal.clone().negate();

    // Quaternion to rotate sourceNormal to desiredDirection
    const quat = new THREE.Quaternion().setFromUnitVectors(sourceNormal, desiredDirection);

    // Apply rotation to object
    // Note: Applying strict rotation might mess up if object is rotated.
    // We need to rotate the object such that *in world space* its normal aligns.

    // Current world orientation of object
    object.quaternion.premultiply(quat);
    object.updateMatrixWorld();

    // 2. Translate Object so Source Point matches Target Point
    // Get the NEW world position of the source point after rotation
    // This is tricky because 'sourcePoint' was the old world position.
    // We need the local position of that point to re-calculate.

    // Actually, 'sourcePoint' from raycast is in World Space. 
    // We can compute the local offset from object center to source point.
    // But since we just rotated the object around its center (presumably origin of mesh),
    // we need to know the vector from Center -> FaceCenter

    // Let's re-calculate Center->FaceVector
    // Inverse the OLD rotation to get local vector?
    // No, easier way:
    // 1. Calculate vector from Object Center to Source Hit Point (Old World)
    // 2. Apply NEW Rotation to that vector -> New World Vector
    // 3. New Object Position = Target Point - New World Vector

    // Wait, `sourcePoint` is world space point ON THE FACE.
    // Before rotation: Offset = sourcePoint - object.position
    const offset = new THREE.Vector3().subVectors(sourcePoint, object.position);

    // We applied 'quat' to the object's rotation.
    // So the offset vector is also rotated by 'quat'.
    offset.applyQuaternion(quat);

    // Now, we want (NewPosition + NewOffset) to equal TargetPoint
    // NewPosition = TargetPoint - NewOffset

    const newPos = new THREE.Vector3().subVectors(targetPoint, offset);

    object.position.copy(newPos);
    object.updateMatrixWorld();
}
