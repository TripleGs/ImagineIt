import { state } from './state.js';
import { serializeProjectObjects } from './projectSerialization.js';

const AUTOSAVE_DELAY_MS = 800;
let autosaveTimer = null;
let autosaveInFlight = false;
let autosavePending = false;

function canAutosave() {
    return typeof window !== 'undefined' &&
        window.electronAPI &&
        state.hasProjectFile &&
        state.currentProjectName;
}

function buildProjectData() {
    return {
        metadata: {
            version: 1.0,
            type: 'ImagineIt_Project',
            date: new Date().toISOString()
        },
        objects: serializeProjectObjects(state.objects)
    };
}

async function saveNow() {
    if (!canAutosave()) return;
    if (autosaveInFlight) {
        autosavePending = true;
        return;
    }
    autosaveInFlight = true;
    try {
        const data = buildProjectData();
        const json = JSON.stringify(data, null, 2);
        const result = await window.electronAPI.saveFile(state.currentProjectName, json);
        if (result && result.name) {
            state.currentProjectName = result.name.replace(/\.imagine$/i, '');
            state.hasProjectFile = true;
        }
    } catch (e) {
        console.error('Autosave failed:', e);
    } finally {
        autosaveInFlight = false;
        if (autosavePending) {
            autosavePending = false;
            saveNow();
        }
    }
}

export function queueAutosave() {
    if (!canAutosave()) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    // Debounce to avoid writing on every small change.
    autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        saveNow();
    }, AUTOSAVE_DELAY_MS);
}

export function flushAutosave() {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    return saveNow();
}
