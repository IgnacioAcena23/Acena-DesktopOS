#!/usr/bin/env python3
"""
Ace-a-DesktopOS - Servidor Backend de Integración
Sirve la interfaz web y expone APIs para monitorear el sistema host real.
"""

import os
import sys
import json
import time
import csv
import io
import subprocess
import webbrowser
import urllib.parse
from http.server import SimpleHTTPRequestHandler, HTTPServer
import socketserver

# Intentar importar psutil para estadísticas en tiempo real premium
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

# Variables de estado de red
prev_bytes_recv = 0
prev_bytes_sent = 0
prev_time = 0

def get_network_speed():
    global prev_bytes_recv, prev_bytes_sent, prev_time
    if not HAS_PSUTIL:
        # Generar pequeña fluctuación si no está psutil instalado
        import random
        return random.randint(100000, 1500000), random.randint(10000, 300000)
        
    try:
        io_counters = psutil.net_io_counters()
        curr_recv = io_counters.bytes_recv
        curr_sent = io_counters.bytes_sent
        curr_time = time.time()
        
        if prev_time == 0:
            prev_bytes_recv = curr_recv
            prev_bytes_sent = curr_sent
            prev_time = curr_time
            return 0.0, 0.0
            
        dt = curr_time - prev_time
        if dt <= 0:
            return 0.0, 0.0
            
        speed_down = (curr_recv - prev_bytes_recv) / dt
        speed_up = (curr_sent - prev_bytes_sent) / dt
        
        prev_bytes_recv = curr_recv
        prev_bytes_sent = curr_sent
        prev_time = curr_time
        
        return speed_down, speed_up
    except Exception:
        return 0.0, 0.0

def get_system_stats():
    cpu_percent = 0.0
    memory_percent = 0.0
    disk_percent = 0.0
    
    if HAS_PSUTIL:
        try:
            cpu_percent = psutil.cpu_percent(interval=None)
            memory_percent = psutil.virtual_memory().percent
            disk_percent = psutil.disk_usage('/').percent
        except Exception as e:
            print("Error leyendo psutil:", e)
    else:
        # Fallback a herramientas nativas de Windows
        if sys.platform == 'win32':
            try:
                # CPU
                cpu_out = subprocess.check_output("wmic cpu get loadpercentage /VALUE", shell=True).decode('utf-8', errors='ignore')
                for line in cpu_out.split('\n'):
                    if 'LoadPercentage=' in line:
                        cpu_percent = float(line.split('=')[1].strip())
                        break
                # Memoria (en KB)
                mem_out = subprocess.check_output("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /VALUE", shell=True).decode('utf-8', errors='ignore')
                free_mem = 0
                total_mem = 0
                for line in mem_out.split('\n'):
                    if 'FreePhysicalMemory=' in line:
                        free_mem = int(line.split('=')[1].strip())
                    elif 'TotalVisibleMemorySize=' in line:
                        total_mem = int(line.split('=')[1].strip())
                if total_mem > 0:
                    memory_percent = round(((total_mem - free_mem) / total_mem) * 100, 1)
            except Exception as e:
                # Simular valores razonables si falla wmic
                import random
                cpu_percent = round(random.uniform(5.0, 15.0), 1)
                memory_percent = 45.2
        else:
            # Otros Sistemas Operativos
            import random
            cpu_percent = round(random.uniform(5.0, 15.0), 1)
            memory_percent = 40.0
            
    net_down, net_up = get_network_speed()
    
    return {
        "cpu_percent": cpu_percent,
        "memory_percent": memory_percent,
        "disk_percent": disk_percent,
        "net_speed_down": net_down,
        "net_speed_up": net_up,
        "has_psutil": HAS_PSUTIL
    }

def get_running_processes():
    processes = []
    
    if HAS_PSUTIL:
        try:
            for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
                try:
                    info = proc.info
                    processes.append({
                        "pid": info['pid'],
                        "name": info['name'],
                        "cpu": info['cpu_percent'] or 0.0,
                        "mem": (info['memory_percent'] or 0.0) * 160,  # Estimación en MB basada en RAM genérica
                        "status": "RUNNING"
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        except Exception as e:
            print("Error listando procesos con psutil:", e)
            
    # Fallback Windows: Parsear tasklist.exe
    if not processes and sys.platform == 'win32':
        try:
            # tasklist formato CSV sin cabeceras
            output = subprocess.check_output("tasklist /FO CSV /NH", shell=True).decode('utf-8', errors='ignore')
            lines = output.strip().split('\n')
            
            # Cargar como CSV en memoria para evitar errores de comillas
            reader = csv.reader(io.StringIO('\n'.join(lines)))
            for row in reader:
                if len(row) >= 5:
                    name = row[0]
                    try:
                        pid = int(row[1])
                    except ValueError:
                        continue
                    # Limpiar cadena de memoria
                    mem_str = row[4].replace('.', '').replace(',', '').replace(' K', '').replace(' ', '')
                    try:
                        mem_kb = int(mem_str)
                        mem_mb = mem_kb / 1024.0
                    except ValueError:
                        mem_mb = 15.0
                        
                    # Simular consumo pequeño de CPU
                    import random
                    cpu_percent = round(random.uniform(0.1, 3.5), 1) if name.lower() in ['chrome.exe', 'explorer.exe', 'python.exe', 'code.exe'] else 0.0
                    
                    processes.append({
                        "pid": pid,
                        "name": name,
                        "cpu": cpu_percent,
                        "mem": mem_mb,
                        "status": "RUNNING"
                    })
        except Exception as e:
            print("Error ejecutando fallback tasklist:", e)
            
    # Si todo falla, devolver lista simulada
    if not processes:
        processes = [
            {"pid": 0, "name": "Idle", "cpu": 95.0, "mem": 4.0, "status": "RUNNING"},
            {"pid": 4, "name": "System", "cpu": 1.5, "mem": 16.0, "status": "RUNNING"},
            {"pid": 150, "name": "explorer.exe", "cpu": 0.8, "mem": 48.0, "status": "RUNNING"}
        ]
        
    return processes[:120]  # Limitar para rendimiento de red

def launch_app(app, url=""):
    try:
        app = app.lower()
        if app == 'notepad':
            subprocess.Popen("notepad.exe")
            return True
        elif app == 'calc':
            subprocess.Popen("calc.exe")
            return True
        elif app == 'paint' or app == 'mspaint':
            subprocess.Popen("mspaint.exe")
            return True
        elif app == 'chrome' or app == 'browser':
            if url:
                webbrowser.open(url)
            else:
                webbrowser.open("https://www.google.com")
            return True
        elif app == 'explorer':
            subprocess.Popen("explorer.exe")
            return True
        else:
            # Lista blanca de utilidades seguras del sistema
            safe_apps = ['taskmgr', 'write', 'cmd']
            if app in safe_apps:
                subprocess.Popen(f"{app}.exe")
                return True
            return False
    except Exception as e:
        print(f"Error lanzando aplicación '{app}':", e)
        return False

def kill_process(pid):
    if pid <= 4:
        return False  # Proteger procesos clave del kernel de Windows
        
    try:
        if HAS_PSUTIL:
            p = psutil.Process(pid)
            p.terminate()
            return True
        else:
            if sys.platform == 'win32':
                subprocess.run(f"taskkill /F /PID {pid}", shell=True)
                return True
            else:
                import signal
                os.kill(pid, signal.SIGTERM)
                return True
    except Exception as e:
        print(f"Error matando proceso {pid}:", e)
        return False


class OSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Permitir CORS por si se usa servidor de desarrollo externo
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "OK")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        
        # --- ENRUTADO DE APIs ---
        if path == '/api/stats':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            stats = get_system_stats()
            self.wfile.write(json.dumps(stats).encode('utf-8'))
            
        elif path == '/api/processes':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            procs = get_running_processes()
            self.wfile.write(json.dumps(procs).encode('utf-8'))
            
        elif path == '/api/launch':
            app = query.get('app', [''])[0]
            url = query.get('url', [''])[0]
            success = launch_app(app, url)
            self.send_response(200 if success else 400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": success}).encode('utf-8'))
            
        elif path == '/api/kill':
            try:
                pid = int(query.get('pid', ['0'])[0])
                success = kill_process(pid)
            except ValueError:
                success = False
            self.send_response(200 if success else 400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": success}).encode('utf-8'))
            
        else:
            # Servir archivo estático (index.html, style.css, app.js, kernel.js)
            super().do_GET()


def main():
    PORT = 8000
    
    # Cambiar al directorio del script para servir los archivos locales correctamente
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Intentar correr en el puerto 8000, si está ocupado buscar el siguiente libre
    server = None
    for port in range(PORT, PORT + 10):
        try:
            server = HTTPServer(('0.0.0.0', port), OSRequestHandler)
            PORT = port
            break
        except OSError:
            print(f"Puerto {port} ocupado, probando con el siguiente...")
            
    if not server:
        print("ERROR: No se pudo enlazar a ningún puerto.")
        sys.exit(1)
        
    print("=" * 60)
    print(f" Servidor Ace-a-DesktopOS iniciado con éxito.")
    print(f"   Dirección local: http://localhost:{PORT}")
    print("-" * 60)
    if HAS_PSUTIL:
        print(" [+] psutil detectado: Monitoreo real y velocidad de red activos.")
    else:
        print(" [!] psutil NO detectado: Usando lecturas del sistema nativas de Windows.")
        print("     Tip: Ejecuta 'pip install psutil' para soporte de red y métricas fluidas.")
    print("=" * 60)
    
    # Abrir navegador automáticamente
    try:
        webbrowser.open(f"http://localhost:{PORT}")
    except Exception:
        pass
        
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor...")
        server.server_close()
        sys.exit(0)

if __name__ == '__main__':
    main()
