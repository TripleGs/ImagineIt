import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';
import { selectObject } from './selection.js';
import { updatePropertiesPanel } from './ui.js';
import { flushAutosave } from './autosave.js';

const dashboardState = {
    files: [],
    filterText: '',
    folder: 'all',
    sort: 'recent',
    favoritesOnly: false
};

const previewCache = new Map();
let previewRenderer;
let activeMenu;
let activeMenuCloseHandler;
let activeMenuKeyHandler;

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 240;
const PREVIEW_BG = 0x222230;

const FALLBACK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
</svg>
`;

const MENU_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="5" r="1.5"></circle>
    <circle cx="12" cy="12" r="1.5"></circle>
    <circle cx="12" cy="19" r="1.5"></circle>
</svg>
`;

const STAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path>
</svg>
`;

export function initDashboard() {
    console.log('Initializing Dashboard');

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

    // Bind Create New button
    const createBtn = document.getElementById('create-project-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            createNewProject().catch((e) => {
                console.error('Error creating project:', e);
            });
        });
    }

    // Bind Search and Filters
    const searchInput = document.getElementById('dashboard-search');
    if (searchInput) {
        searchInput.value = dashboardState.filterText;
        searchInput.addEventListener('input', (e) => {
            dashboardState.filterText = e.target.value;
            renderProjects();
        });
    }

    const folderFilter = document.getElementById('folder-filter');
    if (folderFilter) {
        folderFilter.addEventListener('change', (e) => {
            dashboardState.folder = e.target.value;
            renderProjects();
        });
    }

    const sortFilter = document.getElementById('sort-filter');
    if (sortFilter) {
        sortFilter.value = dashboardState.sort;
        sortFilter.addEventListener('change', (e) => {
            dashboardState.sort = e.target.value;
            renderProjects();
        });
    }

    const favoritesToggle = document.getElementById('favorites-toggle');
    if (favoritesToggle) {
        favoritesToggle.classList.toggle('active', dashboardState.favoritesOnly);
        favoritesToggle.addEventListener('click', () => {
            dashboardState.favoritesOnly = !dashboardState.favoritesOnly;
            favoritesToggle.classList.toggle('active', dashboardState.favoritesOnly);
            renderProjects();
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

    if (!window.electronAPI) {
        dashboardState.files = [];
        renderProjects();
        return;
    }

    try {
        const files = await window.electronAPI.listFiles();
        dashboardState.files = files.map(normalizeFileEntry);
    } catch (e) {
        console.error('Failed to load projects:', e);
        dashboardState.files = [];
    }

    refreshFolderFilter();
    renderProjects();
}

function normalizeFileEntry(file) {
    if (typeof file === 'string') {
        return { name: file, tags: [], group: 'Default', modified: null, favorite: false };
    }

    const modified = typeof file.modified === 'number'
        ? file.modified
        : (file.modified ? Date.parse(file.modified) : null);

    return {
        name: file.name,
        tags: Array.isArray(file.tags) ? file.tags : [],
        group: file.group || 'Default',
        modified: Number.isFinite(modified) ? modified : null,
        favorite: !!file.favorite
    };
}

function refreshFolderFilter() {
    const folderFilter = document.getElementById('folder-filter');
    if (!folderFilter) return;

    const groups = new Set();
    dashboardState.files.forEach(file => {
        if (file.group) groups.add(file.group);
    });

    const current = dashboardState.folder;
    folderFilter.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All folders';
    folderFilter.appendChild(allOption);

    [...groups].sort().forEach(group => {
        const option = document.createElement('option');
        option.value = group;
        option.textContent = group;
        folderFilter.appendChild(option);
    });

    if (current && current !== 'all' && groups.has(current)) {
        folderFilter.value = current;
    } else {
        folderFilter.value = 'all';
        dashboardState.folder = 'all';
    }
}

function renderProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    closeProjectMenu();
    grid.innerHTML = '';

    const filtered = filterProjects(dashboardState.files);

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'dashboard-empty';
        empty.textContent = dashboardState.files.length === 0
            ? 'No designs yet. Click the + button to create one.'
            : 'No designs match your current filters.';
        grid.appendChild(empty);
        return;
    }

    filtered.forEach(file => {
        const card = createProjectCard(file);
        grid.appendChild(card);

        const preview = card.querySelector('.card-preview');
        if (preview) schedulePreviewRender(file, preview);
    });
}

function filterProjects(files) {
    const term = dashboardState.filterText.trim().toLowerCase();

    let results = files.filter(file => {
        if (dashboardState.favoritesOnly && !file.favorite) {
            return false;
        }
        if (dashboardState.folder !== 'all' && file.group !== dashboardState.folder) {
            return false;
        }

        if (!term) return true;

        const name = file.name.replace(/\.imagine$/i, '').toLowerCase();
        const tags = (file.tags || []).join(' ').toLowerCase();
        const group = (file.group || '').toLowerCase();
        return name.includes(term) || tags.includes(term) || group.includes(term);
    });

    results = [...results].sort((a, b) => {
        if (dashboardState.sort === 'name') {
            const nameA = a.name.replace(/\.imagine$/i, '');
            const nameB = b.name.replace(/\.imagine$/i, '');
            return nameA.localeCompare(nameB);
        }
        return (b.modified || 0) - (a.modified || 0);
    });

    return results;
}

function createProjectCard(file) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.title = file.name;

    const preview = document.createElement('div');
    preview.className = 'card-preview loading';

    const previewFallback = document.createElement('div');
    previewFallback.className = 'preview-fallback';
    previewFallback.innerHTML = FALLBACK_SVG;

    const previewImg = document.createElement('img');
    previewImg.alt = file.name;
    preview.appendChild(previewFallback);
    preview.appendChild(previewImg);

    const info = document.createElement('div');
    info.className = 'card-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'card-title-row';

    const title = document.createElement('h3');
    title.textContent = file.name.replace(/\.imagine$/i, '');

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const starBtn = document.createElement('button');
    starBtn.className = 'card-star-btn';
    if (file.favorite) starBtn.classList.add('active');
    starBtn.type = 'button';
    starBtn.title = file.favorite ? 'Unfavorite' : 'Favorite';
    starBtn.innerHTML = STAR_SVG;
    starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(file);
    });

    const menuBtn = document.createElement('button');
    menuBtn.className = 'card-menu-btn';
    menuBtn.type = 'button';
    menuBtn.innerHTML = MENU_SVG;
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showProjectMenu(menuBtn, file);
    });

    actions.appendChild(starBtn);
    actions.appendChild(menuBtn);

    titleRow.appendChild(title);
    titleRow.appendChild(actions);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const folder = document.createElement('button');
    folder.type = 'button';
    folder.className = 'folder-pill';
    folder.textContent = file.group || 'Default';
    folder.addEventListener('click', (e) => {
        e.stopPropagation();
        moveToFolder(file);
    });

    const date = document.createElement('span');
    date.className = 'modified-time';
    date.textContent = formatRelativeTime(file.modified);

    meta.appendChild(folder);
    meta.appendChild(date);

    const tagsRow = document.createElement('div');
    tagsRow.className = 'tags-row';

    (file.tags || []).forEach(tag => {
        const tagEl = document.createElement('button');
        tagEl.type = 'button';
        tagEl.className = 'tag-pill';
        tagEl.textContent = tag;
        tagEl.title = 'Filter by tag';
        tagEl.addEventListener('click', (e) => {
            e.stopPropagation();
            applyTagFilter(tag);
        });
        tagsRow.appendChild(tagEl);
    });

    const addTagBtn = document.createElement('button');
    addTagBtn.type = 'button';
    addTagBtn.className = 'tag-add-btn';
    addTagBtn.textContent = '+ Tag';
    addTagBtn.title = 'Add tag';
    addTagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptAddTag(file);
    });
    tagsRow.appendChild(addTagBtn);

    info.appendChild(titleRow);
    info.appendChild(meta);
    info.appendChild(tagsRow);

    card.appendChild(preview);
    card.appendChild(info);

    card.addEventListener('click', () => {
        openProject(file.name);
    });

    return card;
}

function schedulePreviewRender(file, previewEl) {
    const task = () => renderPreviewForCard(file, previewEl);
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(task, { timeout: 1200 });
    } else {
        setTimeout(task, 60);
    }
}

async function renderPreviewForCard(file, previewEl) {
    if (!window.electronAPI || !previewEl || !previewEl.isConnected) {
        if (previewEl) previewEl.classList.remove('loading');
        return;
    }

    const cacheKey = `${file.name}|${file.modified || ''}`;
    if (previewCache.has(cacheKey)) {
        applyPreview(previewEl, previewCache.get(cacheKey));
        previewEl.classList.remove('loading');
        return;
    }

    previewEl.classList.add('loading');

    try {
        const content = await window.electronAPI.loadFile(file.name);
        const data = JSON.parse(content);
        const dataUrl = createPreviewDataUrl(data);

        if (!previewEl.isConnected) return;

        if (dataUrl) {
            previewCache.set(cacheKey, dataUrl);
            applyPreview(previewEl, dataUrl);
        }
    } catch (e) {
        console.warn('Failed to generate preview for', file.name, e);
    } finally {
        if (previewEl.isConnected) {
            previewEl.classList.remove('loading');
        }
    }
}

function applyPreview(previewEl, dataUrl) {
    const img = previewEl.querySelector('img');
    if (!img) return;
    img.src = dataUrl;
    previewEl.classList.add('has-image');
}

function createPreviewDataUrl(data) {
    if (!data || !Array.isArray(data.objects) || data.objects.length === 0) return null;

    const loader = new THREE.ObjectLoader();
    const previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(PREVIEW_BG);

    const group = new THREE.Group();
    data.objects.forEach(objData => {
        const obj = loader.parse(objData);
        stripPreviewHelpers(obj);
        if (obj.isLineSegments) return;
        group.add(obj);
    });

    if (group.children.length === 0) return null;

    previewScene.add(group);

    const box = new THREE.Box3().setFromObject(group);
    if (!Number.isFinite(box.max.x)) return null;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    group.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const camera = new THREE.PerspectiveCamera(35, PREVIEW_WIDTH / PREVIEW_HEIGHT, 0.1, 1000);
    const distance = maxDim * 1.6;
    camera.position.set(distance, distance * 0.9, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x333344, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(distance, distance, distance);
    previewScene.add(hemi, dir);

    const renderer = getPreviewRenderer();
    renderer.setSize(PREVIEW_WIDTH, PREVIEW_HEIGHT, false);
    renderer.setClearColor(PREVIEW_BG, 1);
    renderer.render(previewScene, camera);

    const dataUrl = renderer.domElement.toDataURL('image/png');

    disposePreviewGroup(group);

    return dataUrl;
}

function getPreviewRenderer() {
    if (previewRenderer) return previewRenderer;
    previewRenderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true
    });
    previewRenderer.setPixelRatio(1);
    if ('outputColorSpace' in previewRenderer) {
        previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    return previewRenderer;
}

function stripPreviewHelpers(object) {
    const removals = [];
    object.traverse(child => {
        if (child.isLineSegments || child.name === '__helper_edges__') {
            removals.push(child);
        }
    });
    removals.forEach(child => {
        if (child.parent) child.parent.remove(child);
    });
}

function disposePreviewGroup(group) {
    group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(mat => disposeMaterial(mat));
            } else {
                disposeMaterial(child.material);
            }
        }
    });
}

function disposeMaterial(material) {
    if (!material) return;
    if (material.map) material.map.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.roughnessMap) material.roughnessMap.dispose();
    if (material.metalnessMap) material.metalnessMap.dispose();
    material.dispose();
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return 'Updated recently';

    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Updated just now';

    const minutes = Math.round(diff / 60000);
    if (minutes < 60) return `Updated ${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Updated ${hours}h ago`;

    const days = Math.round(hours / 24);
    if (days < 7) return `Updated ${days}d ago`;

    return `Updated ${new Date(timestamp).toLocaleDateString()}`;
}

function applyTagFilter(tag) {
    const searchInput = document.getElementById('dashboard-search');
    if (searchInput) {
        searchInput.value = tag;
    }
    dashboardState.filterText = tag;
    renderProjects();
}

async function promptAddTag(file) {
    const raw = await openTextDialog({
        title: 'Add Tag',
        message: 'Tags help you find designs fast.',
        placeholder: 'e.g. printable, enclosure',
        confirmLabel: 'Add Tag'
    });
    const tag = sanitizeTag(raw);
    if (!tag) return;

    const tags = Array.isArray(file.tags) ? [...file.tags] : [];
    if (tags.some(existing => existing.toLowerCase() === tag.toLowerCase())) {
        await openNoticeDialog({
            title: 'Tag already exists',
            message: 'Pick a different tag name.',
            confirmLabel: 'Got it'
        });
        return;
    }
    tags.push(tag);
    await updateFileMetadata(file, { tags });
}

async function editTags(file) {
    const currentTags = Array.isArray(file.tags) ? file.tags.join(', ') : '';
    const raw = await openTextDialog({
        title: 'Edit Tags',
        message: 'Separate tags with commas.',
        placeholder: 'e.g. prototype, v2, housing',
        initialValue: currentTags,
        confirmLabel: 'Save Tags'
    });

    if (raw === null) return;
    const tags = raw
        .split(',')
        .map(tag => sanitizeTag(tag))
        .filter(Boolean);

    await updateFileMetadata(file, { tags });
}

function sanitizeTag(tag) {
    if (!tag) return '';
    return tag.trim().replace(/,+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function updateFileMetadata(file, updates) {
    const previous = {
        tags: file.tags,
        group: file.group,
        favorite: file.favorite
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'tags')) {
        file.tags = Array.isArray(updates.tags) ? updates.tags : [];
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'group')) {
        file.group = updates.group;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'favorite')) {
        file.favorite = !!updates.favorite;
    }

    refreshFolderFilter();
    renderProjects();

    if (!window.electronAPI) return;

    try {
        await window.electronAPI.updateMetadata(file.name, updates);
    } catch (e) {
        console.error('Failed to update metadata:', e);
        file.tags = previous.tags;
        file.group = previous.group;
        file.favorite = previous.favorite;
        refreshFolderFilter();
        renderProjects();
    }
}

async function toggleFavorite(file) {
    await updateFileMetadata(file, { favorite: !file.favorite });
}

async function duplicateProject(file) {
    if (!window.electronAPI) return;

    const baseName = file.name.replace(/\.imagine$/i, '');
    const suggestedName = `${baseName} Copy`;
    const rawName = await openTextDialog({
        title: 'Duplicate Design',
        message: 'Choose a name for the copy.',
        initialValue: suggestedName,
        confirmLabel: 'Duplicate'
    });

    if (!rawName) return;
    const cleaned = sanitizeProjectName(rawName);
    if (!cleaned) return;

    try {
        const uniqueName = await ensureUniqueProjectName(cleaned);
        const content = await window.electronAPI.loadFile(file.name);
        const result = await window.electronAPI.saveFile(uniqueName, content);
        const savedName = result?.name || `${uniqueName}.imagine`;
        await window.electronAPI.updateMetadata(savedName, {
            tags: Array.isArray(file.tags) ? [...file.tags] : [],
            group: file.group || 'Default',
            favorite: !!file.favorite
        });

        if (uniqueName !== cleaned) {
            await openNoticeDialog({
                title: 'Name adjusted',
                message: `Saved as ${uniqueName}.`,
                confirmLabel: 'Ok'
            });
        }

        await loadProjects();
    } catch (e) {
        console.error('Failed to duplicate project:', e);
        await openNoticeDialog({
            title: 'Duplicate failed',
            message: 'Try again in a moment.',
            confirmLabel: 'Ok'
        });
    }
}

async function ensureUniqueProjectName(baseName) {
    const files = await window.electronAPI.listFiles();
    const existingNames = files.map(entry => (typeof entry === 'string' ? entry : entry.name));
    const lowerSet = new Set(existingNames.map(name => name.toLowerCase()));

    let candidate = baseName;
    let counter = 1;
    while (lowerSet.has(`${candidate.toLowerCase()}.imagine`)) {
        candidate = `${baseName} ${counter}`;
        counter++;
    }
    return candidate;
}

function showProjectMenu(button, file) {
    closeProjectMenu();

    const menu = document.createElement('div');
    menu.className = 'project-menu';

    const actions = [
        { label: 'Rename', handler: () => renameProject(file) },
        { label: 'Duplicate', handler: () => duplicateProject(file) },
        { label: 'Edit Tags', handler: () => editTags(file) },
        { label: 'Move to Folder', handler: () => moveToFolder(file) },
        { label: 'Delete', handler: () => deleteProject(file), danger: true }
    ];

    actions.forEach(action => {
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = action.label;
        if (action.danger) item.classList.add('danger');
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            closeProjectMenu();
            action.handler();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    const rect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.right - menuRect.width;
    let top = rect.bottom + 8;

    if (left < 8) left = rect.left;
    if (left + menuRect.width > window.innerWidth - 8) {
        left = window.innerWidth - menuRect.width - 8;
    }

    if (top + menuRect.height > window.innerHeight - 8) {
        top = rect.top - menuRect.height - 8;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    activeMenu = menu;

    activeMenuCloseHandler = (event) => {
        if (menu.contains(event.target)) return;
        if (event.target === button) return;
        closeProjectMenu();
    };

    activeMenuKeyHandler = (event) => {
        if (event.key === 'Escape') closeProjectMenu();
    };

    setTimeout(() => {
        document.addEventListener('click', activeMenuCloseHandler);
        document.addEventListener('keydown', activeMenuKeyHandler);
    }, 0);
}

function closeProjectMenu() {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
    if (activeMenuCloseHandler) {
        document.removeEventListener('click', activeMenuCloseHandler);
        activeMenuCloseHandler = null;
    }
    if (activeMenuKeyHandler) {
        document.removeEventListener('keydown', activeMenuKeyHandler);
        activeMenuKeyHandler = null;
    }
}

function openTextDialog({ title, message, placeholder = '', initialValue = '', confirmLabel = 'Save', cancelLabel = 'Cancel' }) {
    return new Promise(resolve => {
        const { backdrop, modal } = createModalShell(title, message);

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.value = initialValue || '';

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'text-btn';
        cancelBtn.textContent = cancelLabel;

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'text-btn primary';
        confirmBtn.textContent = confirmLabel;

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        modal.appendChild(input);
        modal.appendChild(actions);

        const cleanup = (value) => {
            backdrop.remove();
            document.removeEventListener('keydown', onKeyDown);
            resolve(value);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                cleanup(null);
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                cleanup(input.value);
            }
        };

        cancelBtn.addEventListener('click', () => cleanup(null));
        confirmBtn.addEventListener('click', () => cleanup(input.value));
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) cleanup(null);
        });

        document.addEventListener('keydown', onKeyDown);
        input.focus();
        input.select();
    });
}

function openConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise(resolve => {
        const { backdrop, modal } = createModalShell(title, message);

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'text-btn';
        cancelBtn.textContent = cancelLabel;

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = `text-btn ${danger ? 'danger' : 'primary'}`;
        confirmBtn.textContent = confirmLabel;

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        modal.appendChild(actions);

        const cleanup = (value) => {
            backdrop.remove();
            document.removeEventListener('keydown', onKeyDown);
            resolve(value);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') cleanup(false);
            if (event.key === 'Enter') cleanup(true);
        };

        cancelBtn.addEventListener('click', () => cleanup(false));
        confirmBtn.addEventListener('click', () => cleanup(true));
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) cleanup(false);
        });

        document.addEventListener('keydown', onKeyDown);
        confirmBtn.focus();
    });
}

function openNoticeDialog({ title, message, confirmLabel = 'Ok' }) {
    return new Promise(resolve => {
        const { backdrop, modal } = createModalShell(title, message);

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'text-btn primary';
        confirmBtn.textContent = confirmLabel;

        actions.appendChild(confirmBtn);
        modal.appendChild(actions);

        const cleanup = () => {
            backdrop.remove();
            document.removeEventListener('keydown', onKeyDown);
            resolve(true);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape' || event.key === 'Enter') cleanup();
        };

        confirmBtn.addEventListener('click', cleanup);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) cleanup();
        });

        document.addEventListener('keydown', onKeyDown);
        confirmBtn.focus();
    });
}

function createModalShell(title, message) {
    const backdrop = document.createElement('div');
    backdrop.className = 'dashboard-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'dashboard-modal';

    const heading = document.createElement('h3');
    heading.textContent = title;
    modal.appendChild(heading);

    if (message) {
        const description = document.createElement('p');
        description.textContent = message;
        modal.appendChild(description);
    }

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    return { backdrop, modal };
}

async function renameProject(file) {
    if (!window.electronAPI) return;

    const baseName = file.name.replace(/\.imagine$/i, '');
    const nextRaw = await openTextDialog({
        title: 'Rename Design',
        message: 'Give your design a new name.',
        initialValue: baseName,
        confirmLabel: 'Rename'
    });
    const nextName = sanitizeProjectName(nextRaw || '');

    if (!nextName || nextName === baseName) return;

    try {
        const files = await window.electronAPI.listFiles();
        const existingNames = files.map(entry => (typeof entry === 'string' ? entry : entry.name));
        if (existingNames.some(name => name.toLowerCase() === `${nextName.toLowerCase()}.imagine`)) {
            await openNoticeDialog({
                title: 'Name already used',
                message: 'Choose a different design name.',
                confirmLabel: 'Ok'
            });
            return;
        }

        await window.electronAPI.renameFile(file.name, nextName);
        await loadProjects();
    } catch (e) {
        console.error('Failed to rename project:', e);
        await openNoticeDialog({
            title: 'Rename failed',
            message: 'Try again in a moment.',
            confirmLabel: 'Ok'
        });
    }
}

async function moveToFolder(file) {
    const nextGroup = await openTextDialog({
        title: 'Move to Folder',
        message: 'Folders help you keep designs organized.',
        initialValue: file.group || 'Default',
        placeholder: 'e.g. Prototypes',
        confirmLabel: 'Move'
    });
    if (!nextGroup) return;
    const cleaned = nextGroup.trim();
    if (!cleaned) return;
    await updateFileMetadata(file, { group: cleaned });
}

async function deleteProject(file) {
    if (!window.electronAPI) return;
    const shouldDelete = await openConfirmDialog({
        title: 'Delete Design',
        message: `Delete ${file.name.replace(/\.imagine$/i, '')}? This cannot be undone.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        danger: true
    });
    if (!shouldDelete) return;

    try {
        await window.electronAPI.deleteFile(file.name);
        await loadProjects();
    } catch (e) {
        console.error('Failed to delete project:', e);
        await openNoticeDialog({
            title: 'Delete failed',
            message: 'Try again in a moment.',
            confirmLabel: 'Ok'
        });
    }
}

async function createNewProject() {
    clearScene();

    let newName = 'Untitled Project';
    let hasFile = false;

    if (window.electronAPI) {
        try {
            // Find unique name
            const files = await window.electronAPI.listFiles();

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
