# Ace-a-DesktopOS 🚀

Un simulador interactivo de sistema operativo de escritorio desarrollado en **HTML5, CSS3, JavaScript** y **Python**. El simulador modela un entorno de escritorio completo (con gestor de ventanas, VFS, terminal e integraciones de seguridad) combinando una simulación del Kernel en el cliente y un servidor de telemetría real en el host.

---

## 🎨 Características Clave

1. **Entorno Gráfico Premium**: Diseño basado en Glassmorphism (efecto cristal templado), bordes suaves, sombras y degradados modernos con tema oscuro integrado.
2. **Gestión de Ventanas Completa**: Soporte para arrastrar, redimensionar, minimizar, maximizar y cerrar ventanas interactivamente con apilamiento dinámico de foco (z-index).
3. **Kernel Virtual y Planificación**:
   - **Planificador CPU**: Simulación en tiempo real de planificación Round Robin mediante ticks de reloj regulables.
   - **Memoria Virtual**: Gestión de un Heap de 256 bytes mediante algoritmo de búsqueda First-Fit con visualización gráfica interactiva (mapa de celdas de memoria).
   - **VFS (Virtual File System)**: Directorios virtuales y archivos persistentes en `localStorage` con editor de texto (Notepad) integrado.
4. **Telemetría en Tiempo Real**:
   - Lectura real de consumo de CPU, RAM y velocidad de subida/bajada de red del sistema host.
   - Gráficos continuos renderizados en canvas de alto rendimiento.
   - Listado e interrupción de procesos reales activos en el sistema anfitrión.
5. **Ejecución de Aplicaciones Reales**: Capacidad para abrir Notepad, Calculadora, Paint o el navegador real del host desde la interfaz simulada.
6. **Seguridad AceDefender**: Simulación de descargas web con detección y bloqueo en tiempo real de archivos maliciosos (firma de prueba EICAR) y panel de registro de auditorías.
7. **Terminal AceTerminal**: Consola interactiva para administrar comandos tanto locales como virtuales.

---

## 📂 Archivos del Proyecto

- `index.html`: Estructura y maquetación de la interfaz de escritorio.
- `style.css`: Estilos visuales, animaciones de ventanas y la rejilla de memoria virtual.
- `kernel.js`: Lógica del planificador Round Robin, el gestor del Heap y el VFS.
- `app.js`: Lógica de ventanas, gráficos Canvas, consola de comandos y comunicación API.
- `server.py`: Servidor HTTP/API en Python para la integración real en el host.

---

## 🚀 Cómo Ejecutar

### Modo Aplicación Nativa (Electron) - RECOMENDADO
El proyecto ha sido actualizado para funcionar como una aplicación de escritorio real a pantalla completa, con un navegador web verdadero integrado.
1. Abre una consola en el directorio del proyecto.
2. Instala las dependencias:
   ```bash
   pnpm install
   ```
3. Ejecuta la aplicación:
   ```bash
   pnpm start
   ```

### Modo Simulado (Directo en Navegador)
Haz doble clic en `index.html` para abrirlo en cualquier navegador web. Funcionará con datos simulados si el servidor de Python no está activo. (Nota: El "Navegador Real" no estará disponible en este modo).

### Modo Real (Conexión al Host vía Python)
Para habilitar lecturas reales desde un navegador web tradicional:
1. Abre una consola en el directorio del proyecto.
2. (Recomendado) Instala `psutil` para estadísticas de red exactas:
   ```bash
   pip install psutil
   ```
3. Ejecuta el servidor Python:
   ```bash
   python server.py
   ```
4. El script abrirá automáticamente tu navegador en `http://localhost:8000`.

---

*Desarrollado como proyecto educativo para la asignatura de Sistemas Operativos.*