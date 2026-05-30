// game.js - Juego Snake para Ace-a-DesktopOS

class SnakeGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Dimensiones del juego (grid de 20x20, cada celda 20px)
        this.gridSize = 20;
        this.cellSize = 20;
        this.rows = 20;
        this.cols = 20;
        
        // Estado del juego
        this.snake = [
            {x: 10, y: 10},
            {x: 9, y: 10},
            {x: 8, y: 10},
            {x: 7, y: 10}
        ];
        this.direction = 'RIGHT';
        this.nextDirection = 'RIGHT';
        this.food = {x: 15, y: 10};
        this.score = 0;
        this.gameOver = false;
        this.gameLoop = null;
        this.gameSpeed = 100; // ms por movimiento
        
        // Controles
        this.keys = {
            'ArrowUp': 'UP',
            'ArrowDown': 'DOWN',
            'ArrowLeft': 'LEFT',
            'ArrowRight': 'RIGHT'
        };
        
        // Bind de eventos
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.draw = this.draw.bind(this);
        this.update = this.update.bind(this);
        
        // Inicializar
        this.init();
    }
    
    init() {
        // Escuchar teclas solo cuando la ventana del juego esté activa
        document.addEventListener('keydown', this.handleKeyDown);
        this.generateRandomFood();
    }
    
    start() {
        if (this.gameLoop) clearInterval(this.gameLoop);
        this.gameLoop = setInterval(() => {
            if (!this.gameOver) {
                this.update();
                this.draw();
            }
        }, this.gameSpeed);
        this.draw();
    }
    
    stop() {
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
    }
    
    reset() {
        this.stop();
        this.snake = [
            {x: 10, y: 10},
            {x: 9, y: 10},
            {x: 8, y: 10},
            {x: 7, y: 10}
        ];
        this.direction = 'RIGHT';
        this.nextDirection = 'RIGHT';
        this.score = 0;
        this.gameOver = false;
        this.generateRandomFood();
        this.updateScoreDisplay();
        this.start();
        this.draw();
    }
    
    handleKeyDown(e) {
        if (this.gameOver && e.code === 'Space') {
            this.reset();
            return;
        }
        if (this.keys[e.key]) {
            const newDir = this.keys[e.key];
            // Evitar giro de 180 grados
            if ((newDir === 'UP' && this.direction !== 'DOWN') ||
                (newDir === 'DOWN' && this.direction !== 'UP') ||
                (newDir === 'LEFT' && this.direction !== 'RIGHT') ||
                (newDir === 'RIGHT' && this.direction !== 'LEFT')) {
                this.nextDirection = newDir;
            }
            e.preventDefault();
        }
    }
    
    update() {
        if (this.gameOver) return;
        
        this.direction = this.nextDirection;
        
        // Calcular nueva cabeza
        let newHead = {...this.snake[0]};
        switch (this.direction) {
            case 'UP':    newHead.y--; break;
            case 'DOWN':  newHead.y++; break;
            case 'LEFT':  newHead.x--; break;
            case 'RIGHT': newHead.x++; break;
        }
        
        // Comprobar colisión con comida
        if (newHead.x === this.food.x && newHead.y === this.food.y) {
            // Comer: aumentar serpiente (no eliminar cola)
            this.snake.unshift(newHead);
            this.score++;
            this.updateScoreDisplay();
            this.generateRandomFood();
        } else {
            // Movimiento normal: agregar cabeza y quitar cola
            this.snake.unshift(newHead);
            this.snake.pop();
        }
        
        // Verificar colisiones
        if (this.checkCollision()) {
            this.gameOver = true;
            this.stop();
            this.draw(); // Redibujar para mostrar mensaje
        }
    }
    
    checkCollision() {
        const head = this.snake[0];
        // Colisión con paredes
        if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
            return true;
        }
        // Colisión con sí misma (excepto la cabeza)
        for (let i = 1; i < this.snake.length; i++) {
            if (this.snake[i].x === head.x && this.snake[i].y === head.y) {
                return true;
            }
        }
        return false;
    }
    
    generateRandomFood() {
        let newFood;
        let valid = false;
        while (!valid) {
            newFood = {
                x: Math.floor(Math.random() * this.cols),
                y: Math.floor(Math.random() * this.rows)
            };
            valid = true;
            for (let segment of this.snake) {
                if (segment.x === newFood.x && segment.y === newFood.y) {
                    valid = false;
                    break;
                }
            }
        }
        this.food = newFood;
    }
    
    updateScoreDisplay() {
        const scoreSpan = document.getElementById('game-score');
        if (scoreSpan) scoreSpan.textContent = this.score;
    }
    
    draw() {
        if (!this.canvas || !this.ctx) return;
        
        // Ajustar tamaño del canvas al contenedor
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight) - 20;
        this.canvas.width = size;
        this.canvas.height = size;
        this.cellSize = size / this.gridSize;
        
        // Fondo
        this.ctx.fillStyle = '#0a0f1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Dibujar cuadrícula tenue
        this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= this.gridSize; i++) {
            const pos = i * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(pos, 0);
            this.ctx.lineTo(pos, this.canvas.height);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(0, pos);
            this.ctx.lineTo(this.canvas.width, pos);
            this.ctx.stroke();
        }
        
        // Dibujar comida
        this.ctx.fillStyle = '#ef4444';
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#ef4444';
        this.ctx.fillRect(
            this.food.x * this.cellSize + 2,
            this.food.y * this.cellSize + 2,
            this.cellSize - 4,
            this.cellSize - 4
        );
        this.ctx.shadowBlur = 0;
        
        // Dibujar serpiente
        for (let i = 0; i < this.snake.length; i++) {
            const seg = this.snake[i];
            const gradient = this.ctx.createLinearGradient(
                seg.x * this.cellSize,
                seg.y * this.cellSize,
                (seg.x + 1) * this.cellSize,
                (seg.y + 1) * this.cellSize
            );
            if (i === 0) {
                gradient.addColorStop(0, '#10b981');
                gradient.addColorStop(1, '#059669');
            } else {
                gradient.addColorStop(0, '#34d399');
                gradient.addColorStop(1, '#10b981');
            }
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(
                seg.x * this.cellSize + 1,
                seg.y * this.cellSize + 1,
                this.cellSize - 2,
                this.cellSize - 2
            );
            // Ojos en la cabeza
            if (i === 0) {
                this.ctx.fillStyle = 'white';
                const eyeSize = this.cellSize / 6;
                const eyeOffset = this.cellSize / 3;
                if (this.direction === 'RIGHT') {
                    this.ctx.fillRect(seg.x * this.cellSize + this.cellSize - eyeOffset, seg.y * this.cellSize + eyeOffset, eyeSize, eyeSize);
                    this.ctx.fillRect(seg.x * this.cellSize + this.cellSize - eyeOffset, seg.y * this.cellSize + this.cellSize - eyeOffset*2, eyeSize, eyeSize);
                } else if (this.direction === 'LEFT') {
                    this.ctx.fillRect(seg.x * this.cellSize + eyeOffset - eyeSize, seg.y * this.cellSize + eyeOffset, eyeSize, eyeSize);
                    this.ctx.fillRect(seg.x * this.cellSize + eyeOffset - eyeSize, seg.y * this.cellSize + this.cellSize - eyeOffset*2, eyeSize, eyeSize);
                } else if (this.direction === 'UP') {
                    this.ctx.fillRect(seg.x * this.cellSize + eyeOffset, seg.y * this.cellSize + eyeOffset - eyeSize, eyeSize, eyeSize);
                    this.ctx.fillRect(seg.x * this.cellSize + this.cellSize - eyeOffset*2, seg.y * this.cellSize + eyeOffset - eyeSize, eyeSize, eyeSize);
                } else {
                    this.ctx.fillRect(seg.x * this.cellSize + eyeOffset, seg.y * this.cellSize + this.cellSize - eyeOffset, eyeSize, eyeSize);
                    this.ctx.fillRect(seg.x * this.cellSize + this.cellSize - eyeOffset*2, seg.y * this.cellSize + this.cellSize - eyeOffset, eyeSize, eyeSize);
                }
            }
        }
        
        // Mensaje de Game Over
        if (this.gameOver) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.font = `bold ${Math.floor(this.cellSize * 1.5)}px 'Outfit', sans-serif`;
            this.ctx.fillStyle = '#ef4444';
            this.ctx.shadowBlur = 0;
            this.ctx.textAlign = 'center';
            this.ctx.fillText('GAME OVER', this.canvas.width/2, this.canvas.height/2 - 20);
            this.ctx.font = `${Math.floor(this.cellSize)}px 'Outfit', sans-serif`;
            this.ctx.fillStyle = '#f3f4f6';
            this.ctx.fillText(`Score: ${this.score}`, this.canvas.width/2, this.canvas.height/2 + 20);
            this.ctx.font = `${Math.floor(this.cellSize * 0.7)}px 'Outfit', sans-serif`;
            this.ctx.fillStyle = '#9ca3af';
            this.ctx.fillText('Presiona ESPACIO para reiniciar', this.canvas.width/2, this.canvas.height/2 + 60);
        }
    }
    
    // Redimensionar cuando la ventana cambie de tamaño
    resize() {
        if (!this.gameOver) {
            this.draw();
        } else {
            this.draw();
        }
    }
}

// Inicialización desde app.js
let activeGame = null;

function initGame() {
    const gameCanvas = document.getElementById('game-canvas');
    if (!gameCanvas) return;
    
    if (activeGame) {
        activeGame.stop();
        activeGame = null;
    }
    activeGame = new SnakeGame('game-canvas');
    
    // Asegurar que el canvas se redibuje al redimensionar la ventana
    const winGame = document.getElementById('win-game');
    const resizeObserver = new ResizeObserver(() => {
        if (activeGame && winGame.style.display !== 'none') {
            activeGame.resize();
        }
    });
    if (winGame) resizeObserver.observe(winGame);
    
    // Limpiar evento cuando la ventana se cierra
    winGame.addEventListener('close', () => {
        if (activeGame) activeGame.stop();
    });
}

// Exportar para uso global
window.initGame = initGame;