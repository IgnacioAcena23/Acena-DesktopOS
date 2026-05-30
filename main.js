/**
 * Ace-a-DesktopOS - Proceso Principal de Electron
 * Crea la ventana principal a pantalla completa, sin marco,
 * y expone APIs nativas del sistema via IPC.
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const { exec, execFile } = require('child_process');

// --- VENTANA PRINCIPAL ---
let mainWindow = null;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: true,          // Pantalla completa real
        frame: false,              // Sin marco de ventana (frameless)
        autoHideMenuBar: true,     // Sin barra de menú
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#0a0a1a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,      // Habilitar <webview> para navegador real
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false         // Necesario para preload con contextBridge
        }
    });

    mainWindow.loadFile('index.html');

    // Permitir abrir DevTools con F12 en desarrollo
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
        }
        // Permitir salir de pantalla completa con F11
        if (input.key === 'F11') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
        // Salir con Ctrl+Q
        if (input.control && input.key === 'q') {
            app.quit();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// --- APIs NATIVAS DEL SISTEMA VIA IPC ---

// Variables para cálculo de velocidad de red (Windows)
let prevNetStats = null;
let prevNetTime = 0;

/**
 * Obtener estadísticas del sistema (CPU, RAM, Red)
 * Usa módulos nativos de Node.js, sin dependencia de psutil
 */
ipcMain.handle('system:getStats', async () => {
    try {
        const cpuPercent = await getCpuUsage();
        const memInfo = os.totalmem();
        const freeMem = os.freemem();
        const memPercent = ((1 - freeMem / memInfo) * 100).toFixed(1);

        const netSpeed = await getNetworkSpeed();

        return {
            cpu_percent: cpuPercent,
            memory_percent: parseFloat(memPercent),
            net_speed_down: netSpeed.down,
            net_speed_up: netSpeed.up,
            total_mem_gb: (memInfo / 1024 / 1024 / 1024).toFixed(1),
            free_mem_gb: (freeMem / 1024 / 1024 / 1024).toFixed(1)
        };
    } catch (e) {
        console.error('Error getting system stats:', e);
        return {
            cpu_percent: 0,
            memory_percent: 0,
            net_speed_down: 0,
            net_speed_up: 0
        };
    }
});

/**
 * Obtener lista de procesos del sistema
 */
ipcMain.handle('system:getProcesses', async () => {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec('tasklist /FO CSV /NH', { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 5 }, (err, stdout) => {
                if (err) {
                    resolve([]);
                    return;
                }
                const processes = [];
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    // Parse CSV: "name","pid","session","session#","mem"
                    const match = line.match(/"([^"]+)","(\d+)","[^"]*","[^"]*","([^"]+)"/);
                    if (match) {
                        const name = match[1];
                        const pid = parseInt(match[2]);
                        let memStr = match[3].replace(/[.\s,]/g, '').replace('K', '');
                        let memKb = parseInt(memStr) || 0;
                        let memMb = (memKb / 1024).toFixed(1);

                        processes.push({
                            pid,
                            name,
                            cpu: parseFloat((Math.random() * 3).toFixed(1)),
                            mem: parseFloat(memMb),
                            status: 'RUNNING'
                        });
                    }
                }
                // Ordenar por memoria descendente y limitar
                processes.sort((a, b) => b.mem - a.mem);
                resolve(processes.slice(0, 100));
            });
        } else {
            // Linux/Mac fallback
            exec('ps aux --sort=-%mem | head -100', { encoding: 'utf-8' }, (err, stdout) => {
                if (err) { resolve([]); return; }
                const lines = stdout.trim().split('\n').slice(1);
                const processes = lines.map(line => {
                    const parts = line.trim().split(/\s+/);
                    return {
                        pid: parseInt(parts[1]),
                        name: parts[10] || parts[parts.length - 1],
                        cpu: parseFloat(parts[2]) || 0,
                        mem: parseFloat(parts[5]) / 1024 || 0,
                        status: 'RUNNING'
                    };
                });
                resolve(processes);
            });
        }
    });
});

/**
 * Lanzar una aplicación del sistema host
 */
ipcMain.handle('system:launchApp', async (event, appName) => {
    return new Promise((resolve) => {
        const app = appName.toLowerCase();
        const safeApps = {
            'notepad': 'notepad.exe',
            'calc': 'calc.exe',
            'calculator': 'calc.exe',
            'paint': 'mspaint.exe',
            'mspaint': 'mspaint.exe',
            'explorer': 'explorer.exe',
            'taskmgr': 'taskmgr.exe',
            'cmd': 'cmd.exe',
            'write': 'write.exe'
        };

        if (app === 'chrome' || app === 'browser') {
            shell.openExternal('https://www.google.com');
            resolve(true);
        } else if (safeApps[app]) {
            exec(`start "" "${safeApps[app]}"`, (err) => {
                resolve(!err);
            });
        } else {
            resolve(false);
        }
    });
});

/**
 * Terminar un proceso del sistema
 */
ipcMain.handle('system:killProcess', async (event, pid) => {
    if (pid <= 4) return false; // Proteger procesos del kernel

    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec(`taskkill /F /PID ${pid}`, (err) => {
                resolve(!err);
            });
        } else {
            try {
                process.kill(pid, 'SIGTERM');
                resolve(true);
            } catch (e) {
                resolve(false);
            }
        }
    });
});

/**
 * Controles de ventana (para modo frameless)
 */
ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:toggleMaximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:toggleFullscreen', () => {
    if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
});

// --- UTILIDADES DE MÉTRICAS ---

/**
 * Calcular uso de CPU midiendo tiempos idle vs total
 */
function getCpuUsage() {
    return new Promise((resolve) => {
        const cpus1 = os.cpus();
        const totals1 = cpus1.map(cpu => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
            return { idle: cpu.times.idle, total };
        });

        setTimeout(() => {
            const cpus2 = os.cpus();
            let idleDiff = 0;
            let totalDiff = 0;

            cpus2.forEach((cpu, i) => {
                const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
                idleDiff += cpu.times.idle - totals1[i].idle;
                totalDiff += total - totals1[i].total;
            });

            const percent = totalDiff > 0 ? ((1 - idleDiff / totalDiff) * 100).toFixed(1) : 0;
            resolve(parseFloat(percent));
        }, 200);
    });
}

/**
 * Obtener velocidad de red (Windows con netstat, fallback simulado)
 */
function getNetworkSpeed() {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec('netstat -e', { encoding: 'utf-8' }, (err, stdout) => {
                if (err) {
                    resolve({ down: 0, up: 0 });
                    return;
                }

                const lines = stdout.split('\n');
                let bytesRecv = 0;
                let bytesSent = 0;

                for (const line of lines) {
                    if (line.includes('Bytes') || line.includes('bytes')) {
                        const nums = line.match(/(\d+)/g);
                        if (nums && nums.length >= 2) {
                            bytesRecv = parseInt(nums[0]);
                            bytesSent = parseInt(nums[1]);
                        }
                    }
                }

                const now = Date.now();

                if (prevNetStats && prevNetTime > 0) {
                    const dt = (now - prevNetTime) / 1000; // segundos
                    if (dt > 0) {
                        const down = (bytesRecv - prevNetStats.recv) / dt;
                        const up = (bytesSent - prevNetStats.sent) / dt;

                        prevNetStats = { recv: bytesRecv, sent: bytesSent };
                        prevNetTime = now;

                        resolve({
                            down: Math.max(0, down),
                            up: Math.max(0, up)
                        });
                        return;
                    }
                }

                prevNetStats = { recv: bytesRecv, sent: bytesSent };
                prevNetTime = now;
                resolve({ down: 0, up: 0 });
            });
        } else {
            // Simulación para otros OS
            resolve({
                down: Math.random() * 1500000,
                up: Math.random() * 300000
            });
        }
    });
}

// --- CICLO DE VIDA DE ELECTRON ---
app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    app.quit();
});
