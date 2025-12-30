import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getLibrary, saveLibrary, getSaveDir } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconPngPath = path.join(__dirname, '../assets/icon.png');
const iconSvgPath = path.join(__dirname, '../assets/icon.svg');
let cachedIcon;
let iconLoaded = false;
app.setName('ImagineIt');

let mainWindow;

function loadAppIcon() {
    if (fs.existsSync(iconPngPath)) {
        try {
            const pngIcon = nativeImage.createFromPath(iconPngPath);
            if (!pngIcon.isEmpty()) return pngIcon;
        } catch (e) {
            console.warn('Failed to load PNG icon:', e);
        }
    }

    if (!fs.existsSync(iconSvgPath)) return null;
    try {
        const iconFromPath = nativeImage.createFromPath(iconSvgPath);
        if (!iconFromPath.isEmpty()) return iconFromPath;
    } catch (e) {
        console.warn('Failed to load icon from path:', e);
    }

    try {
        const svg = fs.readFileSync(iconSvgPath, 'utf-8');
        const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        const iconFromData = nativeImage.createFromDataURL(dataUrl);
        if (!iconFromData.isEmpty()) return iconFromData;
    } catch (e) {
        console.warn('Failed to load icon from SVG data:', e);
    }

    return null;
}

function getAppIcon() {
    if (iconLoaded) return cachedIcon;
    cachedIcon = loadAppIcon();
    iconLoaded = true;
    return cachedIcon;
}

async function createWindow() {
    const appIcon = getAppIcon();
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        ...(appIcon ? { icon: appIcon } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    if (appIcon) mainWindow.setIcon(appIcon);

    // Check if Vite dev server is running
    const devServerUrl = 'http://localhost:5173';
    let useDevServer = false;

    try {
        const http = await import('http');
        await new Promise((resolve, reject) => {
            const req = http.get(devServerUrl, (res) => {
                useDevServer = res.statusCode === 200;
                resolve();
            });
            req.on('error', () => resolve());
            req.setTimeout(1000, () => {
                req.destroy();
                resolve();
            });
        });
    } catch (e) {
        // Dev server not available
    }

    if (useDevServer) {
        mainWindow.loadURL(devServerUrl);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    const appIcon = getAppIcon();
    if (process.platform === 'darwin') {
        try {
            // Note: SVG might not be supported by app.dock.setIcon on all versions
            if (appIcon) app.dock.setIcon(appIcon);
        } catch (e) {
            console.warn('Failed to set dock icon:', e);
        }
    }
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers ---

ipcMain.handle('file:list', async () => {
    const saveDir = getSaveDir();
    const library = getLibrary();

    try {
        const files = fs.readdirSync(saveDir).filter(f => f.endsWith('.imagine'));

        return files.map(filename => {
            const meta = library.files[filename] || { tags: [], group: 'Default' };
            // Ensure group exists in library
            if (!library.groups.includes(meta.group)) {
                meta.group = 'Default';
            }
            return {
                name: filename,
                ...meta
            };
        });
    } catch (e) {
        console.error('Error listing files:', e);
        return [];
    }
});

ipcMain.handle('file:save', async (event, name, content) => {
    const saveDir = getSaveDir();
    if (!name.endsWith('.imagine')) name += '.imagine';
    const filePath = path.join(saveDir, name);

    fs.writeFileSync(filePath, content);

    // Initialize metadata if new
    const library = getLibrary();
    if (!library.files[name]) {
        library.files[name] = { tags: [], group: 'Default' };
        saveLibrary(library);
    }

    return { success: true, name };
});

ipcMain.handle('file:load', async (event, name) => {
    const saveDir = getSaveDir();
    const filePath = path.join(saveDir, name);
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content;
    } catch (e) {
        throw new Error('File not found');
    }
});

ipcMain.handle('file:rename', async (event, oldName, newName) => {
    const saveDir = getSaveDir();
    const fromName = oldName.endsWith('.imagine') ? oldName : `${oldName}.imagine`;
    const toName = newName.endsWith('.imagine') ? newName : `${newName}.imagine`;
    const fromPath = path.join(saveDir, fromName);
    const toPath = path.join(saveDir, toName);

    if (!fs.existsSync(fromPath)) {
        throw new Error('File not found');
    }
    if (fs.existsSync(toPath)) {
        throw new Error('File already exists');
    }

    fs.renameSync(fromPath, toPath);

    const library = getLibrary();
    if (library.files[fromName]) {
        library.files[toName] = library.files[fromName];
        delete library.files[fromName];
        saveLibrary(library);
    }

    return { success: true, name: toName };
});

ipcMain.handle('file:update-meta', async (event, filename, metadata) => {
    const library = getLibrary();
    // Update fields provided
    if (!library.files[filename]) {
        library.files[filename] = { tags: [], group: 'Default' };
    }

    if (metadata.tags) library.files[filename].tags = metadata.tags;
    if (metadata.group) {
        library.files[filename].group = metadata.group;
        // Add group to list if not exists
        if (!library.groups.includes(metadata.group)) {
            library.groups.push(metadata.group);
        }
    }

    saveLibrary(library);
    return true;
});

ipcMain.handle('file:delete', async (event, filename) => {
    const saveDir = getSaveDir();
    const filePath = path.join(saveDir, filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    const library = getLibrary();
    delete library.files[filename];
    saveLibrary(library);
    return true;
});

ipcMain.handle('app:set-icon', async (event, dataUrl) => {
    try {
        const icon = nativeImage.createFromDataURL(dataUrl);
        if (icon.isEmpty()) return false;
        if (mainWindow) mainWindow.setIcon(icon);
        if (process.platform === 'darwin') {
            app.dock.setIcon(icon);
        }
        return true;
    } catch (e) {
        console.warn('Failed to set app icon from renderer:', e);
        return false;
    }
});
