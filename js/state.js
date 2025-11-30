import * as THREE from 'three';

export const state = {
    objects: [],
    selectedObject: null,
    selectedObjects: [],
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    dragStartPosition: new THREE.Vector3(),
    dragStartPositions: new Map(),
    currentOffset: new THREE.Vector3(),
    isDragging: false,
    dragPlane: new THREE.Plane(),
    dragIntersection: new THREE.Vector3(),
    movementHelper: null,
    snapValue: 1.0,
    history: [],
    historyIndex: -1,
    maxHistorySize: 100
};
