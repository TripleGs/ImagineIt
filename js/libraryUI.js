export let libraryState = {
    files: [],
    groups: [],
    isOpen: false
};

const sidebar = document.getElementById('library-sidebar');
const content = document.getElementById('library-content');
const toggleBtn = document.getElementById('library-toggle');
const searchInput = document.getElementById('library-search');

export function initLibrary() {
    if (!window.electronAPI) {
        console.warn('Electron API not available. Library disabled.');
        toggleBtn.style.display = 'none';
        return;
    }

    toggleBtn.addEventListener('click', () => {
        libraryState.isOpen = !libraryState.isOpen;
        sidebar.classList.toggle('open', libraryState.isOpen);
        if (libraryState.isOpen) {
            refreshLibrary();
        }
    });

    searchInput.addEventListener('input', (e) => {
        renderLibrary(e.target.value);
    });

    // Initial fetch
    refreshLibrary();
}

async function refreshLibrary() {
    try {
        const files = await window.electronAPI.listFiles();
        libraryState.files = files;
        renderLibrary();
    } catch (e) {
        console.error('Failed to load library:', e);
    }
}

function renderLibrary(filterText = '') {
    content.innerHTML = '';

    // Filter files
    const filtered = libraryState.files.filter(f => {
        const text = filterText.toLowerCase();
        return f.name.toLowerCase().includes(text) ||
            (f.tags && f.tags.some(t => t.toLowerCase().includes(text)));
    });

    // Group files
    const grouped = {};
    filtered.forEach(f => {
        const g = f.group || 'Default';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(f);
    });

    // Render groups
    Object.keys(grouped).sort().forEach(groupName => {
        const groupEl = document.createElement('div');
        groupEl.className = 'group-header';
        groupEl.textContent = groupName;
        content.appendChild(groupEl);

        grouped[groupName].forEach(file => {
            const fileEl = document.createElement('div');
            fileEl.className = 'file-item';

            const nameEl = document.createElement('span');
            nameEl.className = 'file-name';
            nameEl.textContent = file.name.replace('.imagine', '');
            fileEl.appendChild(nameEl);

            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'tags-container';
            if (file.tags) {
                file.tags.forEach(tag => {
                    const tagEl = document.createElement('span');
                    tagEl.className = 'tag';
                    tagEl.textContent = tag;
                    tagsContainer.appendChild(tagEl);
                });
            }

            // Add Tag Button
            const addTagBtn = document.createElement('button');
            addTagBtn.className = 'tag-add-btn';
            addTagBtn.textContent = '+';
            addTagBtn.title = 'Add Tag';
            addTagBtn.onclick = (e) => {
                e.stopPropagation();
                promptAddTag(file);
            };
            tagsContainer.appendChild(addTagBtn);

            fileEl.appendChild(tagsContainer);

            // Click to load
            fileEl.onclick = () => loadFile(file.name);

            // Context Menu (Right Click) for Grouping
            fileEl.oncontextmenu = (e) => {
                e.preventDefault();
                showContextMenu(e.pageX, e.pageY, file);
            };

            content.appendChild(fileEl);
        });
    });
}

function loadFile(filename) {
    if (confirm(`Load ${filename}? Unsaved changes will be lost.`)) {
        // We need to import loadScene from somewhere or dispatch an event
        // For now, let's look at how fileHandler does it. it uses loadJSON.
        // We'll dispatch a custom event that fileHandler listens to, or call a global function.
        // Or simpler: We'll modify fileHandler to export a `loadProjectContent` function and import it here?
        // Cyclic dependencies might be an issue.
        // Better: Dispatch custom event on document.
        const event = new CustomEvent('load-imagine-file', { detail: { filename } });
        document.dispatchEvent(event);
    }
}

async function promptAddTag(file) {
    const tag = prompt('Enter new tag:');
    if (tag) {
        const newTags = file.tags ? [...file.tags, tag] : [tag];
        await window.electronAPI.updateMetadata(file.name, { tags: newTags });
        refreshLibrary();
    }
}

function showContextMenu(x, y, file) {
    // Remove existing context menus
    document.querySelectorAll('.context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const folderItem = document.createElement('div');
    folderItem.className = 'context-menu-item';
    folderItem.textContent = 'Change Group...';
    folderItem.onclick = async () => {
        const newGroup = prompt('Enter group name:', file.group || 'Default');
        if (newGroup) {
            await window.electronAPI.updateMetadata(file.name, { group: newGroup });
            refreshLibrary();
        }
        menu.remove();
    };
    menu.appendChild(folderItem);

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item';
    deleteItem.textContent = 'Delete File';
    deleteItem.style.color = '#e74c3c';
    deleteItem.onclick = async () => {
        if (confirm(`Delete ${file.name}?`)) {
            await window.electronAPI.deleteFile(file.name);
            refreshLibrary();
        }
        menu.remove();
    };
    menu.appendChild(deleteItem);

    document.body.appendChild(menu);

    // Close on click elsewhere
    const closeHandler = () => {
        menu.remove();
        document.removeEventListener('click', closeHandler);
    };
    document.addEventListener('click', closeHandler);
}
