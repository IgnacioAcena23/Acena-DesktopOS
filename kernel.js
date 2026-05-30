/**
 * Ace-a-DesktopOS - Motor de Simulación del Kernel
 * Contiene PCB, Planificador Round Robin, Heap Virtual y VFS.
 */

// --- SISTEMA DE ARCHIVOS VIRTUAL (VFS) ---
class VFSNode {
    constructor(name, type, content = "") {
        this.name = name;
        this.type = type; // "dir" o "file"
        this.content = content;
        this.children = {}; // Para directorios
        this.updatedAt = new Date().toLocaleString();
    }
}

class VirtualFileSystem {
    constructor() {
        this.root = new VFSNode("/", "dir");
        this.currentPath = []; // Array de nombres de directorios desde el root
        this.loadFromStorage();
        this.initDefaultFiles();
    }

    getCurrentNode() {
        let node = this.root;
        for (let dirName of this.currentPath) {
            if (node.children[dirName]) {
                node = node.children[dirName];
            } else {
                // Si la ruta está rota por alguna razón, resetear a root
                this.currentPath = [];
                return this.root;
            }
        }
        return node;
    }

    resolvePath(pathStr) {
        if (!pathStr) return { node: this.getCurrentNode(), path: [...this.currentPath] };
        
        let parts = pathStr.split('/').filter(p => p !== "");
        let tempPath = pathStr.startsWith('/') ? [] : [...this.currentPath];
        let node = pathStr.startsWith('/') ? this.root : this.getCurrentNode();

        for (let part of parts) {
            if (part === ".") {
                continue;
            } else if (part === "..") {
                if (tempPath.length > 0) {
                    tempPath.pop();
                    // Resolver el nodo nuevamente desde root para estar seguros
                    node = this.root;
                    for (let p of tempPath) {
                        node = node.children[p];
                    }
                }
            } else {
                if (node.type === "dir" && node.children[part]) {
                    node = node.children[part];
                    tempPath.push(part);
                } else {
                    return null; // Ruta no válida
                }
            }
        }
        return { node, path: tempPath };
    }

    mkdir(name) {
        let current = this.getCurrentNode();
        if (current.type !== 'dir') return false;
        if (current.children[name]) return false;
        current.children[name] = new VFSNode(name, 'dir');
        this.saveToStorage();
        return true;
    }

    createFile(name, content = "") {
        let current = this.getCurrentNode();
        if (current.type !== 'dir') return false;
        if (current.children[name]) return false;
        current.children[name] = new VFSNode(name, 'file', content);
        this.saveToStorage();
        return true;
    }

    deleteNode(name) {
        let current = this.getCurrentNode();
        if (current.children[name]) {
            delete current.children[name];
            this.saveToStorage();
            return true;
        }
        return false;
    }

    saveToStorage() {
        try {
            const serialize = (node) => {
                let serialized = {
                    name: node.name,
                    type: node.type,
                    content: node.content,
                    updatedAt: node.updatedAt,
                    children: {}
                };
                for (let key in node.children) {
                    serialized.children[key] = serialize(node.children[key]);
                }
                return serialized;
            };
            localStorage.setItem('ace_vfs', JSON.stringify(serialize(this.root)));
        } catch (e) {
            console.error("Error guardando VFS en localStorage:", e);
        }
    }

    loadFromStorage() {
        try {
            const dataStr = localStorage.getItem('ace_vfs');
            if (dataStr) {
                const data = JSON.parse(dataStr);
                const deserialize = (serializedNode) => {
                    let node = new VFSNode(serializedNode.name, serializedNode.type, serializedNode.content);
                    node.updatedAt = serializedNode.updatedAt;
                    if (serializedNode.children) {
                        for (let key in serializedNode.children) {
                            node.children[key] = deserialize(serializedNode.children[key]);
                        }
                    }
                    return node;
                };
                this.root = deserialize(data);
            }
        } catch (e) {
            console.error("Error cargando VFS:", e);
        }
    }

    initDefaultFiles() {
        // Asegurarse de que existan archivos básicos
        let rootChildren = this.root.children;
        if (!rootChildren["home"]) this.mkdir("home");
        
        // Entrar a home para crear archivos iniciales si está vacío
        let home = rootChildren["home"];
        if (home && Object.keys(home.children).length === 0) {
            home.children["bienvenida.txt"] = new VFSNode("bienvenida.txt", "file", 
                "¡Bienvenido a Ace-a-DesktopOS!\n\nEste es un sistema operativo simulado.\nPuedes explorar los archivos, correr procesos en el simulador, abrir la terminal y gestionar recursos en tiempo real.\n\nPrueba a escribir comandos en la terminal.");
            home.children["leeme.txt"] = new VFSNode("leeme.txt", "file", 
                "Manual Rápido:\n- Abre el 'Simulador de Kernel' para ver la planificación Round Robin.\n- Abre la terminal y escribe 'help' para comandos disponibles.\n- Abre el 'Monitor de Sistema' para monitorear tu máquina real.\n- Navega en el Web Browser y ten cuidado con el malware virtual.");
        }

        if (!rootChildren["sys"]) this.mkdir("sys");
        let sys = rootChildren["sys"];
        if (sys && !sys.children["log.txt"]) {
            sys.children["log.txt"] = new VFSNode("log.txt", "file", "--- LOG DE EVENTOS DEL SISTEMA ---\n");
        }
    }

    appendLog(text) {
        try {
            let sys = this.root.children["sys"];
            if (sys && sys.children["log.txt"]) {
                let logNode = sys.children["log.txt"];
                let timestamp = new Date().toLocaleTimeString();
                logNode.content += `[${timestamp}] ${text}\n`;
                // Limitar tamaño de log en memoria
                let lines = logNode.content.split('\n');
                if (lines.length > 500) {
                    logNode.content = "--- LOG DE EVENTOS (TRUNCADO) ---\n" + lines.slice(-200).join('\n');
                }
                this.saveToStorage();
            }
        } catch (e) {
            console.error(e);
        }
    }
}


// --- GESTIÓN DE MEMORIA (HEAP VIRTUAL) ---
class VirtualHeap {
    constructor(size = 256) {
        this.size = size;
        this.memory = new Array(size).fill(0); // 0 significa libre, cualquier otro número es el PID del proceso propietario
        this.allocations = []; // Array de { address, size, pid, name }
    }

    // Algoritmo First-Fit
    alloc(size, pid, name = "Process") {
        if (size <= 0) return -1;
        let consecutiveFree = 0;
        let startAddress = -1;

        for (let i = 0; i < this.size; i++) {
            if (this.memory[i] === 0) {
                if (consecutiveFree === 0) {
                    startAddress = i;
                }
                consecutiveFree++;
                if (consecutiveFree === size) {
                    // Bloque encontrado
                    for (let j = startAddress; j < startAddress + size; j++) {
                        this.memory[j] = pid;
                    }
                    let allocation = { address: startAddress, size: size, pid: pid, name: name };
                    this.allocations.push(allocation);
                    return startAddress;
                }
            } else {
                consecutiveFree = 0;
                startAddress = -1;
            }
        }
        return -1; // No hay espacio contiguo suficiente
    }

    free(address) {
        let index = this.allocations.findIndex(alloc => alloc.address === address);
        if (index === -1) return false;

        let alloc = this.allocations[index];
        for (let i = alloc.address; i < alloc.address + alloc.size; i++) {
            this.memory[i] = 0;
        }
        this.allocations.splice(index, 1);
        return true;
    }

    freeAllByPid(pid) {
        let freedAny = false;
        // Filtrar y liberar del array de memoria
        for (let i = 0; i < this.size; i++) {
            if (this.memory[i] === pid) {
                this.memory[i] = 0;
                freedAny = true;
            }
        }
        this.allocations = this.allocations.filter(alloc => alloc.pid !== pid);
        return freedAny;
    }

    getStats() {
        let used = this.memory.filter(x => x !== 0).length;
        let free = this.size - used;
        let percent = ((used / this.size) * 100).toFixed(1);
        return { total: this.size, used, free, percent };
    }
}


// --- PCB (PROCESS CONTROL BLOCK) ---
class PCB {
    constructor(pid, name, cpuBurst, priority, memSize, memAddress) {
        this.pid = pid;
        this.name = name;
        this.status = "NEW"; // NEW, READY, RUNNING, WAITING, TERMINATED
        this.priority = priority; // 1 (alta) a 5 (baja)
        this.cpuBurst = cpuBurst; // Ciclos totales requeridos
        this.cpuTime = 0; // Ciclos de CPU ejecutados
        this.memAddress = memAddress; // Dirección en Heap Virtual
        this.memSize = memSize; // Tamaño en bytes asignados
        this.waitingTime = 0;
        this.ioProgress = 0; // Para simular operaciones de E/S
    }
}


// --- PLANIFICADOR DE PROCESOS (ROUND ROBIN SCHEDULER) ---
class RoundRobinScheduler {
    constructor(heapManager, vfsManager) {
        this.heap = heapManager;
        this.vfs = vfsManager;
        this.processes = []; // Tabla de Procesos (todos los PCBs activos)
        this.readyQueue = []; // Cola de Procesos listos (PIDs)
        this.runningPid = null;
        this.quantum = 3; // Límite de ticks por ráfaga
        this.quantumUsed = 0; // Ticks consumidos por el proceso actual
        this.nextPid = 100; // Contador de PIDs
        this.systemTicks = 0;
        this.running = false;
        this.logs = []; // Historial reciente
    }

    addProcess(name, cpuBurst, priority, memSize) {
        // 1. Asignar memoria virtual
        let addr = this.heap.alloc(memSize, this.nextPid, name);
        if (addr === -1) {
            let errorMsg = `ERROR: No hay suficiente memoria virtual contigua para crear el proceso '${name}' (${memSize} bytes)`;
            this.vfs.appendLog(errorMsg);
            this.logEvent(errorMsg);
            return null;
        }

        // 2. Crear PCB
        let pcb = new PCB(this.nextPid, name, cpuBurst, priority, memSize, addr);
        pcb.status = "READY";
        this.processes.push(pcb);
        this.readyQueue.push(pcb.pid);
        
        let msg = `Proceso creado: '${name}' (PID: ${pcb.pid}) - Ráfaga: ${cpuBurst} ticks, Memoria: ${memSize}B en dir ${addr}, Prioridad: ${priority}`;
        this.vfs.appendLog(msg);
        this.logEvent(msg);

        this.nextPid++;
        return pcb;
    }

    killProcess(pid) {
        let pcb = this.processes.find(p => p.pid === pid);
        if (!pcb) return false;

        // Liberar memoria
        this.heap.freeAllByPid(pid);

        // Cambiar estado
        pcb.status = "TERMINATED";
        
        // Quitar de cola de listos
        this.readyQueue = this.readyQueue.filter(pId => pId !== pid);

        // Si estaba en ejecución
        if (this.runningPid === pid) {
            this.runningPid = null;
            this.quantumUsed = 0;
        }

        // Quitar de la lista de procesos activos
        this.processes = this.processes.filter(p => p.pid !== pid);

        let msg = `Proceso abortado: '${pcb.name}' (PID: ${pid}) - Memoria liberada`;
        this.vfs.appendLog(msg);
        this.logEvent(msg);
        return true;
    }

    tick() {
        this.systemTicks++;
        
        // 1. Gestionar procesos en espera (E/S simulada)
        this.processes.forEach(pcb => {
            if (pcb.status === "WAITING") {
                pcb.ioProgress--;
                pcb.waitingTime++;
                if (pcb.ioProgress <= 0) {
                    pcb.status = "READY";
                    this.readyQueue.push(pcb.pid);
                    let msg = `Proceso '${pcb.name}' (PID: ${pcb.pid}) completó E/S y volvió a READY`;
                    this.vfs.appendLog(msg);
                    this.logEvent(msg);
                }
            } else if (pcb.status === "READY") {
                pcb.waitingTime++;
            }
        });

        // 2. Si no hay proceso en ejecución, elegir el siguiente
        if (!this.runningPid) {
            this.scheduleNext();
        } else {
            let runningPcb = this.processes.find(p => p.pid === this.runningPid);
            
            if (runningPcb) {
                // Ejecutar instrucción
                runningPcb.cpuTime++;
                this.quantumUsed++;

                // Simular E/S aleatoria (5% de probabilidad si le queda bastante ráfaga)
                if (runningPcb.cpuTime < runningPcb.cpuBurst - 1 && Math.random() < 0.08 && this.quantumUsed > 1) {
                    runningPcb.status = "WAITING";
                    runningPcb.ioProgress = Math.floor(Math.random() * 4) + 2; // Espera de 2 a 5 ticks
                    
                    let msg = `Proceso '${runningPcb.name}' (PID: ${this.runningPid}) bloqueado por E/S (esperando ${runningPcb.ioProgress} ticks)`;
                    this.vfs.appendLog(msg);
                    this.logEvent(msg);

                    this.runningPid = null;
                    this.quantumUsed = 0;
                    this.scheduleNext();
                    return;
                }

                // Verificar si terminó
                if (runningPcb.cpuTime >= runningPcb.cpuBurst) {
                    runningPcb.status = "TERMINATED";
                    this.heap.freeAllByPid(runningPcb.pid);
                    
                    let msg = `Proceso terminado: '${runningPcb.name}' (PID: ${runningPcb.pid}) - Duración: ${runningPcb.cpuTime} ticks. Memoria liberada`;
                    this.vfs.appendLog(msg);
                    this.logEvent(msg);

                    this.processes = this.processes.filter(p => p.pid !== runningPcb.pid);
                    this.runningPid = null;
                    this.quantumUsed = 0;
                    
                    this.scheduleNext();
                } 
                // Verificar si se agotó el Quantum (Round Robin)
                else if (this.quantumUsed >= this.quantum) {
                    runningPcb.status = "READY";
                    this.readyQueue.push(runningPcb.pid);
                    
                    let msg = `FIN DE QUANTUM: Proceso '${runningPcb.name}' (PID: ${runningPcb.pid}) reencolado a READY`;
                    this.vfs.appendLog(msg);
                    this.logEvent(msg);

                    this.runningPid = null;
                    this.quantumUsed = 0;
                    
                    this.scheduleNext();
                }
            } else {
                // Caso raro: el proceso corriendo desapareció
                this.runningPid = null;
                this.quantumUsed = 0;
                this.scheduleNext();
            }
        }
    }

    scheduleNext() {
        if (this.readyQueue.length > 0) {
            this.runningPid = this.readyQueue.shift();
            let nextPcb = this.processes.find(p => p.pid === this.runningPid);
            if (nextPcb) {
                nextPcb.status = "RUNNING";
                this.quantumUsed = 0;
                
                let msg = `CONTEXT SWITCH: CPU asignada a '${nextPcb.name}' (PID: ${nextPcb.pid})`;
                this.vfs.appendLog(msg);
                this.logEvent(msg);
            } else {
                // El PID de la cola ya no existe en la tabla (fue matado)
                this.runningPid = null;
                this.scheduleNext();
            }
        } else {
            this.runningPid = null;
        }
    }

    logEvent(text) {
        this.logs.unshift({ time: new Date().toLocaleTimeString(), text });
        if (this.logs.length > 30) this.logs.pop();
    }
}

// Inicializar Kernel en el scope global
window.vfs = new VirtualFileSystem();
window.heap = new VirtualHeap(256);
window.scheduler = new RoundRobinScheduler(window.heap, window.vfs);
console.log("Kernel simulado inicializado correctamente en el frontend.");
