import * as THREE from 'three';
import { state } from './state.js';
import { createMesh } from './objects.js';
import { exportSTL } from './exporter.js';
import { updateGrid, scene } from './scene.js';
import { selectObject, onSelectionChange } from './selection.js';
import { saveState, undo, redo } from './history.js';
import { alignTool } from './alignTool.js';

function updateOffsetDisplay(offset) {
    document.getElementById('offset-x').value = offset.x.toFixed(2);
    document.getElementById('offset-y').value = offset.y.toFixed(2);
    document.getElementById('offset-z').value = offset.z.toFixed(2);
}

function addListener(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, handler);
    } else {
        console.warn(`Element with id '${id}' not found when adding '${event}' listener.`);
    }
}

export function initUI() {
    // Save initial state
    saveState();

    addListener('add-box', 'click', () => {
        saveState();
        createMesh(new THREE.BoxGeometry(20, 20, 20), 0x00ff00, new THREE.Vector3(0, 10, 0), 'box');
    });

    addListener('add-cylinder', 'click', () => {
        saveState();
        createMesh(new THREE.CylinderGeometry(10, 10, 20, 32), 0xff0000, new THREE.Vector3(30, 10, 0), 'cylinder');
    });

    addListener('add-sphere', 'click', () => {
        saveState();
        createMesh(new THREE.SphereGeometry(10, 32, 32), 0x0000ff, new THREE.Vector3(-30, 10, 0), 'sphere');
    });

    addListener('delete-object', 'click', deleteSelectedObject);
    addListener('uncombine-object', 'click', uncombineObject);

    addListener('export-stl', 'click', exportSTL);

    // Keyboard shortcuts
    window.addEventListener('keydown', (event) => {
        // Ctrl+Z or Cmd+Z for undo
        if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            undo();
        }
        // Ctrl+Shift+Z or Ctrl+Y for redo
        else if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            redo();
        }
    });

    // Dimension Inputs
    ['width', 'height', 'depth'].forEach((dim, index) => {
        const axis = ['x', 'y', 'z'][index];
        addListener(`object-${dim}`, 'change', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) {
                saveState();
                setDimension(axis, val);
            }
        });
    });

    // Offset Inputs - allow user to adjust position by editing offset values
    ['x', 'y', 'z'].forEach((axis) => {
        addListener(`offset-${axis}`, 'change', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && state.selectedObject) {
                saveState();
                applyOffset(axis, val);
            }
        });
    });

    // Rotation Inputs - allow user to adjust rotation by editing degree values
    ['x', 'y', 'z'].forEach((axis) => {
        addListener(`rotate-${axis}`, 'change', (e) => {
            const degrees = parseFloat(e.target.value);
            if (!isNaN(degrees) && state.selectedObject) {
                saveState();
                applyRotation(axis, degrees);
            }
        });
    });

    // Listen for drag updates
    window.addEventListener('objectDragged', (e) => {
        updateOffsetDisplay(e.detail.offset);
    });

    // Name Input
    // Name Input
    addListener('object-name', 'change', (e) => {
        if (state.selectedObject) {
            state.selectedObject.userData.name = e.target.value;
        }
    });

    // Type toggle buttons
    // Type toggle buttons
    addListener('type-solid', 'click', () => {
        if (state.selectedObject) {
            saveState();
            setObjectType(state.selectedObject, true);
            updateTypeButtons(true);
        }
    });

    addListener('type-hole', 'click', () => {
        if (state.selectedObject) {
            saveState();
            setObjectType(state.selectedObject, false);
            updateTypeButtons(false);
        }
    });

    // Combine tool button
    addListener('combine-tool', 'click', combineObjects);

    // Align tool button
    addListener('align-tool', 'click', () => {
        alignTool.toggle();
        const btn = document.getElementById('align-tool');
        if (alignTool.isActive) {
            btn.classList.add('active-tool');
        } else {
            btn.classList.remove('active-tool');
        }
    });

    // Settings
    // Settings
    addListener('snap-setting', 'change', (e) => {
        const val = parseFloat(e.target.value);
        state.snapValue = val;
    });

    addListener('grid-size', 'change', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            updateGrid(val);
        }
    });

    // Register selection change listener
    onSelectionChange(handleSelectionChange);
}

function deleteSelectedObject() {
    if (state.selectedObjects.length > 0) {
        saveState();
        // Delete all selected objects
        state.selectedObjects.forEach(obj => {
            scene.remove(obj);
            const index = state.objects.indexOf(obj);
            if (index > -1) {
                state.objects.splice(index, 1);
            }
        });
        selectObject(null);
    }
}

function handleSelectionChange(objects) {
    if (objects && objects.length > 0) {
        updatePropertiesPanel(objects);
    } else {
        hidePropertiesPanel();
    }
}

function setObjectType(object, isSolid) {
    object.userData.isSolid = isSolid;

    if (isSolid) {
        // Make solid - opaque
        object.material.transparent = false;
        object.material.opacity = 1;
        object.material.depthWrite = true;
    } else {
        // Make hole - semi-transparent
        object.material.transparent = true;
        object.material.opacity = 0.3;
        object.material.depthWrite = false;
    }
    object.material.needsUpdate = true;
}

function updateTypeButtons(isSolid) {
    const solidBtn = document.getElementById('type-solid');
    const holeBtn = document.getElementById('type-hole');

    if (isSolid) {
        solidBtn.classList.add('active');
        holeBtn.classList.remove('active');
    } else {
        solidBtn.classList.remove('active');
        holeBtn.classList.add('active');
    }
}

export function updatePropertiesPanel(objects) {
    document.getElementById('no-selection').style.display = 'none';
    document.getElementById('object-properties').style.display = 'flex';

    const isMultiple = Array.isArray(objects) && objects.length > 1;
    const object = Array.isArray(objects) ? objects[0] : objects;

    // Update delete button text
    const deleteButton = document.getElementById('delete-object');
    if (isMultiple) {
        deleteButton.textContent = `Delete (${objects.length})`;
    } else {
        deleteButton.textContent = 'Delete';
    }

    // Enable/disable align and combine tools based on selection
    const alignTool = document.getElementById('align-tool');
    const combineTool = document.getElementById('combine-tool');
    if (isMultiple) {
        alignTool.disabled = false;
        alignTool.classList.add('active');
        combineTool.disabled = false;
        combineTool.classList.add('active');
    } else {
        alignTool.disabled = true;
        alignTool.classList.remove('active');
        combineTool.disabled = true;
        combineTool.classList.remove('active');
    }

    // Update name field
    const nameInput = document.getElementById('object-name');
    if (isMultiple) {
        nameInput.value = `${objects.length} objects selected`;
        nameInput.disabled = true;
    } else {
        nameInput.value = object.userData.name || '';
        nameInput.disabled = false;
    }

    const colorInput = document.getElementById('object-color');
    if (!isMultiple) {
        colorInput.value = '#' + object.material.color.getHexString();
        colorInput.disabled = false;
    } else {
        colorInput.disabled = true;
    }

    const newColorInput = colorInput.cloneNode(true);
    colorInput.parentNode.replaceChild(newColorInput, colorInput);

    newColorInput.addEventListener('input', (e) => {
        if (state.selectedObject && !isMultiple) {
            state.selectedObject.material.color.set(e.target.value);
        }
    });

    if (!isMultiple) {
        updateDimensionInputs(object);
        // Update type buttons based on object state
        updateTypeButtons(object.userData.isSolid !== false);
    } else {
        // Disable type buttons for multi-selection
        document.getElementById('type-solid').disabled = true;
        document.getElementById('type-hole').disabled = true;
    }

    // Enable type buttons for single selection
    if (!isMultiple) {
        document.getElementById('type-solid').disabled = false;
        document.getElementById('type-hole').disabled = false;
    }

    // Show/hide uncombine button
    const uncombineButton = document.getElementById('uncombine-object');
    if (!isMultiple && object.userData.isCombined && object.userData.originalObjects) {
        uncombineButton.style.display = 'block';
    } else {
        uncombineButton.style.display = 'none';
    }

    // Reset offset display to zero when selecting a new object
    document.getElementById('offset-x').value = '0';
    document.getElementById('offset-y').value = '0';
    document.getElementById('offset-z').value = '0';
    state.currentOffset.set(0, 0, 0);

    // Update rotation display with current rotation values in degrees
    if (!isMultiple) {
        const rotX = THREE.MathUtils.radToDeg(object.rotation.x);
        const rotY = THREE.MathUtils.radToDeg(object.rotation.y);
        const rotZ = THREE.MathUtils.radToDeg(object.rotation.z);

        document.getElementById('rotate-x').value = rotX.toFixed(0);
        document.getElementById('rotate-y').value = rotY.toFixed(0);
        document.getElementById('rotate-z').value = rotZ.toFixed(0);

        // Enable rotation inputs
        document.getElementById('rotate-x').disabled = false;
        document.getElementById('rotate-y').disabled = false;
        document.getElementById('rotate-z').disabled = false;
    } else {
        // Disable rotation inputs for multi-selection
        document.getElementById('rotate-x').disabled = true;
        document.getElementById('rotate-y').disabled = true;
        document.getElementById('rotate-z').disabled = true;
    }
}

export function hidePropertiesPanel() {
    document.getElementById('no-selection').style.display = 'block';
    document.getElementById('object-properties').style.display = 'none';

    // Disable align and combine tools when nothing is selected
    const alignToolBtn = document.getElementById('align-tool');
    const combineTool = document.getElementById('combine-tool');
    alignToolBtn.disabled = true;
    alignToolBtn.classList.remove('active');
    alignToolBtn.classList.remove('active-tool');
    combineTool.disabled = true;
    combineTool.classList.remove('active');

    // Deactivate align tool
    alignTool.deactivate();
}

function updateDimensionInputs(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);

    const wInput = document.getElementById('object-width');
    const hInput = document.getElementById('object-height');
    const dInput = document.getElementById('object-depth');

    if (document.activeElement !== wInput) wInput.value = size.x.toFixed(1);
    if (document.activeElement !== hInput) hInput.value = size.y.toFixed(1);
    if (document.activeElement !== dInput) dInput.value = size.z.toFixed(1);
}

function setDimension(axis, value) {
    if (!state.selectedObject) return;

    const box = new THREE.Box3().setFromObject(state.selectedObject);
    const size = new THREE.Vector3();
    box.getSize(size);

    const currentSize = size[axis];
    if (currentSize === 0) return;

    const scaleFactor = value / currentSize;
    state.selectedObject.scale[axis] *= scaleFactor;
}

function applyOffset(axis, value) {
    if (!state.selectedObject) return;

    // Apply offset from the drag start position
    state.selectedObject.position.copy(state.dragStartPosition);

    // Get current offset values from all inputs
    const offsetX = parseFloat(document.getElementById('offset-x').value) || 0;
    const offsetY = parseFloat(document.getElementById('offset-y').value) || 0;
    const offsetZ = parseFloat(document.getElementById('offset-z').value) || 0;

    state.selectedObject.position.x += offsetX;
    state.selectedObject.position.y += offsetY;
    state.selectedObject.position.z += offsetZ;

    // Update the current offset
    state.currentOffset.set(offsetX, offsetY, offsetZ);
}

function applyRotation(axis, degrees) {
    if (!state.selectedObject) return;

    // Convert degrees to radians
    const radians = THREE.MathUtils.degToRad(degrees);

    // Apply rotation to the selected object
    state.selectedObject.rotation[axis] = radians;
}



async function combineObjects() {
    if (state.selectedObjects.length < 2) {
        alert('Please select at least 2 objects to combine');
        return;
    }

    // Save state before combining
    saveState();

    // Separate solids and holes
    const solids = state.selectedObjects.filter(obj => obj.userData.isSolid !== false);
    const holes = state.selectedObjects.filter(obj => obj.userData.isSolid === false);

    if (solids.length === 0) {
        alert('At least one object must be a solid to combine');
        return;
    }

    // Calculate the center/reference point of all selected objects
    const boundingBox = new THREE.Box3();
    state.selectedObjects.forEach(obj => {
        boundingBox.expandByObject(obj);
    });
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);

    // Store original objects data relative to the center for uncombine
    const originalObjects = state.selectedObjects.map(obj => {
        return {
            ...serializeObjectForUncombine(obj),
            relativePosition: obj.position.clone().sub(center).toArray()
        };
    });

    try {
        // Dynamically import the CSG library
        const CSG = await import('three-bvh-csg');
        console.log('CSG library loaded:', CSG);

        const { SUBTRACTION, ADDITION, Brush, Evaluator } = CSG;
        const evaluator = new Evaluator();

        // Helper to create a brush with applied transforms
        function createBrushFromObject(obj) {
            // Clone geometry and ensure it's a BufferGeometry
            let geometry = obj.geometry.clone();

            // Convert to BufferGeometry if needed
            if (!geometry.isBufferGeometry) {
                geometry = new THREE.BufferGeometry().fromGeometry(geometry);
            }

            // Compute vertex normals if not present
            if (!geometry.attributes.normal) {
                geometry.computeVertexNormals();
            }

            // Apply world transform to geometry
            const matrix = obj.matrixWorld.clone();
            geometry.applyMatrix4(matrix);

            const brush = new Brush(geometry);
            brush.updateMatrixWorld();
            return brush;
        }

        console.log('Starting combine operation...');
        console.log('Solids:', solids.map(s => ({ name: s.userData.name, pos: s.position })));
        console.log('Holes:', holes.map(h => ({ name: h.userData.name, pos: h.position })));

        // Start with the first solid
        let resultBrush = createBrushFromObject(solids[0]);
        console.log('Created initial brush from:', solids[0].userData.name);

        // Union all solids together
        for (let i = 1; i < solids.length; i++) {
            console.log(`Unioning solid ${i + 1}/${solids.length}:`, solids[i].userData.name);
            const brush = createBrushFromObject(solids[i]);
            resultBrush = evaluator.evaluate(resultBrush, brush, ADDITION);
            console.log('Union complete');
        }

        // Subtract all holes from the result
        for (let i = 0; i < holes.length; i++) {
            console.log(`Subtracting hole ${i + 1}/${holes.length}:`, holes[i].userData.name);
            const holeBrush = createBrushFromObject(holes[i]);
            resultBrush = evaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);
            console.log('Subtraction complete');
        }

        console.log('CSG operations complete, creating result mesh...');

        // Create new mesh from result
        const resultGeometry = resultBrush.geometry;
        const resultMaterial = new THREE.MeshStandardMaterial({
            color: solids[0].material.color,
            transparent: false,
            opacity: 1
        });

        const resultMesh = new THREE.Mesh(resultGeometry, resultMaterial);
        resultMesh.position.set(0, 0, 0);
        resultMesh.rotation.set(0, 0, 0);
        resultMesh.scale.set(1, 1, 1);
        resultMesh.castShadow = true;
        resultMesh.receiveShadow = true;
        resultMesh.userData.name = 'Combined Object';
        resultMesh.userData.isSolid = true;
        resultMesh.userData.isCombined = true;
        resultMesh.userData.originalObjects = originalObjects;

        // Add to scene
        scene.add(resultMesh);
        state.objects.push(resultMesh);

        console.log('Result mesh created and added to scene');

        // Remove original objects
        state.selectedObjects.forEach(obj => {
            scene.remove(obj);
            const index = state.objects.indexOf(obj);
            if (index > -1) {
                state.objects.splice(index, 1);
            }
        });

        console.log('Original objects removed');

        // Select the new combined object
        selectObject(resultMesh);

        console.log('Combine operation successful!');

    } catch (error) {
        console.error('Detailed error combining objects:', error);
        console.error('Error stack:', error.stack);
        alert(`Failed to combine objects: ${error.message}\n\nCheck the browser console for details.`);
    }
}

function serializeObjectForUncombine(obj) {
    // Store the object's world matrix at time of combining
    const worldMatrix = obj.matrixWorld.clone();

    return {
        geometry: {
            type: obj.geometry.type,
            parameters: obj.geometry.parameters
        },
        material: {
            color: obj.material.color.getHex(),
            transparent: obj.material.transparent,
            opacity: obj.material.opacity
        },
        worldMatrix: worldMatrix.toArray(),
        userData: {
            name: obj.userData.name,
            isSolid: obj.userData.isSolid
        },
        castShadow: obj.castShadow,
        receiveShadow: obj.receiveShadow
    };
}

function deserializeObjectForUncombine(data, combinedObject) {
    let geometry;
    switch (data.geometry.type) {
        case 'BoxGeometry':
            const bp = data.geometry.parameters;
            geometry = new THREE.BoxGeometry(bp.width, bp.height, bp.depth);
            break;
        case 'CylinderGeometry':
            const cp = data.geometry.parameters;
            geometry = new THREE.CylinderGeometry(
                cp.radiusTop, cp.radiusBottom, cp.height, cp.radialSegments
            );
            break;
        case 'SphereGeometry':
            const sp = data.geometry.parameters;
            geometry = new THREE.SphereGeometry(
                sp.radius, sp.widthSegments, sp.heightSegments
            );
            break;
        default:
            console.warn('Unknown geometry type:', data.geometry.type);
            geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const material = new THREE.MeshStandardMaterial({
        color: data.material.color,
        transparent: data.material.transparent,
        opacity: data.material.opacity
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Get the relative position from when it was combined
    const relativePos = new THREE.Vector3().fromArray(data.relativePosition);

    // Apply combined object's current transform to the relative position
    const worldPos = relativePos.clone();
    worldPos.applyMatrix4(combinedObject.matrixWorld);

    mesh.position.copy(worldPos);

    // Apply combined object's rotation and scale
    mesh.rotation.copy(combinedObject.rotation);
    mesh.scale.copy(combinedObject.scale);

    mesh.userData.name = data.userData.name;
    mesh.userData.isSolid = data.userData.isSolid;
    mesh.castShadow = data.castShadow;
    mesh.receiveShadow = data.receiveShadow;

    return mesh;
}

function uncombineObject() {
    if (!state.selectedObject || !state.selectedObject.userData.isCombined) {
        return;
    }

    saveState();

    const combinedObject = state.selectedObject;
    const originalObjectsData = combinedObject.userData.originalObjects;

    // Restore original objects at their current transformed positions
    const restoredObjects = [];
    originalObjectsData.forEach(objData => {
        const mesh = deserializeObjectForUncombine(objData, combinedObject);
        scene.add(mesh);
        state.objects.push(mesh);
        restoredObjects.push(mesh);
    });

    // Remove combined object
    scene.remove(combinedObject);
    const index = state.objects.indexOf(combinedObject);
    if (index > -1) {
        state.objects.splice(index, 1);
    }

    // Select the first restored object
    if (restoredObjects.length > 0) {
        selectObject(restoredObjects[0]);
    }

    console.log(`Uncombined object into ${restoredObjects.length} original objects at current position`);
}
