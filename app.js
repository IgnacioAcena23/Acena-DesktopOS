/**
 * Ace-a-DesktopOS - Interfaz de Usuario y Gestor de Ventanas
 */

// --- ESTADO GLOBAL DE LA UI ---
const UIState = {
    activeWindow: null,
    zIndexCounter: 100,
    minimizedWindows: new Set(),
    backendConnected: false,
    antivirusEnabled: true,
    realTimeStatsInterval: null,
    realTimeProcInterval: null,
    simulatedProcesses: [
        { pid: 1, name: "System.exe", cpu: 1.2, mem: 12.4, status: "RUNNING" },
        { pid: 4, name: "Registry.exe", cpu: 0.1, mem: 4.8, status: "READY" },
        { pid: 88, name: "AceShell.exe", cpu: 2.5, mem: 34.2, status: "READY" },
        { pid: 102, name: "DefenderService.exe", cpu: 0.4, mem: 18.9, status: "READY" },
        { pid: 144, name: "VFSManager.exe", cpu: 0.2, mem: 8.5, status: "READY" },
        { pid: 210, name: "MeteoWidget.exe", cpu: 1.1, mem: 14.1, status: "WAITING" }
    ],
    downloads: [],
    securityLogs: [],
    statsHistory: {
        cpu: new Array(30).fill(0),
        ram: new Array(30).fill(0),
        netDown: new Array(30).fill(0),
        netUp: new Array(30).fill(0)
    },
    // Estado del planificador
    schedulerTickInterval: null,
    schedulerSpeed: 800, // ms por tick
};
const GRID_CELL_W = 100;
const GRID_CELL_H = 100;
const GRID_OFFSET_X = 20;
const GRID_OFFSET_Y = 20;

function snapToGrid(x, y, iconWidth, iconHeight, desktopRect) {
    let gridX = Math.round((x - GRID_OFFSET_X) / GRID_CELL_W) * GRID_CELL_W + GRID_OFFSET_X;
    let gridY = Math.round((y - GRID_OFFSET_Y) / GRID_CELL_H) * GRID_CELL_H + GRID_OFFSET_Y;
    gridX = Math.max(0, Math.min(gridX, desktopRect.width - iconWidth));
    gridY = Math.max(0, Math.min(gridY, desktopRect.height - iconHeight));
    return { left: gridX, top: gridY };
}

// --- GESTOR DE VENTANAS (DRAG & DROP, RESIZE) ---
function initWindowManager() {
    const desktop = document.getElementById('desktop');

    // Drag & Drop
    document.addEventListener('mousedown', (e) => {
        const titlebar = e.target.closest('.window-titlebar');
        if (!titlebar) return;

        const win = titlebar.closest('.window');
        if (win.classList.contains('maximized')) return;

        focusWindow(win);

        const rect = win.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = rect.left;
        const startTop = rect.top;

        function onMouseMove(moveEvent) {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            // Limitar dentro del escritorio
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            if (newTop < 0) newTop = 0;
            if (newLeft < -win.offsetWidth + 100) newLeft = -win.offsetWidth + 100;
            if (newLeft > window.innerWidth - 100) newLeft = window.innerWidth - 100;

            win.style.left = `${newLeft}px`;
            win.style.top = `${newTop}px`;
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Resize
    document.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.resize-handle');
        if (!handle) return;

        const win = handle.closest('.window');
        if (win.classList.contains('maximized')) return;

        focusWindow(win);

        const rect = win.getBoundingClientRect();
        const startWidth = rect.width;
        const startHeight = rect.height;
        const startX = e.clientX;
        const startY = e.clientY;

        const type = handle.classList.contains('r') ? 'r' :
            handle.classList.contains('b') ? 'b' : 'se';

        function onMouseMove(moveEvent) {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            if (type === 'r' || type === 'se') {
                const newWidth = Math.max(320, startWidth + deltaX);
                win.style.width = `${newWidth}px`;
            }
            if (type === 'b' || type === 'se') {
                const newHeight = Math.max(240, startHeight + deltaY);
                win.style.height = `${newHeight}px`;
            }
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Redibujar gráficos si se cambia el tamaño de monitor de recursos
            if (win.id === 'win-monitor') {
                resizeCanvases();
            }
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Focus al hacer click dentro de una ventana
    desktop.addEventListener('mousedown', (e) => {
        const win = e.target.closest('.window');
        if (win) {
            focusWindow(win);
        }
    });

    // Controles de ventana (cerrar, minimizar, maximizar)
    desktop.addEventListener('click', (e) => {
        const btn = e.target.closest('.window-btn');
        if (!btn) return;

        const win = btn.closest('.window');

        if (btn.classList.contains('close')) {
            closeWindow(win);
        } else if (btn.classList.contains('minimize')) {
            minimizeWindow(win);
        } else if (btn.classList.contains('maximize')) {
            toggleMaximize(win);
        }
    });
}

function focusWindow(win) {
    if (UIState.activeWindow === win) return;

    // Quitar active de la anterior
    if (UIState.activeWindow) {
        UIState.activeWindow.classList.remove('active');
    }

    UIState.zIndexCounter++;
    win.style.zIndex = UIState.zIndexCounter;
    win.classList.add('active');
    UIState.activeWindow = win;

    // Actualizar estados en la barra de tareas
    updateTaskbarTabs();
}

function openWindow(winId) {
    const win = document.getElementById(winId);
    if (!win) return;

    // Centrar en pantalla si se abre por primera vez o estaba cerrada
    if (win.style.display === 'none' || !win.style.display) {
        win.style.display = 'flex';
        win.classList.remove('minimized');

        // Posicionamiento centrado escalonado
        const offset = (UIState.zIndexCounter % 10) * 15;
        win.style.left = `${(window.innerWidth - win.offsetWidth) / 2 + offset}px`;
        win.style.top = `${(window.innerHeight - win.offsetHeight) / 2 + offset}px`;
    }

    // Si estaba minimizada, restaurar
    if (win.classList.contains('minimized')) {
        win.classList.remove('minimized');
        UIState.minimizedWindows.delete(winId);
    }

    focusWindow(win);
    updateTaskbarTabs();
}

function closeWindow(win) {
    win.style.display = 'none';
    if (UIState.activeWindow === win) {
        UIState.activeWindow = null;
    }
    updateTaskbarTabs();
}

function minimizeWindow(win) {
    win.classList.add('minimized');
    UIState.minimizedWindows.add(win.id);
    if (UIState.activeWindow === win) {
        UIState.activeWindow = null;
        // Enfocar la siguiente ventana arriba
        const remaining = Array.from(document.querySelectorAll('.window'))
            .filter(w => w.style.display !== 'none' && !w.classList.contains('minimized'))
            .sort((a, b) => parseInt(b.style.zIndex || 0) - parseInt(a.style.zIndex || 0));
        if (remaining.length > 0) {
            focusWindow(remaining[0]);
        }
    }
    updateTaskbarTabs();
}

function toggleMaximize(win) {
    win.classList.toggle('maximized');
    if (win.id === 'win-monitor') {
        setTimeout(resizeCanvases, 250);
    }
}

// --- BARRA DE TAREAS Y MENÚ DE INICIO ---
function initTaskbar() {
    // Reloj
    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });

        document.getElementById('clock-time').textContent = timeStr;
        document.getElementById('clock-date').textContent = dateStr;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // Menú Inicio
    const startButton = document.getElementById('start-button');
    const startMenu = document.getElementById('start-menu');

    startButton.addEventListener('click', (e) => {
        e.stopPropagation();
        startMenu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!startMenu.contains(e.target) && e.target !== startButton) {
            startMenu.classList.remove('open');
        }
    });

    // Accesos del Menú de Inicio
    document.querySelectorAll('.start-app-item').forEach(item => {
        item.addEventListener('click', () => {
            const winId = item.getAttribute('data-win');
            openWindow(winId);
            startMenu.classList.remove('open');
        });
    });

    // Iconos de Escritorio — inicializar con el nuevo sistema de posición libre
    initDesktopIcons();
    initDesktopContextMenu();
}

function updateTaskbarTabs() {
    const shortcutsContainer = document.querySelector('.taskbar-shortcuts');
    shortcutsContainer.innerHTML = '';

    const windows = [
        { id: 'win-explorer', name: 'Explorador', icon: '📁' },
        { id: 'win-monitor', name: 'Task Manager', icon: '📊' },
        { id: 'win-terminal', name: 'AceTerminal', icon: '💻' },
        { id: 'win-browser', name: 'Navegador', icon: '🌐' },
        { id: 'win-kernel', name: 'Kernel Sim', icon: '⚙️' },
        { id: 'win-settings', name: 'Ajustes', icon: '🛠️' }
    ];

    windows.forEach(winInfo => {
        const win = document.getElementById(winInfo.id);
        if (win && win.style.display !== 'none') {
            const tab = document.createElement('div');
            tab.className = `task-tab ${UIState.activeWindow === win ? 'active' : ''}`;
            tab.innerHTML = `<span>${winInfo.icon}</span><span>${winInfo.name}</span>`;

            tab.addEventListener('click', () => {
                if (win.classList.contains('minimized')) {
                    win.classList.remove('minimized');
                    focusWindow(win);
                } else if (UIState.activeWindow === win) {
                    minimizeWindow(win);
                } else {
                    focusWindow(win);
                }
            });
            shortcutsContainer.appendChild(tab);
        }
    });
}

// =====================================================================
// --- SISTEMA DE ICONOS DEL ESCRITORIO (DRAG LIBRE + CARPETAS) ---
// =====================================================================

/**
 * Estado persistente de posiciones e iconos del escritorio
 * Formato: { id: { x, y, label, type, color, winId? } }
 */
const DesktopIconState = {
    // Carga desde localStorage o usa posición inicial (columna izquierda)
    positions: JSON.parse(localStorage.getItem('ace_desktop_icon_positions') || 'null'),

    save() {
        localStorage.setItem('ace_desktop_icon_positions', JSON.stringify(this.positions));
    },

    // Genera posición en cuadrícula para un icono nuevo (columna izquierda, de arriba abajo)
    getDefaultPosition(index) {
        const col = Math.floor(index / 8);
        const row = index % 8;
        return { x: 20 + col * 100, y: 20 + row * 100 };
    }
};

/**
 * Inicializa todos los iconos del escritorio como elementos libres y arrastrables
 */
function initDesktopIcons() {
    const container = document.getElementById('desktop-icons-container');
    const icons = Array.from(container.querySelectorAll('.desktop-icon'));

    // Si no hay posiciones guardadas, generamos las por defecto
    if (!DesktopIconState.positions) {
        const pos = {};
        icons.forEach((icon, i) => {
            pos[icon.id || ('icon-' + i)] = DesktopIconState.getDefaultPosition(i);
        });
        DesktopIconState.positions = pos;
        DesktopIconState.save();
    }

    icons.forEach((icon, i) => {
        const iconId = icon.id || ('icon-sys-' + i);
        if (!icon.id) icon.id = iconId;

        // Aplicar posición guardada o por defecto
        const savedPos = DesktopIconState.positions[iconId];
        if (savedPos) {
            icon.style.left = savedPos.x + 'px';
            icon.style.top  = savedPos.y + 'px';
        } else {
            const p = DesktopIconState.getDefaultPosition(i);
            icon.style.left = p.x + 'px';
            icon.style.top  = p.y + 'px';
            DesktopIconState.positions[iconId] = p;
            DesktopIconState.save();
        }

        // Hacer el icono arrastrable
        makeDraggableIcon(icon);

        // Click simple: selección
        icon.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            selectDesktopIcon(icon);
        });

        // Doble click: abrir ventana o carpeta
        icon.addEventListener('dblclick', () => {
            const winId = icon.getAttribute('data-win');
            if (winId) openWindow(winId);
        });
    });

    // Click en escritorio: deseleccionar
    document.getElementById('desktop').addEventListener('mousedown', (e) => {
        if (!e.target.closest('.desktop-icon') && !e.target.closest('.window')) {
            deselectAllIcons();
        }
    });
}

/**
 * Hace que un icono sea arrastrable libremente por el escritorio
 */
function makeDraggableIcon(icon) {
    let isDragging = false;
    let dragStartX, dragStartY, iconStartLeft, iconStartTop;
    let hasMoved = false;

    icon.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = icon.getBoundingClientRect();
        iconStartLeft = rect.left;
        iconStartTop = rect.top;
        hasMoved = false;

        function onMouseMove(e) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
                isDragging = true;
                hasMoved = true;
                icon.classList.add('dragging-icon');
                selectDesktopIcon(icon);
            }
            if (!isDragging) return;

            const desktop = document.getElementById('desktop');
            const dRect = desktop.getBoundingClientRect();
            let newLeft = iconStartLeft + dx - dRect.left;
            let newTop = iconStartTop + dy - dRect.top;
            newLeft = Math.max(0, Math.min(newLeft, dRect.width - icon.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, dRect.height - icon.offsetHeight));
            icon.style.left = newLeft + 'px';
            icon.style.top = newTop + 'px';
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (isDragging) {
                isDragging = false;
                icon.classList.remove('dragging-icon');
                // Snap a la cuadrícula
                const desktopRect = document.getElementById('desktop').getBoundingClientRect();
                const currentLeft = parseFloat(icon.style.left);
                const currentTop = parseFloat(icon.style.top);
                const snapped = snapToGrid(currentLeft, currentTop, icon.offsetWidth, icon.offsetHeight, desktopRect);
                icon.style.left = snapped.left + 'px';
                icon.style.top = snapped.top + 'px';
                const iconId = icon.id;
                if (!DesktopIconState.positions) DesktopIconState.positions = {};
                DesktopIconState.positions[iconId] = {
                    x: parseFloat(icon.style.left),
                    y: parseFloat(icon.style.top)
                };
                DesktopIconState.save();
            }
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

let _selectedIcon = null;

function selectDesktopIcon(icon) {
    deselectAllIcons();
    icon.classList.add('selected-icon');
    _selectedIcon = icon;
}

function deselectAllIcons() {
    document.querySelectorAll('.desktop-icon.selected-icon').forEach(i => i.classList.remove('selected-icon'));
    _selectedIcon = null;
}

/**
 * Crea un icono de carpeta del escritorio y lo añade al escritorio
 */
function createDesktopFolder(name, color) {
    if (!name || name.trim() === "") {
        alert("El nombre de la carpeta no puede estar vacío.");
        return null;
    }
    name = name.trim();
    const existing = document.querySelector(`.desktop-icon[data-folder="${name}"]`);
    if (existing) {
        alert(`Ya existe una carpeta llamada "${name}" en el escritorio.`);
        return null;
    }

    const folderId = 'desktop-folder-' + Date.now();
    const container = document.getElementById('desktop-icons-container');
    const allIcons = container.querySelectorAll('.desktop-icon').length;
    let pos = DesktopIconState.getDefaultPosition(allIcons);

    const folderEl = document.createElement('div');
    folderEl.className = 'desktop-icon desktop-folder-icon';
    folderEl.id = folderId;
    folderEl.setAttribute('data-folder', name);
    folderEl.style.left = pos.x + 'px';
    folderEl.style.top = pos.y + 'px';
    folderEl.innerHTML = `
        <div class="icon-wrapper">
            <svg viewBox="0 0 24 24" fill="${color || '#f59e0b'}" stroke="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 4H4c-1.1 0-2 .9-2 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" opacity="0.9"/>
            </svg>
        </div>
        <span>${name}</span>
    `;

    // Crear directorio real en VFS bajo /home/Desktop/<name>
    if (typeof vfs !== 'undefined') {
        if (!vfs.root.children['home']) vfs.mkdir('home');
        if (!vfs.root.children['home'].children['Desktop']) {
            vfs.root.children['home'].children['Desktop'] = new VFSNode('Desktop', 'dir');
        }
        const desktopDir = vfs.root.children['home'].children['Desktop'];
        if (!desktopDir.children[name]) {
            desktopDir.children[name] = new VFSNode(name, 'dir');
            vfs.saveToStorage();
            vfs.appendLog(`Carpeta real creada en VFS: /home/Desktop/${name}`);
        } else {
            alert(`Ya existe una carpeta con el nombre "${name}" en /home/Desktop.`);
            return null;
        }
    }

    if (!DesktopIconState.positions) DesktopIconState.positions = {};
    DesktopIconState.positions[folderId] = { x: pos.x, y: pos.y };
    saveDesktopFolders();

    container.appendChild(folderEl);
    makeDraggableIcon(folderEl);
    folderEl.addEventListener('mousedown', (e) => { if (e.button === 0) selectDesktopIcon(folderEl); });
    folderEl.addEventListener('dblclick', () => { openDesktopFolder(name); });
    folderEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showDesktopFolderContextMenu(e.clientX, e.clientY, folderEl, name, folderId);
    });

    selectDesktopIcon(folderEl);
    DesktopIconState.save();
    return folderEl;
}

/**
 * Abre el explorador VFS en la carpeta del escritorio
 */
function openDesktopFolder(name) {
    const homeNode = vfs.root.children['home'];
    if (!homeNode.children['Desktop']) {
        homeNode.children['Desktop'] = new VFSNode('Desktop', 'dir');
        vfs.saveToStorage();
    }
    const desktopDir = homeNode.children['Desktop'];
    if (!desktopDir.children[name]) {
        desktopDir.children[name] = new VFSNode(name, 'dir');
        vfs.saveToStorage();
    }
    openWindow('win-explorer');
    vfs.currentPath = ['home', 'Desktop', name];
    const pathBar = document.getElementById('path-bar-text');
    if (pathBar) pathBar.textContent = `/home/Desktop/${name}`;
    updateExplorerGrid();
}

/**
 * Persistencia de carpetas del escritorio en localStorage
 */
function saveDesktopFolders() {
    const folders = [];
    document.querySelectorAll('.desktop-icon.desktop-folder-icon').forEach(el => {
        folders.push({
            id: el.id,
            name: el.getAttribute('data-folder'),
            color: el.querySelector('svg path')?.getAttribute('fill') || '#f59e0b'
        });
    });
    localStorage.setItem('ace_desktop_folders', JSON.stringify(folders));
}

/**
 * Restaurar carpetas del escritorio al cargar
 */
function restoreDesktopFolders() {
    const raw = localStorage.getItem('ace_desktop_folders');
    if (!raw) return;
    try {
        const folders = JSON.parse(raw);
        folders.forEach(f => {
            // Evitar duplicados
            if (!document.getElementById(f.id)) {
                const el = createDesktopFolder(f.name, f.color);
                el.id = f.id;
                // Restaurar posición guardada
                const savedPos = DesktopIconState.positions?.[f.id];
                if (savedPos) {
                    el.style.left = savedPos.x + 'px';
                    el.style.top  = savedPos.y + 'px';
                }
            }
        });
    } catch (e) {
        console.error('Error restaurando carpetas del escritorio:', e);
    }
}

/**
 * Menú contextual específico para carpetas del escritorio
 */
function showDesktopFolderContextMenu(x, y, folderEl, folderName, folderId) {
    removeDesktopContextMenus();

    const menu = document.createElement('div');
    menu.className = 'desktop-context-menu';
    menu.id = 'desktop-ctx-menu';
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.innerHTML = `
        <div class="ctx-item" id="ctx-open-folder">
            <span class="ctx-icon">📂</span> Abrir carpeta
        </div>
        <div class="ctx-item" id="ctx-rename-folder">
            <span class="ctx-icon">✏️</span> Renombrar
        </div>
        <div class="ctx-separator"></div>
        <div class="ctx-item danger" id="ctx-delete-folder">
            <span class="ctx-icon">🗑️</span> Eliminar del escritorio
        </div>
    `;
    document.body.appendChild(menu);
    clampContextMenu(menu);

    menu.querySelector('#ctx-open-folder').addEventListener('click', () => {
        openDesktopFolder(folderName);
        removeDesktopContextMenus();
    });
    menu.querySelector('#ctx-rename-folder').addEventListener('click', () => {
        removeDesktopContextMenus();
        startIconRename(folderEl, (newName) => {
            folderEl.setAttribute('data-folder', newName);
            saveDesktopFolders();
        });
    });
    menu.querySelector('#ctx-delete-folder').addEventListener('click', () => {
        folderEl.remove();
        if (DesktopIconState.positions) {
            delete DesktopIconState.positions[folderId];
            DesktopIconState.save();
        }
        saveDesktopFolders();
        removeDesktopContextMenus();
    });

    setTimeout(() => {
        document.addEventListener('mousedown', onOutsideClick);
    }, 10);

    function onOutsideClick(e) {
        if (!menu.contains(e.target)) {
            removeDesktopContextMenus();
            document.removeEventListener('mousedown', onOutsideClick);
        }
    }
}

/**
 * Renombrar un icono del escritorio en línea
 */
function startIconRename(iconEl, onSave) {
    const spanEl = iconEl.querySelector('span');
    const currentName = spanEl.textContent;

    const input = document.createElement('input');
    input.className = 'icon-label-input';
    input.value = currentName;
    spanEl.replaceWith(input);
    input.focus();
    input.select();

    function finishRename() {
        const newName = input.value.trim() || currentName;
        const newSpan = document.createElement('span');
        newSpan.textContent = newName;
        input.replaceWith(newSpan);
        if (onSave) onSave(newName);
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishRename();
        if (e.key === 'Escape') {
            const s = document.createElement('span');
            s.textContent = currentName;
            input.replaceWith(s);
        }
    });
    input.addEventListener('blur', finishRename);
}

/**
 * Menú contextual del escritorio (clic derecho en área vacía)
 */
function initDesktopContextMenu() {
    const desktop = document.getElementById('desktop');

    desktop.addEventListener('contextmenu', (e) => {
        // Solo si el clic es en el escritorio vacío (no en icono o ventana)
        if (e.target.closest('.desktop-icon') || e.target.closest('.window')) return;
        e.preventDefault();
        showDesktopContextMenu(e.clientX, e.clientY);
    });
}

function showDesktopContextMenu(x, y) {
    removeDesktopContextMenus();

    const menu = document.createElement('div');
    menu.className = 'desktop-context-menu';
    menu.id = 'desktop-ctx-menu';
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    menu.innerHTML = `
        <div class="ctx-item" id="ctx-new-folder">
            <span class="ctx-icon">📁</span> Nueva carpeta
        </div>
        <div class="ctx-separator"></div>
        <div class="ctx-item" id="ctx-open-explorer">
            <span class="ctx-icon">🗂️</span> Abrir Explorador
        </div>
        <div class="ctx-item" id="ctx-open-terminal">
            <span class="ctx-icon">💻</span> Abrir Terminal
        </div>
        <div class="ctx-separator"></div>
        <div class="ctx-item" id="ctx-arrange-icons">
            <span class="ctx-icon">⚡</span> Reorganizar iconos
        </div>
    `;
    document.body.appendChild(menu);
    clampContextMenu(menu);

    menu.querySelector('#ctx-new-folder').addEventListener('click', () => {
        removeDesktopContextMenus();
        const name = prompt('Nombre de la nueva carpeta:', 'Nueva Carpeta');
        if (name && name.trim()) {
            createDesktopFolder(name.trim(), '#f59e0b');
        }
    });

    menu.querySelector('#ctx-open-explorer').addEventListener('click', () => {
        openWindow('win-explorer');
        removeDesktopContextMenus();
    });

    menu.querySelector('#ctx-open-terminal').addEventListener('click', () => {
        openWindow('win-terminal');
        removeDesktopContextMenus();
    });

    menu.querySelector('#ctx-arrange-icons').addEventListener('click', () => {
        autoArrangeDesktopIcons();
        removeDesktopContextMenus();
    });

    setTimeout(() => {
        document.addEventListener('mousedown', onOutsideClick);
    }, 10);

    function onOutsideClick(e) {
        if (!menu.contains(e.target)) {
            removeDesktopContextMenus();
            document.removeEventListener('mousedown', onOutsideClick);
        }
    }
}

/**
 * Elimina todos los menús contextuales del escritorio
 */
function removeDesktopContextMenus() {
    document.querySelectorAll('#desktop-ctx-menu, #vfs-context-menu').forEach(m => m.remove());
}

/**
 * Asegura que el menú no salga fuera de la pantalla
 */
function clampContextMenu(menu) {
    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth)  menu.style.left = (window.innerWidth  - rect.width  - 5) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 5) + 'px';
    });
}

/**
 * Reorganiza todos los iconos del escritorio en columnas
 */
function autoArrangeDesktopIcons() {
    const icons = Array.from(document.querySelectorAll('.desktop-icon'));
    const rowH = 100, colW = 100;
    const maxRows = Math.floor((window.innerHeight - 50) / rowH);

    icons.forEach((icon, i) => {
        const col = Math.floor(i / maxRows);
        const row = i % maxRows;
        const newX = 20 + col * colW;
        const newY = 20 + row * rowH;
        icon.style.left = newX + 'px';
        icon.style.top  = newY + 'px';

        if (!DesktopIconState.positions) DesktopIconState.positions = {};
        DesktopIconState.positions[icon.id] = { x: newX, y: newY };
    });
    DesktopIconState.save();
}

// Hacer funciones globales accesibles
window.createDesktopFolder  = createDesktopFolder;
window.autoArrangeDesktopIcons = autoArrangeDesktopIcons;

// --- INTEGRACIÓN CON BACKEND (MÉTRICAS REALES Y MOCK) ---
async function checkBackendConnection() {
    if (window.electronAPI) {
        UIState.backendConnected = true;
        document.getElementById('status-dot').className = 'status-dot connected';
        document.getElementById('status-text').textContent = 'Modo Nativo (Electron)';
        document.getElementById('tray-net').style.display = 'flex';
        return;
    }

    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            UIState.backendConnected = true;
            document.getElementById('status-dot').className = 'status-dot connected';
            document.getElementById('status-text').textContent = 'Backend Conectado (Tiempo Real)';
            document.getElementById('tray-net').style.display = 'flex';
        }
    } catch (e) {
        UIState.backendConnected = false;
        document.getElementById('status-dot').className = 'status-dot';
        document.getElementById('status-text').textContent = 'Simulado (Sin servidor)';
        document.getElementById('tray-net').style.display = 'none';
    }
}

async function fetchStats() {
    let cpu = 0, ram = 0, netDown = 0, netUp = 0;

    if (window.electronAPI) {
        try {
            const data = await window.electronAPI.getSystemStats();
            cpu = data.cpu_percent;
            ram = data.memory_percent;
            netDown = (data.net_speed_down || 0) / 1024 / 1024 * 8; // bps to Mbps
            netUp = (data.net_speed_up || 0) / 1024 / 1024 * 8;
        } catch (e) {
            console.error(e);
        }
    } else if (UIState.backendConnected) {
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();

            cpu = data.cpu_percent;
            ram = data.memory_percent;
            netDown = (data.net_speed_down || 0) / 1024 / 1024 * 8; // Convertir bytes/s a Mbps
            netUp = (data.net_speed_up || 0) / 1024 / 1024 * 8;
        } catch (e) {
            UIState.backendConnected = false;
        }
    }

    if (!UIState.backendConnected && !window.electronAPI) {
        // Fallback a simulación
        cpu = parseFloat((5 + Math.random() * 25).toFixed(1));
        ram = 42.6; // RAM estática simulada
        netDown = parseFloat((2 + Math.random() * 12).toFixed(1));
        netUp = parseFloat((0.2 + Math.random() * 3).toFixed(1));
    }

    // Guardar en histórico
    UIState.statsHistory.cpu.push(cpu);
    UIState.statsHistory.cpu.shift();
    UIState.statsHistory.ram.push(ram);
    UIState.statsHistory.ram.shift();
    UIState.statsHistory.netDown.push(netDown);
    UIState.statsHistory.netDown.shift();
    UIState.statsHistory.netUp.push(netUp);
    UIState.statsHistory.netUp.shift();

    // Actualizar UI
    document.getElementById('cpu-val').textContent = `${cpu}%`;
    document.getElementById('cpu-bar').style.width = `${cpu}%`;
    document.getElementById('cpu-bar').className = `progress-bar-fill ${cpu > 80 ? 'danger' : cpu > 50 ? 'warning' : 'normal'}`;

    document.getElementById('ram-val').textContent = `${ram}%`;
    document.getElementById('ram-bar').style.width = `${ram}%`;
    document.getElementById('ram-bar').className = `progress-bar-fill ${ram > 80 ? 'danger' : ram > 60 ? 'warning' : 'normal'}`;

    document.getElementById('net-down-val').textContent = `${netDown.toFixed(1)} Mbps`;
    document.getElementById('net-up-val').textContent = `${netUp.toFixed(1)} Mbps`;

    // Actualizar mini indicador en Taskbar
    document.getElementById('tray-cpu-txt').textContent = `${Math.round(cpu)}%`;
    document.getElementById('tray-ram-txt').textContent = `${Math.round(ram)}%`;

    // Redibujar gráficos si la pestaña activa es la de rendimiento
    drawGraphs();
}

async function fetchProcesses() {
    let processList = [];

    if (window.electronAPI) {
        try {
            processList = await window.electronAPI.getProcesses();
        } catch (e) {
            console.error(e);
        }
    } else if (UIState.backendConnected) {
        try {
            const res = await fetch('/api/processes');
            processList = await res.json();
        } catch (e) {
            UIState.backendConnected = false;
        }
    }

    if (!UIState.backendConnected && !window.electronAPI) {
        // Generar un poco de fluctuación en procesos simulados
        processList = UIState.simulatedProcesses.map(p => {
            if (p.pid !== 1) { // No fluctuar system
                p.cpu = parseFloat(Math.max(0.1, p.cpu + (Math.random() * 2 - 1)).toFixed(1));
            }
            return p;
        });
    }

    // Dibujar tabla
    const tbody = document.getElementById('proc-table-body');
    tbody.innerHTML = '';

    // Ordenar por uso de CPU descendente
    processList.sort((a, b) => b.cpu - a.cpu);

    processList.forEach(proc => {
        const tr = document.createElement('tr');
        const statusClass = proc.status === 'RUNNING' ? 'running' : proc.status === 'WAITING' ? 'waiting' : 'ready';

        tr.innerHTML = `
            <td>${proc.pid}</td>
            <td style="font-weight: 500;">${proc.name}</td>
            <td><span class="process-status ${statusClass}">${proc.status || 'READY'}</span></td>
            <td>${proc.cpu}%</td>
            <td>${proc.mem.toFixed(1)} MB</td>
            <td><button class="kill-btn" onclick="killSystemProcess(${proc.pid})">Terminar</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function killSystemProcess(pid) {
    if (window.electronAPI) {
        const success = await window.electronAPI.killProcess(pid);
        if (success) {
            fetchProcesses();
        } else {
            alert("Error: No se pudo terminar el proceso. Puede requerir permisos de Administrador.");
        }
    } else if (UIState.backendConnected) {
        try {
            const res = await fetch(`/api/kill?pid=${pid}`);
            if (res.ok) {
                fetchProcesses();
            } else {
                alert("Error: No se pudo terminar el proceso. Puede requerir permisos de Administrador.");
            }
        } catch (e) {
            console.error(e);
        }
    } else {
        // Modo simulado
        UIState.simulatedProcesses = UIState.simulatedProcesses.filter(p => p.pid !== pid);
        fetchProcesses();
        vfs.appendLog(`Proceso simulado terminado manualmente: PID ${pid}`);
    }
}

// Hacer disponible globalmente
window.killSystemProcess = killSystemProcess;

async function launchHostApp(appName) {
    if (window.electronAPI) {
        const success = await window.electronAPI.launchApp(appName);
        if (success) {
            vfs.appendLog(`Aplicación lanzada en host: ${appName}`);
            return true;
        }
    } else if (UIState.backendConnected) {
        try {
            const res = await fetch(`/api/launch?app=${appName}`);
            if (res.ok) {
                vfs.appendLog(`Aplicación lanzada en host: ${appName}`);
                return true;
            }
        } catch (e) {
            console.error(e);
        }
    }

    // Si no conecta al backend, emular apertura abriendo URLs si procede, o simulándolo
    vfs.appendLog(`Lanzamiento simulado de app: ${appName}`);
    if (appName === 'chrome' || appName === 'browser') {
        window.open('https://www.google.com', '_blank');
        return true;
    }
    return false;
}

// --- DIBUJADO DE GRÁFICOS (RESOURCE MONITOR CANVAS) ---
function resizeCanvases() {
    const canvases = ['cpu-canvas', 'ram-canvas', 'net-canvas'];
    canvases.forEach(id => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width - 30; // Margen interno
        canvas.height = 120;
    });
    drawGraphs();
}

function drawGraphs() {
    const cpuCanvas = document.getElementById('cpu-canvas');
    if (!cpuCanvas || cpuCanvas.offsetParent === null) return; // Si no está visible

    drawSingleGraph('cpu-canvas', UIState.statsHistory.cpu, '#3b82f6', '%');
    drawSingleGraph('ram-canvas', UIState.statsHistory.ram, '#10b981', '%');
    drawNetGraph('net-canvas', UIState.statsHistory.netDown, UIState.statsHistory.netUp);
}

function drawSingleGraph(canvasId, history, color, unit) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Fondo de cuadrícula
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Dibujar línea de métrica
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;

    const step = w / (history.length - 1);
    for (let i = 0; i < history.length; i++) {
        const val = history[i];
        const x = i * step;
        const y = h - (val / 100) * (h - 20) - 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Relleno degradado debajo de la línea
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color.replace(')', ', 0.3)').replace('rgb', 'rgba'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.closePath();
    ctx.fill();

    // Texto de valor actual
    ctx.fillStyle = '#f3f4f6';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${history[history.length - 1]}${unit}`, w - 45, 18);
}

function drawNetGraph(canvasId, downHistory, upHistory) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Cuadrícula
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Velocidad máxima para escalar
    const maxVal = Math.max(20, ...downHistory, ...upHistory);

    const step = w / (downHistory.length - 1);

    // Dibujar Bajada (Cian)
    ctx.beginPath();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    for (let i = 0; i < downHistory.length; i++) {
        const x = i * step;
        const y = h - (downHistory[i] / maxVal) * (h - 20) - 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dibujar Subida (Naranja)
    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < upHistory.length; i++) {
        const x = i * step;
        const y = h - (upHistory[i] / maxVal) * (h - 20) - 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Texto informativo
    ctx.fillStyle = '#06b6d4';
    ctx.font = '10px sans-serif';
    ctx.fillText(`DL: ${downHistory[downHistory.length - 1].toFixed(1)} Mbps`, w - 120, 16);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`UL: ${upHistory[upHistory.length - 1].toFixed(1)} Mbps`, w - 120, 28);
}

// --- TERMINAL PERSONALIZADA ---
const terminalCommandHistory = [];
let terminalHistoryIndex = -1;

function initTerminal() {
    const terminalInput = document.getElementById('term-input');
    const terminalHistory = document.getElementById('term-history');

    // Enfocar input al hacer click en el cuerpo de la terminal
    document.querySelector('.terminal-container').addEventListener('click', () => {
        terminalInput.focus();
    });

    terminalInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (terminalCommandHistory.length > 0) {
                if (terminalHistoryIndex < terminalCommandHistory.length - 1) {
                    terminalHistoryIndex++;
                }
                terminalInput.value = terminalCommandHistory[terminalCommandHistory.length - 1 - terminalHistoryIndex];
                // Mover cursor al final
                setTimeout(() => terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length), 0);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (terminalHistoryIndex > 0) {
                terminalHistoryIndex--;
                terminalInput.value = terminalCommandHistory[terminalCommandHistory.length - 1 - terminalHistoryIndex];
            } else {
                terminalHistoryIndex = -1;
                terminalInput.value = '';
            }
            return;
        }

        if (e.key === 'Enter') {
            const fullCommand = terminalInput.value.trim();
            terminalInput.value = '';

            if (fullCommand === '') return;

            // Guardar en historial de comandos
            terminalCommandHistory.push(fullCommand);
            terminalHistoryIndex = -1;

            // Agregar entrada al historial visual
            writeTerminalLine(`$ ${fullCommand}`, 'input');

            // Procesar comando
            processCommand(fullCommand);
        }
    });
}

function writeTerminalLine(text, type = 'output') {
    const history = document.getElementById('term-history');
    const div = document.createElement('div');
    div.className = `terminal-line ${type}`;
    div.textContent = text;
    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
}

function processCommand(fullCmd) {
    const parts = fullCmd.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
        case 'help':
            writeTerminalLine("Comandos Virtuales del Sistema:\n" +
                "  ls              - Listar archivos virtuales en directorio actual\n" +
                "  cd <dir>        - Cambiar directorio virtual\n" +
                "  mkdir <dir>     - Crear carpeta virtual\n" +
                "  cat <file>      - Visualizar contenido de archivo virtual\n" +
                "  echo <text> > <file> - Escribir a un archivo virtual\n" +
                "  rm <name>       - Borrar archivo o carpeta virtual\n" +
                "  free            - Mostrar estado de la memoria virtual y RAM real\n" +
                "  ps              - Listar procesos del kernel virtual\n" +
                "  kill <pid>      - Terminar proceso del kernel virtual\n" +
                "  alloc <bytes>   - Asignar bloque de memoria en Heap Virtual (PID 101)\n" +
                "  free_mem <addr> - Liberar bloque de memoria virtual por dirección\n" +
                "  usb <action>    - Simular dispositivo USB (mount/unmount)\n" +
                "  clear           - Limpiar terminal\n" +
                "  neofetch        - Mostrar especificaciones del sistema\n" +
                "Comandos de Sistema Real (Requieren backend):\n" +
                "  real_app <app>  - Lanzar app real en host (notepad, calc, chrome, paint)\n" +
                "  real_ps         - Mostrar procesos reales del host");
            break;

        case 'clear':
            document.getElementById('term-history').innerHTML = '';
            break;

        case 'usb':
            if (args[0] === 'mount') {
                if (typeof window.mountUSBDevice === 'function') {
                    window.mountUSBDevice();
                    writeTerminalLine("Dispositivo USB simulado montado exitosamente en /usb0", "success");
                }
            } else if (args[0] === 'unmount') {
                if (typeof window.unmountUSBDevice === 'function') {
                    window.unmountUSBDevice();
                    writeTerminalLine("Dispositivo USB simulado desmontado exitosamente", "success");
                }
            } else {
                writeTerminalLine("Uso: usb mount | usb unmount", "error");
            }
            break;

        case 'neofetch':
            const mode = UIState.backendConnected ? "Tiempo Real (Modo Host)" : "Simulado (Sin Servidor)";
            writeTerminalLine(
                `        /\\         Ace-a-DesktopOS [Versión 1.0]\n` +
                `       /  \\        Kernel: Round Robin Virtual Scheduler v1.0\n` +
                `      /\\  /\\       Resolución: ${window.innerWidth}x${window.innerHeight} px\n` +
                `     /  \\/  \\      Modo de Operación: ${mode}\n` +
                `    /___/\\___\\     Antivirus: AceDefender (${UIState.antivirusEnabled ? 'ACTIVO' : 'DESACTIVADO'})\n` +
                `                  Uptime del Sistema: ${Math.floor(performance.now() / 1000)} seg`, 'success'
            );
            break;

        case 'ls':
            const currentDir = vfs.getCurrentNode();
            const keys = Object.keys(currentDir.children);
            if (keys.length === 0) {
                writeTerminalLine("(directorio vacío)");
            } else {
                keys.forEach(k => {
                    const node = currentDir.children[k];
                    const typeIndicator = node.type === 'dir' ? '[DIR] ' : '      ';
                    writeTerminalLine(`${typeIndicator} ${node.name}   \t(${node.updatedAt})`);
                });
            }
            break;

        case 'cd':
            if (args.length === 0) {
                writeTerminalLine("Uso: cd <nombre_directorio>");
                break;
            }
            const target = args[0];
            const resolved = vfs.resolvePath(target);
            if (resolved && resolved.node.type === 'dir') {
                vfs.currentPath = resolved.path;
                document.getElementById('path-bar-text').textContent = "/" + vfs.currentPath.join('/');
                writeTerminalLine(`Cambiado a /${vfs.currentPath.join('/')}`);
            } else {
                writeTerminalLine(`ERROR: Directorio '${target}' no encontrado`, 'error');
            }
            break;

        case 'mkdir':
            if (args.length === 0) {
                writeTerminalLine("Uso: mkdir <nombre_directorio>");
                break;
            }
            if (vfs.mkdir(args[0])) {
                writeTerminalLine(`Carpeta creada con éxito: ${args[0]}`, 'success');
                updateExplorerGrid();
            } else {
                writeTerminalLine("ERROR: No se pudo crear. ¿Ya existe?", 'error');
            }
            break;

        case 'rm':
            if (args.length === 0) {
                writeTerminalLine("Uso: rm <nombre_archivo_o_carpeta>");
                break;
            }
            if (vfs.deleteNode(args[0])) {
                writeTerminalLine(`Elemento eliminado: ${args[0]}`, 'success');
                updateExplorerGrid();
            } else {
                writeTerminalLine(`ERROR: Elemento '${args[0]}' no encontrado`, 'error');
            }
            break;

        case 'cat':
            if (args.length === 0) {
                writeTerminalLine("Uso: cat <nombre_archivo>");
                break;
            }
            const fileRes = vfs.resolvePath(args[0]);
            if (fileRes && fileRes.node.type === 'file') {
                writeTerminalLine(fileRes.node.content);
            } else {
                writeTerminalLine(`ERROR: Archivo '${args[0]}' no encontrado`, 'error');
            }
            break;

        case 'echo':
            // echo texto > archivo
            const echoStr = args.join(' ');
            const redirectIndex = echoStr.indexOf('>');
            if (redirectIndex === -1) {
                writeTerminalLine(echoStr);
            } else {
                const text = echoStr.substring(0, redirectIndex).trim();
                const filename = echoStr.substring(redirectIndex + 1).trim();

                if (!filename) {
                    writeTerminalLine("Uso: echo <texto> > <nombre_archivo>", 'error');
                } else {
                    vfs.createFile(filename, text);
                    writeTerminalLine(`Escrito en archivo: ${filename}`, 'success');
                    updateExplorerGrid();
                }
            }
            break;

        case 'free':
            const heapStats = heap.getStats();
            writeTerminalLine(`--- MEMORIA VIRTUAL ---`);
            writeTerminalLine(`  Total: ${heapStats.total} Bytes`);
            writeTerminalLine(`  Usado: ${heapStats.used} Bytes (${heapStats.percent}%)`);
            writeTerminalLine(`  Libre: ${heapStats.free} Bytes`);
            writeTerminalLine(`--- MEMORIA RAM REAL (Host) ---`);
            if (UIState.backendConnected) {
                fetch('/api/stats')
                    .then(res => res.json())
                    .then(data => {
                        writeTerminalLine(`  Consumo Real: ${data.memory_percent}%`);
                    });
            } else {
                writeTerminalLine(`  Consumo Real (Simulado): 42.6%`);
            }
            break;

        case 'ps':
            writeTerminalLine(`--- TABLA DE PROCESOS VIRTUALES (KERNEL) ---`);
            writeTerminalLine(`PID\tNombre\t\tEstado\t\tCPU Ticks\tDir.Memoria`);
            scheduler.processes.forEach(p => {
                writeTerminalLine(`${p.pid}\t${p.name.padEnd(12, ' ')}\t${p.status.padEnd(10, ' ')}\t${p.cpuTime}/${p.cpuBurst}\t\tDir ${p.memAddress} (${p.memSize}B)`);
            });
            if (scheduler.processes.length === 0) {
                writeTerminalLine("(No hay procesos virtuales activos)");
            }
            break;

        case 'kill':
            if (args.length === 0) {
                writeTerminalLine("Uso: kill <pid>");
                break;
            }
            const kPid = parseInt(args[0]);
            if (scheduler.killProcess(kPid)) {
                writeTerminalLine(`Proceso virtual ${kPid} terminado con éxito`, 'success');
                updateKernelUI();
            } else {
                writeTerminalLine(`ERROR: Proceso virtual con PID ${kPid} no encontrado`, 'error');
            }
            break;

        case 'alloc':
            if (args.length === 0) {
                writeTerminalLine("Uso: alloc <bytes>");
                break;
            }
            const size = parseInt(args[0]);
            const addr = heap.alloc(size, 101, "ShellTerm");
            if (addr !== -1) {
                writeTerminalLine(`Memoria asignada en dirección virtual: ${addr} (Propietario PID: 101)`, 'success');
                updateKernelUI();
            } else {
                writeTerminalLine(`ERROR: Bloque de ${size} bytes no disponible (Fragmentación o falta de espacio)`, 'error');
            }
            break;

        case 'free_mem':
            if (args.length === 0) {
                writeTerminalLine("Uso: free_mem <direccion_inicial>");
                break;
            }
            const mAddr = parseInt(args[0]);
            if (heap.free(mAddr)) {
                writeTerminalLine(`Memoria virtual en dirección ${mAddr} liberada con éxito`, 'success');
                updateKernelUI();
            } else {
                writeTerminalLine(`ERROR: No hay ninguna asignación en la dirección ${mAddr}`, 'error');
            }
            break;

        case 'real_app':
            if (args.length === 0) {
                writeTerminalLine("Uso: real_app <notepad | calc | chrome | paint>");
                break;
            }
            launchHostApp(args[0]).then(success => {
                if (success) writeTerminalLine(`Solicitud de ejecución para '${args[0]}' enviada.`, 'success');
                else writeTerminalLine(`ERROR: No se pudo lanzar '${args[0]}'. ¿Está el backend encendido?`, 'error');
            });
            break;

        case 'real_ps':
            if (!UIState.backendConnected) {
                writeTerminalLine("ERROR: Este comando requiere conexión activa con el Backend (server.py)", 'error');
                break;
            }
            writeTerminalLine("Consultando procesos reales del host...");
            fetch('/api/processes')
                .then(res => res.json())
                .then(procs => {
                    writeTerminalLine(`PID\t\tProceso (Host)\t\tCPU%\tMemoria`);
                    procs.slice(0, 15).forEach(p => {
                        writeTerminalLine(`${p.pid.toString().padEnd(6, ' ')}\t${p.name.padEnd(20, ' ')}\t${p.cpu}%\t${p.mem.toFixed(1)} MB`);
                    });
                    writeTerminalLine(`... mostrando primeros 15 procesos del Host.`);
                });
            break;

        default:
            writeTerminalLine(`Comando no reconocido: '${cmd}'. Escribe 'help' para ver la lista.`, 'error');
    }
}

// --- EXPLORADOR DE ARCHIVOS VIRTUAL (VFS) ---
function initExplorer() {
    updateExplorerGrid();

    // Toolbar superior
    document.getElementById('explorer-back-btn').addEventListener('click', () => {
        if (vfs.currentPath.length > 0) {
            vfs.currentPath.pop();
            document.getElementById('path-bar-text').textContent = "/" + vfs.currentPath.join('/');
            updateExplorerGrid();
        }
    });

    document.getElementById('explorer-mkdir-btn').addEventListener('click', () => {
        const name = prompt("Nombre de la nueva carpeta:");
        if (name && name.trim()) {
            if (vfs.mkdir(name.trim())) updateExplorerGrid();
            else alert("Error al crear carpeta (ya existe o nombre inválido).");
        } else if (name !== null) alert("El nombre no puede estar vacío.");
    });

    document.getElementById('explorer-mkfile-btn').addEventListener('click', () => {
        const name = prompt("Nombre del archivo (ej. notas.txt):");
        if (name && name.trim()) {
            if (vfs.createFile(name.trim(), "Editar contenido aquí.")) updateExplorerGrid();
            else alert("Error al crear el archivo.");
        } else if (name !== null) alert("El nombre no puede estar vacío.");
    });
}

function updateExplorerGrid() {
    const grid = document.getElementById('explorer-grid');
    grid.innerHTML = '';

    const currentNode = vfs.getCurrentNode();
    
    // Si estamos en Papelera, mostrar botón para vaciarla
    const toolbar = document.querySelector('.explorer-toolbar');
    let emptyTrashBtn = document.getElementById('empty-trash-btn');
    if (vfs.currentPath.length === 1 && vfs.currentPath[0] === 'Papelera') {
        if (!emptyTrashBtn) {
            emptyTrashBtn = document.createElement('button');
            emptyTrashBtn.id = 'empty-trash-btn';
            emptyTrashBtn.className = 'toolbar-btn';
            emptyTrashBtn.style.color = 'var(--color-danger)';
            emptyTrashBtn.textContent = '🗑️ Vaciar';
            emptyTrashBtn.title = 'Vaciar Papelera';
            emptyTrashBtn.addEventListener('click', () => {
                if (confirm('¿Vaciar la papelera de reciclaje?')) {
                    const papeleraNode = vfs.root.children['Papelera'];
                    if (papeleraNode) {
                        papeleraNode.children = {};
                        vfs.saveToStorage();
                        updateExplorerGrid();
                    }
                }
            });
            toolbar.appendChild(emptyTrashBtn);
        }
    } else {
        if (emptyTrashBtn) {
            emptyTrashBtn.remove();
        }
    }

    // Dibujar elementos
    for (let key in currentNode.children) {
        const node = currentNode.children[key];
        const item = document.createElement('div');
        item.className = `file-item ${node.type}`;

        let iconSvg = '';
        if (node.type === 'dir') {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
        } else {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
        }

        item.innerHTML = `
            ${iconSvg}
            <span>${node.name}</span>
        `;

        item.addEventListener('click', () => {
            // Seleccionar o Doble Click
            item.classList.add('selected');
        });

        item.addEventListener('dblclick', () => {
            if (node.type === 'dir') {
                vfs.currentPath.push(node.name);
                document.getElementById('path-bar-text').textContent = "/" + vfs.currentPath.join('/');
                updateExplorerGrid();
            } else {
                openFileWithViewer(node.name);
            }
        });

        // Context Menu (Click derecho)
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // Eliminar menús previos
            const existingMenu = document.getElementById('vfs-context-menu');
            if (existingMenu) existingMenu.remove();
            
            const menu = document.createElement('div');
            menu.id = 'vfs-context-menu';
            menu.className = 'context-menu';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
            
            const deleteOption = document.createElement('div');
            deleteOption.className = 'context-menu-item';
            deleteOption.textContent = '🗑️ Eliminar';
            deleteOption.addEventListener('click', () => {
                moveToTrash(node.name);
                menu.remove();
            });
            
            menu.appendChild(deleteOption);
            document.body.appendChild(menu);
            
            const closeMenu = (evt) => {
                if (!menu.contains(evt.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        });

        grid.appendChild(item);
    }
}

function moveToTrash(name) {
    if (vfs.currentPath.length === 1 && vfs.currentPath[0] === 'Papelera') {
        if (confirm(`¿Eliminar permanentemente '${name}'? Esta acción no se puede deshacer.`)) {
            vfs.deleteNode(name);
            updateExplorerGrid();
        }
        return;
    }
    if (!confirm(`¿Mover '${name}' a la Papelera?`)) return;
    const currentNode = vfs.getCurrentNode();
    const node = currentNode.children[name];
    if (node) {
        if (!vfs.root.children['Papelera']) vfs.root.children['Papelera'] = new VFSNode('Papelera', 'dir');
        let trashName = name;
        let counter = 1;
        while (vfs.root.children['Papelera'].children[trashName]) trashName = `${name}_(${counter++})`;
        vfs.root.children['Papelera'].children[trashName] = node;
        node.name = trashName;
        delete currentNode.children[name];
        vfs.saveToStorage();
        updateExplorerGrid();
        if (typeof vfs !== 'undefined' && vfs.appendLog) vfs.appendLog(`Archivo '${name}' movido a la Papelera.`);
    }
}

// Editor de Textos Integrado (Notepad)
function openNotepad(filename, fileNode) {
    const notepad = document.getElementById('notepad-subview');
    notepad.style.display = 'flex';
    document.getElementById('notepad-title').textContent = `Editor: ${filename}`;
    const textarea = document.getElementById('notepad-text');
    textarea.value = fileNode.content;

    const saveBtn = document.getElementById('notepad-save');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', () => {
        fileNode.content = textarea.value;
        fileNode.updatedAt = new Date().toLocaleString();
        vfs.saveToStorage();
        if (typeof vfs !== 'undefined' && vfs.appendLog) vfs.appendLog(`Archivo virtual editado: ${filename}`);
        notepad.style.display = 'none';
        updateExplorerGrid();
    });

    const cancelBtn = document.getElementById('notepad-close');
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
        notepad.style.display = 'none';
    });
}

function openImageViewer(filename, fileNode) {
    const viewer = document.getElementById('image-viewer-subview');
    viewer.style.display = 'flex';
    document.getElementById('image-viewer-title').textContent = `Visor: ${filename}`;
    document.getElementById('image-viewer-img').src = fileNode.content;

    const closeBtn = document.getElementById('image-viewer-close');
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', () => {
        viewer.style.display = 'none';
    });
}

function openPdfViewer(filename, fileNode) {
    const viewer = document.getElementById('pdf-viewer-subview');
    viewer.style.display = 'flex';
    document.getElementById('pdf-viewer-title').textContent = `PDF: ${filename}`;
    document.getElementById('pdf-viewer-frame').src = fileNode.content;

    const closeBtn = document.getElementById('pdf-viewer-close');
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', () => {
        viewer.style.display = 'none';
    });
}

function openFileWithViewer(filename) {
    const currentNode = vfs.getCurrentNode();
    const fileNode = currentNode.children[filename];
    if (!fileNode) return;

    const lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
        openImageViewer(filename, fileNode);
    } else if (lowerName.endsWith('.pdf')) {
        openPdfViewer(filename, fileNode);
    } else {
        openNotepad(filename, fileNode);
    }
}

// --- NAVEGADOR WEB Y SEGURIDAD ---
function initBrowser() {
    const input = document.getElementById('browser-url-input');
    const viewReal = document.getElementById('browser-real-view');
    const viewDownloads = document.getElementById('browser-downloads-view');
    const webviewFallback = document.getElementById('browser-web-fallback');
    const webview = document.getElementById('browser-webview');
    const btnDownloads = document.getElementById('browser-btn-downloads');
    const btnHome = document.getElementById('browser-btn-home');

    let showingDownloads = false;

    // Si no estamos en Electron, mostrar fallback
    if (!window.electronAPI) {
        if (webview) webview.style.display = 'none';
        if (webviewFallback) webviewFallback.style.display = 'flex';
    }

    // Botón Descargas: alternar panel de descargas
    btnDownloads.addEventListener('click', () => {
        showingDownloads = !showingDownloads;
        if (showingDownloads) {
            viewReal.style.display = 'none';
            viewDownloads.style.display = 'flex';
            showBrowserDownloads();
        } else {
            viewReal.style.display = 'flex';
            viewDownloads.style.display = 'none';
        }
    });

    // Botón Home: volver al navegador
    btnHome.addEventListener('click', () => {
        showingDownloads = false;
        viewReal.style.display = 'flex';
        viewDownloads.style.display = 'none';
        if (window.electronAPI && webview) {
            webview.loadURL('https://www.google.com');
        }
        input.value = 'https://www.google.com';
    });

    // Evento de URL Input (Enter)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            let url = input.value.trim();
            if (window.electronAPI && webview) {
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                // Asegurarse de que estamos viendo el navegador real
                showingDownloads = false;
                viewReal.style.display = 'flex';
                viewDownloads.style.display = 'none';
                webview.loadURL(url);
            }
        }
    });

    // Inicializar lógica de Webview si estamos en Electron
    if (window.electronAPI) {
        initRealBrowser();
    }
}

// Control del Webview de Electron
function initRealBrowser() {
    const webview = document.getElementById('browser-webview');
    const input = document.getElementById('browser-url-input');
    const btnBack = document.getElementById('browser-btn-back');
    const btnForward = document.getElementById('browser-btn-forward');
    const btnReload = document.getElementById('browser-btn-reload');
    const spinner = document.getElementById('browser-loading');
    const sslIcon = document.getElementById('browser-ssl-icon');

    if (!webview) return;

    // Controles de Navegación
    btnBack.addEventListener('click', () => {
        if (webview.canGoBack()) {
            webview.goBack();
        }
    });

    btnForward.addEventListener('click', () => {
        if (webview.canGoForward()) {
            webview.goForward();
        }
    });

    btnReload.addEventListener('click', () => {
        webview.reload();
    });

    // Eventos del Webview
    webview.addEventListener('did-start-loading', () => {
        spinner.style.display = 'flex';
    });

    webview.addEventListener('did-stop-loading', () => {
        spinner.style.display = 'none';
        btnBack.disabled = !webview.canGoBack();
        btnForward.disabled = !webview.canGoForward();
    });

    webview.addEventListener('did-navigate', (e) => {
        input.value = e.url;
        sslIcon.textContent = e.url.startsWith('https') ? '🔒' : '⚠️';
        if (!e.url.startsWith('https')) {
            sslIcon.style.color = 'var(--color-warning)';
        } else {
            sslIcon.style.color = 'var(--color-success)';
        }
    });

    webview.addEventListener('did-navigate-in-page', (e) => {
        input.value = e.url;
    });
}

function startSimulatedDownload(filename, isMalicious) {
    // Abrir pestaña de descargas
    const viewReal = document.getElementById('browser-real-view');
    const viewDownloads = document.getElementById('browser-downloads-view');
    if (viewReal && viewDownloads) {
        viewReal.style.display = 'none';
        viewDownloads.style.display = 'flex';
    }

    const dlId = Date.now();
    const download = {
        id: dlId,
        name: filename,
        progress: 0,
        status: 'DESCARGANDO', // DESCARGANDO, ESCANEANDO, COMPLETADO, BLOQUEADO
        isMalicious: isMalicious
    };

    UIState.downloads.unshift(download);
    showBrowserDownloads();

    if (typeof vfs !== 'undefined' && vfs.appendLog) vfs.appendLog(`Descarga iniciada: ${filename}`);

    // Intervalo de descarga
    const interval = setInterval(() => {
        download.progress += 20;
        if (download.progress >= 100) {
            clearInterval(interval);
            download.progress = 100;

            // Iniciar escaneo de seguridad
            download.status = 'ESCANEANDO';
            showBrowserDownloads();

            setTimeout(() => {
                if (download.isMalicious) {
                    if (UIState.antivirusEnabled) {
                        download.status = 'BLOQUEADO';
                        triggerSecurityAlert(download.name);
                    } else {
                        // Si está desactivado, se descarga con éxito
                        download.status = 'COMPLETADO';
                        if (typeof vfs !== 'undefined') {
                            vfs.createFile(download.name, "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
                            vfs.appendLog(`ADVERTENCIA: Archivo malicioso '${download.name}' descargado. Antivirus deshabilitado.`);
                        }
                    }
                } else {
                    download.status = 'COMPLETADO';
                    if (typeof vfs !== 'undefined') {
                        vfs.createFile(download.name, "Contenido binario simulado de " + download.name);
                        vfs.appendLog(`Descarga completada: ${download.name} (Guardado en VFS /home)`);
                    }
                }
                showBrowserDownloads();
                if (typeof updateExplorerGrid !== 'undefined') updateExplorerGrid();
            }, 1200);
        }
        showBrowserDownloads();
    }, 400);
}

window.startSimulatedDownload = startSimulatedDownload;

function showBrowserDownloads() {
    const content = document.getElementById('browser-content');
    if (UIState.downloads.length === 0) {
        content.innerHTML = `
            <h3>Descargas</h3>
            <p style="color:var(--text-secondary); margin-top:10px; margin-bottom: 20px;">No hay descargas recientes.</p>
            <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px;">
                <h4 style="margin-bottom: 10px;">Enlaces de prueba del simulador</h4>
                <button class="kernel-btn" onclick="startSimulatedDownload('Guia_Alumno.pdf', false)">Descargar PDF Seguro</button>
                <button class="kernel-btn" style="background:#dc2626" onclick="startSimulatedDownload('eicar_com.zip', true)">Descargar Virus de Prueba</button>
            </div>
        `;
        return;
    }

    let listHtml = `<div class="downloads-list">`;
    UIState.downloads.forEach(dl => {
        let statusText = '';
        let progressStyle = '';
        let icon = dl.isMalicious ? '⚠️' : '📄';

        if (dl.status === 'DESCARGANDO') {
            statusText = `Descargando... ${dl.progress}%`;
            progressStyle = `style="width: ${dl.progress}%; background:var(--color-accent)"`;
        } else if (dl.status === 'ESCANEANDO') {
            statusText = `<span class="dl-item-status scanning">Analizando firmas de virus (AceDefender)...</span>`;
            progressStyle = `style="width: 100%; background:var(--color-warning)"`;
        } else if (dl.status === 'COMPLETADO') {
            statusText = `<span class="dl-item-status completed">Completado y analizado. Seguro.</span>`;
            progressStyle = `style="width: 100%; background:var(--color-success)"`;
        } else if (dl.status === 'BLOQUEADO') {
            statusText = `<span class="dl-item-status blocked">BLOQUEADO POR SEGURIDAD. AMENAZA ELIMINADA.</span>`;
            progressStyle = `style="width: 100%; background:var(--color-danger)"`;
        }

        listHtml += `
            <div class="dl-item">
                <div class="dl-item-info">
                    <span style="font-size:24px">${icon}</span>
                    <div>
                        <div class="dl-item-name">${dl.name}</div>
                        <div class="dl-item-status">${statusText}</div>
                        <div class="progress-bar-bg" style="width: 250px; height:4px; margin-top:6px;">
                            <div class="progress-bar-fill" ${progressStyle}></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    listHtml += `</div>`;
    content.innerHTML = `<h3>Descargas del Navegador</h3><br>${listHtml}`;
}

function triggerSecurityAlert(filename) {
    // Alarma visual
    const overlay = document.getElementById('security-alert-overlay');
    overlay.className = 'security-alert-overlay show';

    document.getElementById('sec-filename').textContent = filename;
    vfs.appendLog(`¡AMENAZA DETECTADA!: Descarga de '${filename}' bloqueada y eliminada.`);

    // Indicador en taskbar a rojo temporal
    const traySec = document.getElementById('tray-sec');
    traySec.className = 'sys-indicator warning';

    // Registrar log de seguridad
    UIState.securityLogs.unshift({
        time: new Date().toLocaleTimeString(),
        file: filename,
        action: 'Bloqueado y destruido'
    });
    updateSettingsLogs();

    // Botón de cerrar alarma
    const closeBtn = document.getElementById('security-close-btn');
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', () => {
        overlay.className = 'security-alert-overlay';
        traySec.className = 'sys-indicator secure';
    });
}

// --- SIMULADOR DE KERNEL (ROUND ROBIN Y HEAP GRID) ---
function initKernelSimulator() {
    renderHeapGrid();

    // Controles
    document.getElementById('kernel-start').addEventListener('click', () => {
        if (UIState.schedulerTickInterval) {
            // Pausar
            clearInterval(UIState.schedulerTickInterval);
            UIState.schedulerTickInterval = null;
            document.getElementById('kernel-start').innerHTML = `<span>▶️</span> Iniciar`;
            vfs.appendLog("Planificador Virtual Pausado.");
        } else {
            // Iniciar
            const quantumVal = parseInt(document.getElementById('kernel-quantum').value) || 3;
            scheduler.quantum = quantumVal;

            UIState.schedulerTickInterval = setInterval(() => {
                scheduler.tick();
                updateKernelUI();
            }, UIState.schedulerSpeed);

            document.getElementById('kernel-start').innerHTML = `<span>⏸️</span> Pausar`;
            vfs.appendLog(`Planificador Virtual Iniciado. Quantum = ${quantumVal} ticks.`);
        }
    });

    // Añadir Proceso simulado manual
    document.getElementById('proc-add-btn').addEventListener('click', () => {
        const name = document.getElementById('proc-name').value.trim() || "ManualProc";
        const burst = parseInt(document.getElementById('proc-burst').value) || 5;
        const priority = parseInt(document.getElementById('proc-priority').value) || 3;
        const memory = parseInt(document.getElementById('proc-memory').value) || 16;

        const pcb = scheduler.addProcess(name, burst, priority, memory);
        if (pcb) {
            updateKernelUI();
        } else {
            alert("No se pudo crear el proceso (Falta de Memoria Virtual).");
        }
    });
}

function renderHeapGrid() {
    const grid = document.getElementById('heap-grid');
    grid.innerHTML = '';

    // Crear tooltip si no existe
    let tooltip = document.getElementById('heap-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'heap-tooltip';
        tooltip.className = 'tooltip';
        tooltip.style.display = 'none';
        document.body.appendChild(tooltip);
    }

    for (let i = 0; i < heap.size; i++) {
        const cell = document.createElement('div');
        cell.className = 'heap-cell';
        cell.setAttribute('data-addr', i);

        // Si está asignado
        const pid = heap.memory[i];
        if (pid !== 0) {
            cell.className = 'heap-cell allocated';
            // Color según PID para distinguir
            const hue = (pid * 47) % 360;
            cell.style.backgroundColor = `hsl(${hue}, 80%, 45%)`;
        }

        cell.addEventListener('mouseover', (e) => {
            const addr = parseInt(cell.getAttribute('data-addr'));
            const cellPid = heap.memory[addr];

            if (cellPid !== 0) {
                const allocation = heap.allocations.find(a => addr >= a.address && addr < a.address + a.size);
                if (allocation) {
                    tooltip.innerHTML = `
                        <strong>Dirección:</strong> ${addr}<br>
                        <strong>PID Owner:</strong> ${allocation.pid}<br>
                        <strong>Nombre:</strong> ${allocation.name}<br>
                        <strong>Bloque:</strong> ${allocation.address} a ${allocation.address + allocation.size - 1} (${allocation.size} bytes)
                    `;
                }
            } else {
                tooltip.innerHTML = `<strong>Dirección:</strong> ${addr}<br><strong>Estatus:</strong> Libre`;
            }
            tooltip.style.display = 'block';
        });

        cell.addEventListener('mousemove', (e) => {
            tooltip.style.left = `${e.pageX + 10}px`;
            tooltip.style.top = `${e.pageY + 10}px`;
        });

        cell.addEventListener('mouseout', () => {
            tooltip.style.display = 'none';
        });

        grid.appendChild(cell);
    }
}

function updateKernelUI() {
    renderHeapGrid();

    // Estadísticas
    const stats = heap.getStats();
    document.getElementById('kernel-mem-val').textContent = `${stats.used}/${stats.total} B (${stats.percent}%)`;
    document.getElementById('kernel-ticks').textContent = scheduler.systemTicks;

    // CPU registers
    if (scheduler.runningPid) {
        const runningPcb = scheduler.processes.find(p => p.pid === scheduler.runningPid);
        document.getElementById('kernel-cpu-pid').textContent = scheduler.runningPid;
        document.getElementById('kernel-cpu-quantum').textContent = `${scheduler.quantumUsed}/${scheduler.quantum}`;
        document.getElementById('kernel-cpu-inst').textContent = runningPcb ? `${runningPcb.cpuTime}/${runningPcb.cpuBurst}` : '0/0';
    } else {
        document.getElementById('kernel-cpu-pid').textContent = 'IDLE';
        document.getElementById('kernel-cpu-quantum').textContent = '0/0';
        document.getElementById('kernel-cpu-inst').textContent = '0/0';
    }

    // Tabla de procesos en Kernel
    const tbody = document.getElementById('kernel-table-body');
    tbody.innerHTML = '';

    scheduler.processes.forEach(p => {
        const tr = document.createElement('tr');
        const statusClass = p.status.toLowerCase();

        tr.innerHTML = `
            <td>${p.pid}</td>
            <td style="font-weight: 600;">${p.name}</td>
            <td><span class="process-status ${statusClass}">${p.status}</span></td>
            <td>${p.cpuTime}/${p.cpuBurst} ticks</td>
            <td>${p.memSize} Bytes (dir ${p.memAddress})</td>
            <td><button class="kill-btn" onclick="killVirtualProcess(${p.pid})">Kill</button></td>
        `;
        tbody.appendChild(tr);
    });

    // Logs en el kernel pane
    const logList = document.getElementById('kernel-logs-list');
    logList.innerHTML = '';
    scheduler.logs.forEach(log => {
        const li = document.createElement('div');
        li.style.fontSize = '11px';
        li.style.marginBottom = '4px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
        li.style.paddingBottom = '2px';
        li.innerHTML = `<span style="color:var(--text-secondary)">[${log.time}]</span> ${log.text}`;
        logList.appendChild(li);
    });
}

function killVirtualProcess(pid) {
    scheduler.killProcess(pid);
    updateKernelUI();
}

window.killVirtualProcess = killVirtualProcess;

// --- APLICACIÓN DE AJUSTES ---
function initSettings() {
    // Wallpapers
    document.querySelectorAll('.wp-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.wp-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');

            const desktop = document.getElementById('desktop');
            // Limpiar clases previas
            desktop.className = '';

            if (opt.classList.contains('wp-blue')) desktop.classList.add('wp-gradient-blue');
            else if (opt.classList.contains('wp-purple')) desktop.classList.add('wp-gradient-purple');
            else if (opt.classList.contains('wp-dark')) desktop.classList.add('wp-gradient-dark');
            else if (opt.classList.contains('wp-emerald')) desktop.classList.add('wp-gradient-emerald');
        });
    });

    // Toggle Antivirus
    const avToggle = document.getElementById('av-toggle');
    avToggle.addEventListener('change', () => {
        UIState.antivirusEnabled = avToggle.checked;
        const traySec = document.getElementById('tray-sec');

        if (UIState.antivirusEnabled) {
            traySec.className = 'sys-indicator secure';
            traySec.querySelector('span:last-child').textContent = 'Protegido';
            vfs.appendLog("AceDefender: Protección antivirus habilitada.");
        } else {
            traySec.className = 'sys-indicator warning';
            traySec.querySelector('span:last-child').textContent = 'Vulnerable';
            vfs.appendLog("AceDefender: ¡Protección antivirus deshabilitada por el usuario!");
        }
        updateSettingsLogs();
    });

    // Velocidad de simulación
    const tickSpeedRange = document.getElementById('settings-tickspeed');
    tickSpeedRange.addEventListener('input', () => {
        const val = parseInt(tickSpeedRange.value);
        UIState.schedulerSpeed = val;
        document.getElementById('tickspeed-val').textContent = `${val} ms`;

        // Reiniciar intervalo si estaba corriendo
        if (UIState.schedulerTickInterval) {
            clearInterval(UIState.schedulerTickInterval);
            UIState.schedulerTickInterval = setInterval(() => {
                scheduler.tick();
                updateKernelUI();
            }, UIState.schedulerSpeed);
        }
    });

    updateSettingsLogs();
}

function updateSettingsLogs() {
    const list = document.getElementById('settings-sec-logs');
    if (UIState.securityLogs.length === 0) {
        list.innerHTML = `<li style="font-size:12px; color:var(--text-secondary)">No hay registros de seguridad.</li>`;
        return;
    }
    list.innerHTML = '';
    UIState.securityLogs.forEach(log => {
        const li = document.createElement('li');
        li.style.fontSize = '12px';
        li.style.marginBottom = '6px';
        li.innerHTML = `<span style="color:var(--text-secondary)">[${log.time}]</span> Archivo: <strong>${log.file}</strong> - Accion: <span style="color:var(--color-danger)">${log.action}</span>`;
        list.appendChild(li);
    });
}

// --- ARRANQUE INICIAL ---
function playExternalDeviceSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        // Sonido ascendente tipo conexión
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
        console.error("No se pudo reproducir el sonido", e);
    }
}

// --- NUEVAS APLICACIONES: CÁMARA Y GALERÍA ---
function initCamera() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    const captureBtn = document.getElementById('camera-capture');
    const saveBtn = document.getElementById('camera-save');
    const closeBtn = document.getElementById('camera-close');
    let capturedImageData = null;

    async function startCamera() {
        if (UIState.cameraStream) UIState.cameraStream.getTracks().forEach(track => track.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            UIState.cameraStream = stream;
            video.play();
        } catch (err) { alert("No se pudo acceder a la cámara: " + err.message); }
    }

    captureBtn.addEventListener('click', () => {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        capturedImageData = canvas.toDataURL('image/png');
        const preview = document.getElementById('camera-preview-img');
        preview.src = capturedImageData;
        preview.style.display = 'block';
        saveBtn.disabled = false;
    });

    saveBtn.addEventListener('click', () => {
        if (!capturedImageData) return;
        const timestamp = Date.now();
        const filename = `camera_${timestamp}.png`;
        if (typeof vfs !== 'undefined') {
            if (!vfs.root.children['home']) vfs.mkdir('home');
            if (!vfs.root.children['home'].children['Pictures']) vfs.root.children['home'].children['Pictures'] = new VFSNode('Pictures', 'dir');
            const pictures = vfs.root.children['home'].children['Pictures'];
            pictures.children[filename] = new VFSNode(filename, 'file', capturedImageData);
            vfs.saveToStorage();
            vfs.appendLog(`Foto guardada: ${filename}`);
            alert(`Foto guardada en /home/Pictures/${filename}`);
            capturedImageData = null;
            saveBtn.disabled = true;
            document.getElementById('camera-preview-img').style.display = 'none';
        } else alert("VFS no disponible");
    });

    closeBtn.addEventListener('click', () => {
        if (UIState.cameraStream) { UIState.cameraStream.getTracks().forEach(track => track.stop()); UIState.cameraStream = null; }
        document.getElementById('win-camera').style.display = 'none';
    });

    const winCamera = document.getElementById('win-camera');
    const observer = new MutationObserver((mutations) => {
        if (winCamera.style.display === 'flex') startCamera();
        else if (UIState.cameraStream) { UIState.cameraStream.getTracks().forEach(track => track.stop()); UIState.cameraStream = null; }
    });
    observer.observe(winCamera, { attributes: true, attributeFilter: ['style'] });
}

function initGallery() {
    const galleryGrid = document.getElementById('gallery-grid');
    const fullscreenView = document.getElementById('gallery-fullscreen');
    const fullscreenImg = document.getElementById('gallery-fullscreen-img');
    const closeFullscreen = document.getElementById('gallery-close-fullscreen');

    function loadGallery() {
        galleryGrid.innerHTML = '';
        const picturesDir = vfs.root.children['home']?.children['Pictures'];
        if (!picturesDir) { galleryGrid.innerHTML = '<p style="color:var(--text-secondary); text-align:center;">No hay imágenes. Usa la Cámara para tomar fotos.</p>'; return; }
        const imageFiles = Object.values(picturesDir.children).filter(node => node.type === 'file' && /\.(png|jpg|jpeg)$/i.test(node.name));
        if (imageFiles.length === 0) { galleryGrid.innerHTML = '<p style="color:var(--text-secondary); text-align:center;">No hay imágenes. Usa la Cámara para tomar fotos.</p>'; return; }
        imageFiles.forEach(imgNode => {
            const card = document.createElement('div');
            card.className = 'gallery-item';
            const img = document.createElement('img');
            img.src = imgNode.content;
            img.alt = imgNode.name;
            const span = document.createElement('span');
            span.textContent = imgNode.name;
            card.appendChild(img);
            card.appendChild(span);
            card.addEventListener('click', () => { fullscreenImg.src = imgNode.content; fullscreenView.style.display = 'flex'; });
            galleryGrid.appendChild(card);
        });
    }

    closeFullscreen.addEventListener('click', () => { fullscreenView.style.display = 'none'; fullscreenImg.src = ''; });

    const winGallery = document.getElementById('win-gallery');
    const observer = new MutationObserver((mutations) => { if (winGallery.style.display === 'flex') loadGallery(); });
    observer.observe(winGallery, { attributes: true, attributeFilter: ['style'] });
}

function openCamera() { openWindow('win-camera'); }
function openGallery() { openWindow('win-gallery'); }
window.openCamera = openCamera;
window.openGallery = openGallery;

window.addEventListener('DOMContentLoaded', () => {
    initWindowManager();
    initTaskbar();

    // Inicializar aplicaciones
    initTerminal();
    initExplorer();
    initBrowser();
    initKernelSimulator();
    initSettings();
    initCamera();
    initGallery();

    // Restaurar carpetas de escritorio persistidas
    restoreDesktopFolders();

        // Añadir iconos de cámara y galería si no existen
    const container = document.getElementById('desktop-icons-container');
    if (!document.getElementById('icon-camera')) {
        const cameraIcon = document.createElement('div');
        cameraIcon.className = 'desktop-icon';
        cameraIcon.id = 'icon-camera';
        cameraIcon.setAttribute('data-win', 'win-camera');
        cameraIcon.innerHTML = `<div class="icon-wrapper"><svg viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div><span>Cámara</span>`;
        cameraIcon.addEventListener('dblclick', () => openCamera());
        container.appendChild(cameraIcon);
        makeDraggableIcon(cameraIcon);
    }
    if (!document.getElementById('icon-gallery')) {
        const galleryIcon = document.createElement('div');
        galleryIcon.className = 'desktop-icon';
        galleryIcon.id = 'icon-gallery';
        galleryIcon.setAttribute('data-win', 'win-gallery');
        galleryIcon.innerHTML = `<div class="icon-wrapper"><svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><circle cx="8.5" cy="8.5" r="2.5"/><path d="M21 15l-5-4-3 3-4-4-5 5"/></svg></div><span>Galería</span>`;
        galleryIcon.addEventListener('dblclick', () => openGallery());
        container.appendChild(galleryIcon);
        makeDraggableIcon(galleryIcon);
    }

    // Ajustar posiciones de los nuevos iconos (para que queden en la cuadrícula)
    const allIcons = Array.from(container.querySelectorAll('.desktop-icon'));
    allIcons.forEach((icon, idx) => {
        if (!DesktopIconState.positions[icon.id]) {
            const pos = DesktopIconState.getDefaultPosition(idx);
            icon.style.left = pos.x + 'px';
            icon.style.top = pos.y + 'px';
            DesktopIconState.positions[icon.id] = pos;
        }
    });
    DesktopIconState.save();

    // Listener para icono de papelera — dblclick abre el explorador en la papelera
    const iconPapelera = document.getElementById('icon-papelera');
    if (iconPapelera) {
        iconPapelera.addEventListener('dblclick', () => {
            openWindow('win-explorer');
            
            // Asegurarnos de que el directorio existe
            if (!vfs.root.children['Papelera']) {
                vfs.root.children['Papelera'] = new VFSNode('Papelera', 'dir');
                vfs.saveToStorage();
            }
            
            vfs.currentPath = ['Papelera'];
            const pathText = document.getElementById('path-bar-text');
            if(pathText) pathText.textContent = '/Papelera';
            updateExplorerGrid();
        });
    }

    // Sistema de Login
    initLogin();

    // Detección de dispositivos externos (USB)
    if (navigator.usb) {
        // Revisar dispositivos ya conectados al iniciar
        navigator.usb.getDevices().then(devices => {
            if (devices.length > 0) {
                if (typeof vfs !== 'undefined' && vfs.appendLog) {
                    vfs.appendLog(`Dispositivo externo previo detectado: ${devices[0].productName || 'Desconocido'}`);
                }
                mountUSBDevice();
            }
        }).catch(err => console.error("Error al obtener USBs:", err));

        // Escuchar conexiones nuevas
        navigator.usb.addEventListener('connect', (e) => {
            playExternalDeviceSound();
            if (typeof vfs !== 'undefined') {
                if (vfs.appendLog) vfs.appendLog(`Dispositivo externo conectado: ${e.device.productName || 'Desconocido'}`);
                mountUSBDevice();
            }
        });

        // Escuchar desconexiones
        navigator.usb.addEventListener('disconnect', (e) => {
            if (typeof vfs !== 'undefined') {
                if (vfs.appendLog) vfs.appendLog(`Dispositivo externo desconectado.`);
                unmountUSBDevice();
            }
        });
    }

    // Montar el USB de prueba por defecto para que la imagen sea visible
    mountUSBDevice();

    // Rellenar procesos virtuales del planificador por defecto
    scheduler.addProcess("Init", 8, 1, 8);
    scheduler.addProcess("DiskService", 12, 2, 16);
    scheduler.addProcess("MathCalc", 6, 3, 24);
    updateKernelUI();

    // Loop de refresco de estadísticas de red/CPU
    checkBackendConnection().then(() => {
        fetchStats();
        fetchProcesses();

        // Intervalos de refresco
        UIState.realTimeStatsInterval = setInterval(fetchStats, 1000);
        UIState.realTimeProcInterval = setInterval(fetchProcesses, 3000);
    });

    // Redimensionado de ventana
    window.addEventListener('resize', () => {
        resizeCanvases();
    });

    // Abrir de bienvenida por defecto abriendo el explorador de archivos
    openWindow('win-explorer');
});

// --- LÓGICA DE LOGIN Y USUARIOS ---
function initLogin() {
    const loginScreen = document.getElementById('login-screen');
    const loginUsernameDisplay = document.getElementById('login-username-display');
    const loginAvatar = document.getElementById('login-avatar');
    const loginPassword = document.getElementById('login-password');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const loginSwitchBtn = document.getElementById('login-switch-btn');
    const loginUsersList = document.getElementById('login-users-list');
    const loginError = document.getElementById('login-error');
    const menuSwitchUserBtn = document.getElementById('menu-switch-user');

    let currentUser = 'Ignacio';

    function attemptLogin() {
        // Validación de contraseña ficticia
        if (loginPassword.value === '1234' || loginPassword.value === '') {
            loginScreen.classList.remove('show');
            loginPassword.value = '';
            loginError.textContent = '';
            UIState.currentUser = currentUser;
            document.querySelector('.user-name').textContent = currentUser;
            document.querySelector('.avatar').textContent = currentUser.charAt(0).toUpperCase();
            if (typeof vfs !== 'undefined' && vfs.appendLog) vfs.appendLog(`Sesión iniciada como: ${currentUser}`);
        } else {
            loginError.textContent = 'Contraseña incorrecta';
        }
    }

    loginSubmitBtn.addEventListener('click', attemptLogin);
    loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });

    loginSwitchBtn.addEventListener('click', () => {
        loginUsersList.style.display = loginUsersList.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelectorAll('.login-user-option').forEach(opt => {
        opt.addEventListener('click', () => {
            currentUser = opt.getAttribute('data-user');
            loginUsernameDisplay.textContent = currentUser;
            loginAvatar.textContent = opt.getAttribute('data-avatar');
            loginUsersList.style.display = 'none';
            loginError.textContent = '';
            loginPassword.value = '';
            loginPassword.focus();
        });
    });

    // Logout from start menu
    menuSwitchUserBtn.addEventListener('click', () => {
        document.getElementById('start-menu').classList.remove('open');
        loginScreen.classList.add('show');
        loginPassword.value = '';
        loginError.textContent = '';
        if (typeof vfs !== 'undefined' && vfs.appendLog) vfs.appendLog(`Sesión de ${currentUser} bloqueada.`);
    });
}

// --- MONTAJE DE DISPOSITIVOS USB ---
function mountUSBDevice() {
    const root = vfs.root;

    // Crear el directorio virtual asegurándonos que esté en la raíz absoluta
    if (!root.children['usb0']) {
        root.children['usb0'] = new VFSNode('usb0', 'dir');
        vfs.saveToStorage();
    }

    // Generar un pixel transparente en base64 para la imagen
    const mockImageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    // Un PDF base64 vacio/simple (minimal)
    const mockPdfBase64 = "data:application/pdf;base64,JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSCgkgICAgPj4KICA+PgogIC9Db250ZW50cyA1IDAgUgo+PgplbmRvYmoKCjQgMCBvYmoKPDwKICAvVHlwZSAvRm9udAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvVGltZXMtUm9tYW4KPj4KZW5kb2JqCgo1IDAgb2JqICAlIHBhZ2UgY29udGVudAo8PAogIC9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCjcwIDUwIFRECi9GMSAxMiBUZgooSG9sYSBQREYgU2ltdWxhZG8pIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxMCAwMDAwMCBuIAowMDAwMDAwMDc5IDAwMDAwIG4gCjAwMDAwMDAxNzMgMDAwMDAgbiAKMDAwMDAwMDMwMSAwMDAwMCBuIAowMDAwMDAwMzgwIDAwMDAwIG4gCnRyYWlsZXIKPDwKICAvU2l6ZSA2CiAgL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjQ3NgolJUVPRgo=";

    // Inyectar en nodo VFS
    if (root.children['usb0']) {
        root.children['usb0'].children['imagen_prueba.png'] = new VFSNode('imagen_prueba.png', 'file', mockImageBase64);
        root.children['usb0'].children['documento.pdf'] = new VFSNode('documento.pdf', 'file', mockPdfBase64);
        root.children['usb0'].children['gasli ig.jpg'] = new VFSNode('gasli ig.jpg', 'file', 'Gasli ig.jpeg');
        
        // Agregar también a root para máxima visibilidad (solicitado por usuario)
        root.children['gasli ig.jpg'] = new VFSNode('gasli ig.jpg', 'file', 'Gasli ig.jpeg');
        
        vfs.saveToStorage();
    }

    updateExplorerGrid();

    // Añadir icono temporal al escritorio
    if (!document.getElementById('icon-usb0')) {
        const desktopIcons = document.getElementById('desktop-icons-container');
        const usbIcon = document.createElement('div');
        usbIcon.className = 'desktop-icon';
        usbIcon.id = 'icon-usb0';
        usbIcon.innerHTML = `
            <div class="icon-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M4 10h16v10H4z"/><path d="M8 4h8v6H8z"/></svg>
            </div>
            <span>Unidad USB</span>
        `;
        usbIcon.addEventListener('dblclick', () => {
            openWindow('win-explorer');
            vfs.currentPath = ['usb0'];
            document.getElementById('path-bar-text').textContent = '/usb0';
            updateExplorerGrid();
        });
        desktopIcons.appendChild(usbIcon);

        // Hacerlo arrastrable como el resto de iconos del escritorio
        if (!DesktopIconState.positions) DesktopIconState.positions = {};
        if (!DesktopIconState.positions['icon-usb0']) {
            const allIcons = desktopIcons.querySelectorAll('.desktop-icon').length;
            DesktopIconState.positions['icon-usb0'] = DesktopIconState.getDefaultPosition(allIcons - 1);
            DesktopIconState.save();
        }
        const usbPos = DesktopIconState.positions['icon-usb0'];
        usbIcon.style.left = usbPos.x + 'px';
        usbIcon.style.top  = usbPos.y + 'px';
        makeDraggableIcon(usbIcon);
    }

    // Añadir a sidebar del explorador
    const sidebar = document.getElementById('explorer-sidebar');
    if (sidebar && !document.getElementById('sidebar-usb0')) {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.id = 'sidebar-usb0';
        item.innerHTML = `<span>💾</span> Pendrive (/usb0)`;
        item.addEventListener('click', () => {
            vfs.currentPath = ['usb0'];
            document.getElementById('path-bar-text').textContent = '/usb0';
            updateExplorerGrid();
        });
        sidebar.appendChild(item);
    }
}

function unmountUSBDevice() {
    if (vfs.root.children['usb0']) {
        delete vfs.root.children['usb0'];
        vfs.saveToStorage();
    }

    // Si el usuario estaba dentro del usb, sacarlo a la raiz
    if (vfs.currentPath.length > 0 && vfs.currentPath[0] === 'usb0') {
        vfs.currentPath = [];
        const pathText = document.getElementById('path-bar-text');
        if (pathText) pathText.textContent = '/';
    }

    updateExplorerGrid();

    const usbIcon = document.getElementById('icon-usb0');
    if (usbIcon) usbIcon.remove();

    const sidebarUsb = document.getElementById('sidebar-usb0');
    if (sidebarUsb) sidebarUsb.remove();
}

window.mountUSBDevice = mountUSBDevice;
window.unmountUSBDevice = unmountUSBDevice;