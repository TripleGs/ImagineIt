import * as THREE from 'three';
import { state } from './state.js';
import { createMesh } from './objects.js';
import { exportSTL, exportImagine, importFile, normalizeGeometry } from './fileHandler.js';
import { updateGrid, scene } from './scene.js';
import { selectObject, onSelectionChange } from './selection.js';
import { saveState, undo, redo } from './history.js';
import { alignTool } from './alignTool.js';
import { shapeManager } from './shapeManager.js';
import { faceSnapTool } from './faceSnapTool.js';

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

    // Initialize Shape Sidebar
    const shapeGrid = document.getElementById('shape-grid');
    const shapes = shapeManager.getShapes();

    // Populate grid
    for (const shape of shapes) {
        const card = document.createElement('div');
        card.className = 'shape-card';
        card.title = `Add ${shape.name}`;

        const previewContainer = document.createElement('div');
        previewContainer.className = 'shape-preview';

        // Add loading placeholder or icon initially
        previewContainer.innerHTML = `<span style="font-size: 24px;">${shape.icon}</span>`;

        const nameLabel = document.createElement('div');
        nameLabel.className = 'shape-name';
        nameLabel.textContent = shape.name;

        card.appendChild(previewContainer);
        card.appendChild(nameLabel);

        // Generate preview asynchronously
        shapeManager.generatePreview(shape.id).then(dataUrl => {
            if (dataUrl) {
                const img = document.createElement('img');
                img.src = dataUrl;
                previewContainer.innerHTML = '';
                previewContainer.appendChild(img);
            }
        });

        card.addEventListener('click', async () => {
            saveState();
            try {
                const geometry = await shapeManager.loadShapeGeometry(shape.id);
                // Random position for now, or fixed offset
                const position = new THREE.Vector3(
                    (Math.random() - 0.5) * 50,
                    10,
                    (Math.random() - 0.5) * 50
                );

                // Adjust geometry center/scale if needed for STLs
                if (shape.type === 'stl') {
                    normalizeGeometry(geometry);
                }

                const mesh = createMesh(geometry, Math.random() * 0xffffff, position, shape.name);
                mesh.userData.shapeId = shape.id;

                // Apply initial rotation if defined
                if (shape.initialRotation) {
                    mesh.rotation.set(
                        THREE.MathUtils.degToRad(shape.initialRotation[0]),
                        THREE.MathUtils.degToRad(shape.initialRotation[1]),
                        THREE.MathUtils.degToRad(shape.initialRotation[2])
                    );
                }

                // Manual Grid Alignment
                if (shape.yOffset !== undefined) {
                    mesh.position.y = shape.yOffset;
                } else {
                    mesh.rotation.set(0, 0, 0); // Reset rotation for measurement
                    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                    const size = new THREE.Vector3();
                    mesh.geometry.boundingBox.getSize(size);
                    // Apply scale if needed, though usually 1 for new shapes
                    size.multiply(mesh.scale);

                    const shiftY = size.y / 2;
                    mesh.position.y += shiftY;
                }
            } catch (error) {
                console.error('Error adding shape:', error);
                alert(`Failed to add ${shape.name}: ${error.message}\n\n${error.stack}`);
            }
        });

        shapeGrid.appendChild(card);
    }

    // Sidebar Toggle Logic
    const sidebar = document.getElementById('shape-sidebar');
    const minimizeBtn = document.getElementById('minimize-sidebar');
    const bubbleBtn = document.getElementById('shapes-bubble');

    function toggleSidebar() {
        sidebar.classList.toggle('closed');
        if (sidebar.classList.contains('closed')) {
            bubbleBtn.classList.add('visible');
        } else {
            bubbleBtn.classList.remove('visible');
        }
    }

    minimizeBtn.addEventListener('click', toggleSidebar);
    bubbleBtn.addEventListener('click', toggleSidebar);

    addListener('delete-object', 'click', deleteSelectedObject);
    addListener('uncombine-object', 'click', uncombineObject);

    // -- Import / Export Handlers --

    // Import
    addListener('import-btn', 'click', () => {
        document.getElementById('file-input').click();
    });

    addListener('file-input', 'change', (e) => {
        if (e.target.files.length > 0) {
            importFile(e.target.files[0]);
            e.target.value = ''; // Reset input
        }
    });

    // Export Modal
    const exportModal = document.getElementById('export-modal');
    const closeModalBtn = exportModal.querySelector('.close-modal');

    function openExportModal() {
        exportModal.classList.add('show');
    }

    function closeExportModal() {
        exportModal.classList.remove('show');
    }

    addListener('export-btn', 'click', openExportModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeExportModal);

    // Close on click outside
    window.addEventListener('click', (e) => {
        if (e.target === exportModal) {
            closeExportModal();
        }
    });

    // Export Options
    addListener('export-imagine-btn', 'click', () => {
        exportImagine();
        closeExportModal();
    });

    addListener('export-stl-btn', 'click', () => {
        exportSTL();
        closeExportModal();
    });


    // Keyboard shortcuts
    window.addEventListener('keydown', (event) => {
        const isCtrl = event.ctrlKey || event.metaKey;

        // Select All (Ctrl+A / Cmd+A)
        if (isCtrl && (event.key === 'a' || event.key === 'A')) {
            event.preventDefault();
            // Prevent if input is focused
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            // Select all objects
            // We need a way to select multiple. `selection.js` has `selectObject` which clears.
            // We need to modify selection.js to handle mass selection or iterate.
            // Let's implement a `selectAll()` function in `js/selection.js` and export it?
            // Or just manually update state and notify.
            // Best practice: Use selection module.
            import('./selection.js').then(module => {
                module.selectAll();
            });
            return;
        }

        // Ctrl+Z or Cmd+Z for undo
        if (isCtrl && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            undo();
        }
        // Ctrl+Shift+Z or Ctrl+Y for redo
        else if (isCtrl && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            redo();
        }
        // Delete or Backspace to delete selection
        else if (event.key === 'Delete' || event.key === 'Backspace') {
            // Prevent backspace from navigating back if not in an input
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                event.preventDefault();
                deleteSelectedObject();
            }
        }
        // Ctrl+D or Cmd+D to duplicate
        else if (isCtrl && (event.key === 'd' || event.key === 'D')) {
            event.preventDefault();
            duplicateSelectedObject();
        }
        // Ctrl+C / Cmd+C for Copy
        else if (isCtrl && (event.key === 'c' || event.key === 'C')) {
            event.preventDefault();
            copySelection();
        }
        // Ctrl+V / Cmd+V for Paste
        else if (isCtrl && (event.key === 'v' || event.key === 'V')) {
            event.preventDefault();
            pasteSelection();
        }
        // Arrow Keys for Nudging
        else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            // Only nudge if not focused on an input
            if (document.activeElement.tagName !== 'INPUT') {
                event.preventDefault();
                nudgeSelection(event.key, event.shiftKey);
            }
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
    addListener('object-name', 'change', (e) => {
        if (state.selectedObject) {
            state.selectedObject.userData.name = e.target.value;
        }
    });

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

    // Face Snap tool
    addListener('face-snap-tool', 'click', () => {
        const btn = document.getElementById('face-snap-tool');
        if (state.toolMode === 'select') {
            faceSnapTool.activate();
            btn.classList.add('active-tool');
        } else {
            faceSnapTool.deactivate();
            btn.classList.remove('active-tool');
        }
    });

    // Listen for manual tool deactivation
    window.addEventListener('toolDeactivated', (e) => {
        if (e.detail.tool === 'face-snap') {
            document.getElementById('face-snap-tool').classList.remove('active-tool');
        }
    });

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

function duplicateSelectedObject() {
    if (state.selectedObjects.length === 0) return;

    // Use copy/paste logic for duplication to keep it consistent
    copySelection();
    pasteSelection();
}


function copySelection() {
    if (state.selectedObjects.length === 0) return;

    // Store clones of the meshes in the clipboard
    // We clone them so they are independent of the scene objects (which might be deleted)
    state.clipboard = state.selectedObjects.map(original => {
        const clone = original.clone();

        // Deep clone material
        if (original.material) {
            clone.material = original.material.clone();
        }

        // Deep clone user data
        clone.userData = JSON.parse(JSON.stringify(original.userData));

        return clone;
    });

    console.log(`Copied ${state.clipboard.length} objects to clipboard.`);
}

function pasteSelection() {
    if (state.clipboard.length === 0) return;

    saveState();

    const newSelection = [];

    state.clipboard.forEach(clipboardObj => {
        // Clone from clipboard to create a new scene instance
        const instance = clipboardObj.clone();

        if (clipboardObj.material) {
            instance.material = clipboardObj.material.clone();
        }

        instance.userData = JSON.parse(JSON.stringify(clipboardObj.userData));

        // Rename
        const nameParts = (instance.userData.name || 'Object').split(' ');
        const lastPart = parseInt(nameParts[nameParts.length - 1]);
        if (!isNaN(lastPart)) {
            instance.userData.name = `${nameParts.slice(0, -1).join(' ')} ${lastPart + 1}`;
        } else {
            instance.userData.name = `${instance.userData.name} (Copy)`;
        }

        // Offset
        instance.position.add(new THREE.Vector3(5, 0, 5));

        scene.add(instance);
        state.objects.push(instance);
        newSelection.push(instance);
    });

    // Select new objects
    if (newSelection.length > 0) {
        // Select the first one to trigger UI updates
        selectObject(newSelection[0]);
        // TODO: support multi-select in API explicitly
    }
}

function nudgeSelection(key, isShift) {
    if (!state.selectedObject) return;

    saveState();

    // Default nudge amount: snap value or 1
    let amount = state.snapValue > 0 ? state.snapValue : 1;

    // Shift key multiplier
    if (isShift) amount *= 10;

    const offset = new THREE.Vector3(0, 0, 0);

    // Get camera direction to make arrows intuitive relative to view? 
    // Or just align to world axes? Tinkercad aligns to world axes usually.
    // Let's stick to World X/Z for arrows.

    switch (key) {
        case 'ArrowUp':
            offset.z = -amount;
            break;
        case 'ArrowDown':
            offset.z = amount;
            break;
        case 'ArrowLeft':
            offset.x = -amount;
            break;
        case 'ArrowRight':
            offset.x = amount;
            break;
    }

    state.selectedObjects.forEach(obj => {
        obj.position.add(offset);
    });

    // Update inputs
    const object = state.selectedObject;
    document.getElementById('offset-x').value = '0'; // Current drag offset reset
    // Actually we should update the Properties Panel position/input values?
    // The "Pos" inputs in properties panel show relative offset during drag, 
    // but usually we might want to show absolute world pos or just re-init panel.
    // handleSelectionChange calls updatePropertiesPanel.
    updatePropertiesPanel(state.selectedObjects);
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
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    object.geometry.boundingBox.getSize(size);
    size.multiply(object.scale);

    const wInput = document.getElementById('object-width');
    const hInput = document.getElementById('object-height');
    const dInput = document.getElementById('object-depth');

    if (document.activeElement !== wInput) wInput.value = size.x.toFixed(1);
    if (document.activeElement !== hInput) hInput.value = size.y.toFixed(1);
    if (document.activeElement !== dInput) dInput.value = size.z.toFixed(1);
}

function setDimension(axis, value) {
    if (!state.selectedObject) return;

    const object = state.selectedObject;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    object.geometry.boundingBox.getSize(size);
    size.multiply(object.scale);

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

            // Ensure UVs are present (required by CSG)
            if (!geometry.attributes.uv) {
                console.log('Adding dummy UVs to geometry');
                const count = geometry.attributes.position.count;
                const uvs = new Float32Array(count * 2);
                geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            } else {
                console.log('Geometry already has UVs');
            }

            console.log('Geometry attributes:', Object.keys(geometry.attributes));

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

        // Center the geometry
        resultGeometry.translate(-center.x, -center.y, -center.z);

        const resultMaterial = new THREE.MeshStandardMaterial({
            color: solids[0].material.color,
            transparent: false,
            opacity: 1
        });

        const resultMesh = new THREE.Mesh(resultGeometry, resultMaterial);
        resultMesh.position.copy(center);
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
            isSolid: obj.userData.isSolid,
            shapeId: obj.userData.shapeId
        },
        castShadow: obj.castShadow,
        receiveShadow: obj.receiveShadow
    };
}

async function deserializeObjectForUncombine(data, combinedObject) {
    let geometry;
    if (data.userData.shapeId) {
        try {
            geometry = await shapeManager.loadShapeGeometry(data.userData.shapeId);
            normalizeGeometry(geometry);
        } catch (e) {
            console.error('Failed to load shape geometry:', e);
            geometry = new THREE.BoxGeometry(20, 20, 20);
        }
    } else {
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

async function uncombineObject() {
    if (!state.selectedObject || !state.selectedObject.userData.isCombined) {
        return;
    }

    saveState();

    const combinedObject = state.selectedObject;
    const originalObjectsData = combinedObject.userData.originalObjects;

    // Restore original objects at their current transformed positions
    const restoredObjects = [];
    for (const objData of originalObjectsData) {
        const mesh = await deserializeObjectForUncombine(objData, combinedObject);
        scene.add(mesh);
        state.objects.push(mesh);
        restoredObjects.push(mesh);
    }

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
