import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// Determine the user data path
const userDataPath = app.getPath('userData');
const libraryFile = path.join(userDataPath, 'library.json');
const defaultSaveDir = path.join(userDataPath, 'saved_scenes');

// Ensure save directory exists
if (!fs.existsSync(defaultSaveDir)) {
    fs.mkdirSync(defaultSaveDir, { recursive: true });
}

// Default library structure
const defaultLibrary = {
    groups: ['Default'],
    files: {} // Keyed by filename: { tags: [], group: 'Default' }
};

export function getLibrary() {
    try {
        if (fs.existsSync(libraryFile)) {
            const data = fs.readFileSync(libraryFile, 'utf-8');
            return { ...defaultLibrary, ...JSON.parse(data) };
        }
    } catch (e) {
        console.error('Error reading library:', e);
    }
    return defaultLibrary;
}

export function saveLibrary(data) {
    try {
        fs.writeFileSync(libraryFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing library:', e);
    }
}

export function getSaveDir() {
    return defaultSaveDir;
}
