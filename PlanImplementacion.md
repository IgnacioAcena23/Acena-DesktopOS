# Plan de Implementación — Reconocimiento de Dispositivos de E/S (USB / Pendrive)
### Ace-a-DesktopOS · Equipo Antigravity

---

## Contexto de arquitectura

El proyecto ya tiene la separación perfecta: `main.js` corre en Node.js con acceso al sistema, `preload.js` actúa como puente, y `app.js` maneja la UI. El patrón que ya usan para `system:getStats` y `system:launchApp` es exactamente el mismo que se aplica aquí. No hay que inventar nada nuevo, solo extender lo que ya funciona.

### Diagrama de capas

```
┌─────────────────────────────────────────────────────────────┐
│          CAPA 1 — Host real (Node.js / main.js)             │
│   usb-detection (npm)  │  chokidar (watch path)  │  fs API  │
└────────────────────────┬────────────────────────────────────┘
                         │  ipcMain.handle
┌────────────────────────▼────────────────────────────────────┐
│          CAPA 2 — Puente IPC (preload.js)                   │
│   usb:list / usb:readFile  │  electronAPI.getUsbDevices     │
│                            │  evento push usb:change        │
└────────────────────────┬────────────────────────────────────┘
                         │  ipcRenderer.on
┌────────────────────────▼────────────────────────────────────┐
│          CAPA 3 — Renderer UI (app.js + index.html)         │
│   openWindow(win-usb)  │  renderFileList(entries)           │
│                        │  previewFile(type, path)           │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de evento USB — secuencia de tiempo

```
[1] USB insertado  →  [2] OS monta ruta  →  [3] IPC notifica UI  →  [4] UI abre explorador
```

---

## Tabla resumen de hitos

| Hito | Archivo | Tarea | Complejidad |
|------|---------|-------|-------------|
| 1.1 | `package.json` | `pnpm add usb-detection chokidar` | Baja |
| 1.2 | `main.js` | `usbDetect.on('add/remove')` + `getMountPath` | Media |
| 1.3 | `main.js` | Handlers `usb:readDir`, `usb:readTextFile`, `usb:readImageFile` | Baja |
| 2.1 | `preload.js` | Agregar 6 entradas al `contextBridge` | Baja |
| 3.1 | `index.html` | HTML de `win-usb` con breadcrumb + lista + preview | Baja |
| 3.2 | `style.css` | Estilos `.usb-entry`, `.usb-icon`, `.usb-name` | Baja |
| 4.1 | `app.js` | `navigateUsb()` y `previewFile()` | Media |
| 4.2 | `app.js` | Listeners `onUsbInserted/Removed/Changed` | Baja |
| 5.1 | `server.py` | Endpoint `/api/usb/list` para modo navegador | Baja |
| 5.2 | `app.js` | Fallback fetch a `/api/usb/list` si no hay Electron | Media |

---

## Fase 1 — Detección en el proceso principal (`main.js`)

### Dependencias a instalar

```bash
pnpm add usb-detection chokidar
```

- **`usb-detection`**: addon nativo de Node que recibe eventos del driver USB del SO.
- **`chokidar`**: vigila el path montado (la letra de unidad en Windows, `/media/...` en Linux) para detectar cambios en el sistema de archivos.

### Código a agregar en `main.js`

```javascript
const usbDetect = require('usb-detection');
const chokidar  = require('chokidar');
const fs        = require('fs');
const path      = require('path');

// Mapa de dispositivos actualmente montados: serialNumber → { mountPath, watcher }
const mountedDevices = new Map();

// Detectar plataforma para obtener el mountPath correcto
function getMountPath(device) {
  if (process.platform === 'win32') {
    // En Windows, usb-detection no da la letra de unidad directamente.
    // Usamos wmic para correlacionar el vendor/product con la letra asignada.
    return getWindowsDriveLetter(device);
  } else {
    // Linux/macOS montan en /media/<usuario>/<label> o /Volumes/<label>
    return findPosixMountPath(device);
  }
}

// Arrancar monitoreo cuando Electron está listo
app.whenReady().then(() => {
  usbDetect.startMonitoring();

  usbDetect.on('add', async (device) => {
    const mountPath = await getMountPath(device);
    if (!mountPath) return;

    // Guardar referencia
    mountedDevices.set(device.serialNumber, { device, mountPath });

    // Notificar al renderer
    if (mainWindow) {
      mainWindow.webContents.send('usb:inserted', {
        serialNumber: device.serialNumber,
        label: device.deviceName || 'Pendrive',
        mountPath,
      });
    }

    // Observar cambios en el filesystem del USB
    const watcher = chokidar.watch(mountPath, { depth: 0 });
    watcher.on('all', () => {
      if (mainWindow) mainWindow.webContents.send('usb:changed', { mountPath });
    });
    mountedDevices.get(device.serialNumber).watcher = watcher;
  });

  usbDetect.on('remove', (device) => {
    const entry = mountedDevices.get(device.serialNumber);
    if (entry?.watcher) entry.watcher.close();
    mountedDevices.delete(device.serialNumber);
    if (mainWindow) mainWindow.webContents.send('usb:removed', {
      serialNumber: device.serialNumber
    });
  });

  createMainWindow();
});

app.on('will-quit', () => usbDetect.stopMonitoring());
```

### Handlers IPC para lectura de archivos

```javascript
// Listar el contenido de una carpeta del USB
ipcMain.handle('usb:readDir', async (event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDir: e.isDirectory(),
      fullPath: path.join(dirPath, e.name),
      ext: path.extname(e.name).toLowerCase(),
    }));
  } catch { return []; }
});

// Leer un archivo de texto del USB para preview
ipcMain.handle('usb:readTextFile', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return content.slice(0, 50000); // Limitar a 50 KB por seguridad
  } catch { return null; }
});

// Leer imagen como base64 (para mostrar en canvas)
ipcMain.handle('usb:readImageFile', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).slice(1);
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${data.toString('base64')}`;
  } catch { return null; }
});
```

### Función `getWindowsDriveLetter` (detalle Windows)

```javascript
const { exec } = require('child_process');

function getWindowsDriveLetter(device) {
  return new Promise((resolve) => {
    // Correlaciona por VendorID + ProductID con la lista de discos removibles
    const cmd = `wmic logicaldisk where "DriveType=2" get DeviceID /VALUE`;
    exec(cmd, { encoding: 'utf-8' }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const match = stdout.match(/DeviceID=([A-Z]:)/);
      resolve(match ? match[1] + '\\' : null);
    });
    // Timeout de seguridad: el SO puede tardar ~1s en montar
    setTimeout(() => resolve(null), 3000);
  });
}
```

> **Nota para Antigravity:** en Windows puede haber un retraso de hasta 2-3 segundos entre que `usb-detection` emite el evento `add` y que el SO termina de montar la unidad. La función espera con timeout; si regresa `null`, se reintenta desde la UI con un botón de "recargar".

---

## Fase 2 — Puente seguro (`preload.js`)

Agregar estas líneas al `contextBridge.exposeInMainWorld` existente:

```javascript
// En el objeto que ya existe dentro de contextBridge.exposeInMainWorld('electronAPI', { ... })

// Escuchar eventos push del proceso principal
onUsbInserted : (cb) => ipcRenderer.on('usb:inserted', (_, data) => cb(data)),
onUsbRemoved  : (cb) => ipcRenderer.on('usb:removed',  (_, data) => cb(data)),
onUsbChanged  : (cb) => ipcRenderer.on('usb:changed',  (_, data) => cb(data)),

// Leer contenido del dispositivo
readUsbDir       : (dirPath)  => ipcRenderer.invoke('usb:readDir',       dirPath),
readUsbTextFile  : (filePath) => ipcRenderer.invoke('usb:readTextFile',  filePath),
readUsbImageFile : (filePath) => ipcRenderer.invoke('usb:readImageFile', filePath),
```

---

## Fase 3 — Ventana de explorador USB en `index.html`

Agregar el HTML de la ventana siguiendo el patrón de las ventanas existentes del proyecto:

```html
<!-- Ventana: USB Explorer -->
<div class="window" id="win-usb" style="display:none; width:680px; height:480px; top:80px; left:100px;">
  <div class="window-titlebar" data-win="win-usb">
    <span class="win-icon">💾</span>
    <span class="win-title" id="usb-win-title">Pendrive</span>
    <div class="window-controls">
      <button class="win-btn minimize" data-target="win-usb">—</button>
      <button class="win-btn maximize" data-target="win-usb">□</button>
      <button class="win-btn close"    data-target="win-usb">✕</button>
    </div>
  </div>
  <div class="window-content" style="display:flex; flex-direction:column; height:100%;">

    <!-- Barra de ruta -->
    <div id="usb-breadcrumb" style="padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.08); font-size:12px; color:#9ca3af;">
      📂 /
    </div>

    <!-- Lista de archivos -->
    <div id="usb-file-list" style="flex:1; overflow-y:auto; padding:8px;">
      <!-- Generado dinámicamente por app.js -->
    </div>

    <!-- Panel de preview -->
    <div id="usb-preview" style="height:140px; border-top:1px solid rgba(255,255,255,0.08); padding:8px; overflow:auto; display:none;">
    </div>

  </div>
</div>
```

---

## Fase 4 — Lógica de UI en `app.js`

```javascript
// ── Estado del explorador USB ────────────────────────────────
let usbCurrentPath  = null;
let usbMountRoot    = null;
let usbDeviceLabel  = 'Pendrive';

// ── Registrar listeners al arrancar ──────────────────────────
if (window.electronAPI?.isElectron) {

  window.electronAPI.onUsbInserted((data) => {
    usbMountRoot   = data.mountPath;
    usbDeviceLabel = data.label;
    document.getElementById('usb-win-title').textContent = data.label;

    // Mostrar notificación en el log del sistema
    showUsbNotification(data.label);

    // Abrir ventana automáticamente
    openWindow('win-usb');
    navigateUsb(data.mountPath);
  });

  window.electronAPI.onUsbRemoved(() => {
    closeWindow('win-usb');
    usbMountRoot   = null;
    usbCurrentPath = null;
  });

  window.electronAPI.onUsbChanged(() => {
    if (usbCurrentPath) navigateUsb(usbCurrentPath);
  });
}

// ── Navegar a una carpeta del USB ─────────────────────────────
async function navigateUsb(dirPath) {
  if (!window.electronAPI?.isElectron) return;
  usbCurrentPath = dirPath;

  // Actualizar breadcrumb
  const rel = dirPath.replace(usbMountRoot, '') || '/';
  document.getElementById('usb-breadcrumb').textContent = `💾 ${usbDeviceLabel}${rel}`;

  const entries = await window.electronAPI.readUsbDir(dirPath);
  const list    = document.getElementById('usb-file-list');
  list.innerHTML = '';

  // Botón "subir un nivel"
  if (dirPath !== usbMountRoot) {
    const parent = require('path').dirname(dirPath);
    list.insertAdjacentHTML('beforeend',
      buildEntryRow('⬆', '..', true, () => navigateUsb(parent))
    );
  }

  entries.forEach(entry => {
    const icon = entry.isDir ? '📁' : getFileIcon(entry.ext);
    const row  = document.createElement('div');
    row.className = 'usb-entry';
    row.innerHTML = `<span class="usb-icon">${icon}</span><span class="usb-name">${entry.name}</span>`;
    row.onclick   = () => entry.isDir ? navigateUsb(entry.fullPath) : previewFile(entry);
    list.appendChild(row);
  });
}

// ── Vista previa de archivo ───────────────────────────────────
async function previewFile(entry) {
  const preview = document.getElementById('usb-preview');
  preview.style.display = 'block';
  preview.innerHTML = '<span style="color:#9ca3af">Cargando...</span>';

  const imgExts   = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const textExts  = ['.txt', '.md', '.js', '.html', '.css', '.json', '.py', '.log', '.csv'];
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac'];
  const videoExts = ['.mp4', '.webm', '.mov'];

  if (imgExts.includes(entry.ext)) {
    const b64 = await window.electronAPI.readUsbImageFile(entry.fullPath);
    if (b64) preview.innerHTML =
      `<img src="${b64}" style="max-height:130px; border-radius:6px;">`;

  } else if (textExts.includes(entry.ext)) {
    const text = await window.electronAPI.readUsbTextFile(entry.fullPath);
    preview.innerHTML =
      `<pre style="margin:0; font-size:11px; color:#e2e8f0; white-space:pre-wrap;">${escapeHtml(text)}</pre>`;

  } else if (audioExts.includes(entry.ext)) {
    // Usar protocolo file:// — Electron lo permite desde el renderer
    preview.innerHTML =
      `<audio controls style="width:100%" src="file://${entry.fullPath.replace(/\\/g,'/')}"></audio>`;

  } else if (videoExts.includes(entry.ext)) {
    preview.innerHTML =
      `<video controls style="max-height:130px; border-radius:6px;"
        src="file://${entry.fullPath.replace(/\\/g,'/')}"></video>`;

  } else {
    preview.innerHTML =
      `<span style="color:#9ca3af; font-size:12px;">Sin vista previa para ${entry.ext}</span>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────
function getFileIcon(ext) {
  const map = {
    '.mp3': '🎵', '.flac': '🎵', '.wav': '🎵', '.ogg': '🎵',
    '.mp4': '🎬', '.mov': '🎬', '.webm': '🎬',
    '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️',
    '.pdf': '📄',
    '.zip': '🗜️', '.rar': '🗜️', '.7z': '🗜️',
    '.txt': '📝', '.md': '📝',
    '.js': '💻', '.py': '💻', '.html': '💻', '.css': '💻',
  };
  return map[ext] ?? '📄';
}

function escapeHtml(str) {
  return str?.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') ?? '';
}

function showUsbNotification(label) {
  // Reutilizar el sistema de notificaciones que ya tiene el proyecto
  addLog?.(`💾 Dispositivo USB detectado: ${label}`);
}
```

---

## Fase 5 — Fallback para modo navegador (`server.py`)

Cuando el proyecto corre sin Electron, el `server.py` puede exponer un endpoint que liste archivos de una ruta dada. Útil para demostración en clase:

```python
elif path == '/api/usb/list':
    dir_path = query.get('path', [''])[0]
    if not dir_path or not os.path.isdir(dir_path):
        # Simular un pendrive de demostración
        self.send_json([
            {"name": "Fotos",         "isDir": True,  "ext": ""},
            {"name": "musica.mp3",    "isDir": False, "ext": ".mp3"},
            {"name": "documento.txt", "isDir": False, "ext": ".txt"},
        ])
        return
    entries = []
    for name in os.listdir(dir_path):
        full = os.path.join(dir_path, name)
        entries.append({
            "name": name,
            "isDir": os.path.isdir(full),
            "fullPath": full,
            "ext": os.path.splitext(name)[1].lower()
        })
    self.send_json(entries)
```

---

## Advertencias importantes para la presentación

### Electron nativo es obligatorio para detección real

El módulo `usb-detection` es un addon nativo compilado para Node.js — no funciona en modo navegador puro. Para la demo en clase, si no tienen Electron instalado en el equipo de presentación, preparen el fallback con datos simulados en `server.py` que imiten un pendrive con 4-5 archivos.

### Retraso de montaje en Windows

En Windows puede haber un retraso de hasta 2-3 segundos entre que el sistema operativo detecta el USB y que termina de montarlo como unidad de disco. Si la función `getWindowsDriveLetter` regresa `null`, mostrar en la UI un botón de "Recargar" para reintentar manualmente.

### Permisos en Linux

En distribuciones Linux, acceder a dispositivos USB directamente puede requerir que el usuario esté en el grupo `plugdev`. Documentar esto en el README si el profesor usa Linux:

```bash
sudo usermod -aG plugdev $USER
# Requiere cerrar sesión y volver a entrar para que surta efecto
```

### Seguridad — validación de rutas

Nunca exponer `shell.openPath(filePath)` sin validar que `filePath` empieza por el `mountPath` conocido. Esto previene que un path malicioso acceda a `C:\Windows\System32` desde la UI:

```javascript
// Validación de seguridad antes de cualquier lectura de archivo
function isPathSafe(filePath, mountRoot) {
  const normalized = path.resolve(filePath);
  return normalized.startsWith(path.resolve(mountRoot));
}

// Usar en todos los handlers IPC:
ipcMain.handle('usb:readTextFile', async (event, filePath) => {
  if (!isPathSafe(filePath, /* mountRoot del dispositivo activo */)) return null;
  // ... resto de la lógica
});
```

### Tipos de archivo soportados para preview

| Categoría | Extensiones | Método |
|-----------|-------------|--------|
| Imagen | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.bmp` | `readUsbImageFile` → base64 → `<img>` |
| Texto / código | `.txt` `.md` `.js` `.html` `.css` `.json` `.py` `.log` `.csv` | `readUsbTextFile` → `<pre>` |
| Audio | `.mp3` `.wav` `.ogg` `.flac` `.aac` | `file://` URL → `<audio controls>` |
| Video | `.mp4` `.webm` `.mov` | `file://` URL → `<video controls>` |
| Sin soporte | Cualquier otro | Mensaje "Sin vista previa" |

---

*Plan de implementación generado para el proyecto educativo Ace-a-DesktopOS — Asignatura de Sistemas Operativos.*