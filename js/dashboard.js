
import { state } from './state.js';
import { scene } from './scene.js';
import { selectObject } from './selection.js';
import { updatePropertiesPanel } from './ui.js';
import { flushAutosave } from './autosave.js';

export function initDashboard() {
    console.log('Initializing Dashboard');

    // Bind "Home" button (in Editor Header)
    // Bind Settings Button
    const settingsBtn = document.getElementById('settings-btn');
    const settingsDropdown = document.getElementById('settings-dropdown');

    if (settingsBtn && settingsDropdown) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsDropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        window.addEventListener('click', (e) => {
            if (!settingsBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
                settingsDropdown.classList.remove('show');
            }
        });
    }

    // Bind "Back to Menu" button
    const backBtn = document.getElementById('back-to-menu-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Close dropdown
            if (settingsDropdown) settingsDropdown.classList.remove('show');
            switchToDashboard();
        });
    }

    // Load projects list
    loadProjects();

    // Enable editing the project name in the header
    initProjectNameEditing();
}

async function loadProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // 1. Add "Create New" Card
    const newCard = document.createElement('div');
    newCard.className = 'project-card create-new';
    newCard.innerHTML = `
        <div class="card-preview">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        </div>
        <div class="card-info">
            <h3>Create New Design</h3>
            <p>Start from scratch</p>
        </div>
    `;
    newCard.addEventListener('click', () => {
        createNewProject().catch((e) => {
            console.error('Error creating project:', e);
        });
    });
    grid.appendChild(newCard);

    // 2. Load and Add Existing Projects
    if (window.electronAPI) {
        try {
            const files = await window.electronAPI.listFiles();
            // files is array of { name, tags, group, ... }

            files.forEach(file => {
                const card = createProjectCard(file);
                grid.appendChild(card);
            });
        } catch (e) {
            console.error('Failed to load projects:', e);
        }
    }
}

function createProjectCard(file) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.title = file.name;

    const preview = document.createElement('div');
    preview.className = 'card-preview';
    // Placeholder icon
    preview.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <path d="M12 18v-6l4 2-4 2-4-2 4-2z" fill="currentColor" fill-opacity="0.1"></path>
        </svg>
    `;

    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('h3');
    title.textContent = file.name.replace('.imagine', '');

    const date = document.createElement('p');
    date.textContent = 'Last modified: Today'; // Placeholder, actual date needs metadata

    info.appendChild(title);
    info.appendChild(date);

    card.appendChild(preview);
    card.appendChild(info);

    card.addEventListener('click', () => {
        openProject(file.name);
    });

    return card;
}

async function createNewProject() {
    clearScene();

    let newName = 'Untitled Project';
    let hasFile = false;

    if (window.electronAPI) {
        try {
            // Find unique name
            const files = await window.electronAPI.listFiles();
            // Expected files format: [{name: 'foo.imagine', ...}, ...] or just strings?
            // electron/main.js says it returns objects with 'name' property.

            const existingNames = files.map(file => typeof file === 'string' ? file : file.name);
            const baseName = newName;
            let counter = 1;
            while (existingNames.some(name => name.toLowerCase() === `${newName.toLowerCase()}.imagine`)) {
                newName = `${baseName} ${counter}`;
                counter++;
            }

            // Create empty file content
            const data = {
                metadata: {
                    version: 1.0,
                    type: 'ImagineIt_Project',
                    date: new Date().toISOString()
                },
                objects: []
            };
            const json = JSON.stringify(data, null, 2);

            // Save new file
            const result = await window.electronAPI.saveFile(newName, json);
            if (result && result.name) {
                newName = result.name.replace(/\.imagine$/i, '');
            }
            console.log(`Created new project: ${newName}`);
            hasFile = true;

        } catch (e) {
            console.error('Error creating new project file:', e);
        }
    }

    // Reset Project Name Input
    updateCurrentProjectName(newName, hasFile);

    switchToEditor();
}

function openProject(filename) {
    // Trigger the file handling logic in fileHandler.js via event
    const event = new CustomEvent('load-imagine-file', { detail: { filename } });
    document.dispatchEvent(event);

    // Update Name
    updateCurrentProjectName(filename.replace(/\.imagine$/i, ''), true);

    switchToEditor();
}

function switchToEditor() {
    document.getElementById('dashboard-screen').classList.remove('visible');
    document.getElementById('dashboard-screen').style.opacity = 0; // Fade out

    setTimeout(() => {
        try {
            document.getElementById('dashboard-screen').style.display = 'none';

            const editor = document.getElementById('editor-screen');
            editor.style.display = 'block';
            // Force reflow/resize for Canvas
            window.dispatchEvent(new Event('resize'));
        } catch (e) {
            console.error('Error switching to editor:', e);
        }
    }, 300);
}

function switchToDashboard() {
    flushAutosave();
    const editor = document.getElementById('editor-screen');
    editor.style.display = 'none';

    const dashboard = document.getElementById('dashboard-screen');
    dashboard.style.display = 'flex';
    dashboard.style.opacity = 1;
    dashboard.classList.add('visible');

    // Reload projects in case we saved one
    loadProjects();
}

function clearScene() {
    // Remove all user objects
    [...state.objects].forEach(obj => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
    });
    state.objects = [];
    selectObject(null);
    updatePropertiesPanel([]);
}

function updateCurrentProjectName(name, hasFile = state.hasProjectFile) {
    state.currentProjectName = name;
    state.hasProjectFile = hasFile;
    const nameInput = document.getElementById('project-name-input');
    if (nameInput) nameInput.value = name;
}

function sanitizeProjectName(name) {
    const trimmed = name.trim().replace(/\.imagine$/i, '');
    return trimmed.replace(/[\/\\]/g, '-').trim();
}

function initProjectNameEditing() {
    const nameInput = document.getElementById('project-name-input');
    if (!nameInput) return;

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nameInput.blur();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            nameInput.value = state.currentProjectName || 'Untitled Project';
            nameInput.blur();
        }
    });

    nameInput.addEventListener('blur', async () => {
        const previousName = state.currentProjectName || 'Untitled Project';
        const nextName = sanitizeProjectName(nameInput.value);

        if (!nextName || nextName === previousName) {
            nameInput.value = previousName;
            return;
        }

        if (!window.electronAPI) {
            updateCurrentProjectName(nextName);
            return;
        }

        try {
            const files = await window.electronAPI.listFiles();
            const existingNames = files.map(file => typeof file === 'string' ? file : file.name);
            const exists = existingNames.some(name => name.toLowerCase() === `${nextName.toLowerCase()}.imagine`);

            if (exists) {
                alert('A project with that name already exists.');
                nameInput.value = previousName;
                return;
            }

            const previousExists = existingNames.some(name => name.toLowerCase() === `${previousName.toLowerCase()}.imagine`);
            if (!previousExists) {
                updateCurrentProjectName(nextName, state.hasProjectFile);
                return;
            }

            await window.electronAPI.renameFile(previousName, nextName);
            updateCurrentProjectName(nextName, true);
        } catch (e) {
            console.error('Failed to rename project:', e);
            alert('Failed to rename project.');
            nameInput.value = previousName;
        }
    });
}
