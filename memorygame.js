// memorygame.js - Juego de Memoria (Memory Match) para Ace-a-DesktopOS

class MemoryGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Configuración
        this.rows = 4;
        this.cols = 4;
        this.cardCount = this.rows * this.cols; // 16 cartas
        this.cardWidth = 0;
        this.cardHeight = 0;
        
        // Datos del juego
        this.icons = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼']; // 8 pares
        this.cards = [];
        this.flippedIndices = [];
        this.matchedIndices = [];
        this.locked = false;
        this.moves = 0;
        this.startTime = null;
        this.timerInterval = null;
        this.gameFinished = false;
        
        // Bindings
        this.handleClick = this.handleClick.bind(this);
        this.draw = this.draw.bind(this);
        
        this.init();
    }
    
    init() {
        this.canvas.addEventListener('click', this.handleClick);
        this.resetGame();
    }
    
    resetGame() {
        // Detener timer
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.startTime = null;
        this.gameFinished = false;
        this.moves = 0;
        this.flippedIndices = [];
        this.matchedIndices = [];
        this.locked = false;
        this.updateUI();
        
        // Crear array de cartas: cada icono aparece dos veces
        let deck = [...this.icons, ...this.icons];
        // Mezclar (Fisher-Yates)
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        this.cards = deck.map((icon, index) => ({
            id: index,
            icon: icon,
            flipped: false,
            matched: false
        }));
        
        this.draw();
    }
    
    handleClick(e) {
        if (this.locked || this.gameFinished) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;
        
        const col = Math.floor(mouseX / this.cardWidth);
        const row = Math.floor(mouseY / this.cardHeight);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
        
        const idx = row * this.cols + col;
        const card = this.cards[idx];
        
        if (card.matched || card.flipped) return;
        if (this.flippedIndices.length === 2) return;
        
        // Iniciar timer si es el primer movimiento
        if (this.startTime === null && !this.gameFinished) {
            this.startTime = Date.now();
            this.timerInterval = setInterval(() => this.updateTimer(), 1000);
        }
        
        // Voltear carta
        card.flipped = true;
        this.flippedIndices.push(idx);
        this.draw();
        
        if (this.flippedIndices.length === 2) {
            this.moves++;
            this.updateUI();
            this.locked = true;
            const idxA = this.flippedIndices[0];
            const idxB = this.flippedIndices[1];
            const cardA = this.cards[idxA];
            const cardB = this.cards[idxB];
            
            if (cardA.icon === cardB.icon) {
                // Match
                setTimeout(() => {
                    cardA.matched = true;
                    cardB.matched = true;
                    cardA.flipped = false;
                    cardB.flipped = false;
                    this.flippedIndices = [];
                    this.locked = false;
                    this.draw();
                    this.checkGameComplete();
                }, 500);
            } else {
                // No match, voltear después de 1 segundo
                setTimeout(() => {
                    cardA.flipped = false;
                    cardB.flipped = false;
                    this.flippedIndices = [];
                    this.locked = false;
                    this.draw();
                }, 1000);
            }
        }
    }
    
    checkGameComplete() {
        const allMatched = this.cards.every(card => card.matched === true);
        if (allMatched) {
            this.gameFinished = true;
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.updateUI();
            this.draw();
        }
    }
    
    updateUI() {
        const movesSpan = document.getElementById('memory-moves');
        if (movesSpan) movesSpan.textContent = this.moves;
        this.updateTimer();
    }
    
    updateTimer() {
        if (!this.startTime || this.gameFinished) return;
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timerSpan = document.getElementById('memory-timer');
        if (timerSpan) timerSpan.textContent = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
    }
    
    draw() {
        if (!this.canvas || !this.ctx) return;
        
        // Dimensiones responsive
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight) - 20;
        this.canvas.width = size;
        this.canvas.height = size;
        this.cardWidth = this.canvas.width / this.cols;
        this.cardHeight = this.canvas.height / this.rows;
        
        // Fondo
        this.ctx.fillStyle = '#0a0f1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Dibujar cartas
        for (let i = 0; i < this.cards.length; i++) {
            const card = this.cards[i];
            const row = Math.floor(i / this.cols);
            const col = i % this.cols;
            const x = col * this.cardWidth;
            const y = row * this.cardHeight;
            
            // Borde redondeado
            this.ctx.save();
            this.ctx.shadowBlur = 0;
            this.ctx.beginPath();
            this.ctx.roundRect(x+2, y+2, this.cardWidth-4, this.cardHeight-4, 8);
            
            if (card.matched) {
                this.ctx.fillStyle = '#1e2a3a';
                this.ctx.fill();
                this.ctx.fillStyle = '#10b981';
                this.ctx.font = `${Math.floor(this.cardHeight * 0.5)}px "Segoe UI Emoji"`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText('✓', x + this.cardWidth/2, y + this.cardHeight/2);
            } else if (card.flipped) {
                // Carta levantada
                const grad = this.ctx.createLinearGradient(x, y, x+this.cardWidth, y+this.cardHeight);
                grad.addColorStop(0, '#2d3e5f');
                grad.addColorStop(1, '#1e2a3a');
                this.ctx.fillStyle = grad;
                this.ctx.fill();
                this.ctx.fillStyle = '#f3f4f6';
                this.ctx.font = `${Math.floor(this.cardHeight * 0.6)}px "Segoe UI Emoji"`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(card.icon, x + this.cardWidth/2, y + this.cardHeight/2);
            } else {
                // Carta boca abajo
                const grad = this.ctx.createLinearGradient(x, y, x+this.cardWidth, y+this.cardHeight);
                grad.addColorStop(0, '#1e293b');
                grad.addColorStop(1, '#0f172a');
                this.ctx.fillStyle = grad;
                this.ctx.fill();
                this.ctx.fillStyle = '#3b82f6';
                this.ctx.font = `${Math.floor(this.cardHeight * 0.5)}px "Segoe UI Emoji"`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText('?', x + this.cardWidth/2, y + this.cardHeight/2);
            }
            this.ctx.restore();
        }
        
        // Mensaje de fin del juego
        if (this.gameFinished) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.font = `bold ${Math.floor(this.cardHeight * 0.5)}px 'Outfit', sans-serif`;
            this.ctx.fillStyle = '#10b981';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('¡COMPLETADO!', this.canvas.width/2, this.canvas.height/2 - 40);
            this.ctx.font = `${Math.floor(this.cardHeight * 0.3)}px 'Outfit', sans-serif`;
            this.ctx.fillStyle = '#f3f4f6';
            this.ctx.fillText(`Movimientos: ${this.moves}`, this.canvas.width/2, this.canvas.height/2 + 10);
            this.ctx.font = `${Math.floor(this.cardHeight * 0.2)}px 'Outfit', sans-serif`;
            this.ctx.fillStyle = '#9ca3af';
            this.ctx.fillText('Haz clic en "Reiniciar" para jugar de nuevo', this.canvas.width/2, this.canvas.height/2 + 50);
        }
    }
    
    resize() {
        this.draw();
    }
    
    destroy() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.canvas.removeEventListener('click', this.handleClick);
    }
}

// Helper para roundRect si no existe
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.moveTo(x+r, y);
        this.lineTo(x+w-r, y);
        this.quadraticCurveTo(x+w, y, x+w, y+r);
        this.lineTo(x+w, y+h-r);
        this.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
        this.lineTo(x+r, y+h);
        this.quadraticCurveTo(x, y+h, x, y+h-r);
        this.lineTo(x, y+r);
        this.quadraticCurveTo(x, y, x+r, y);
        return this;
    };
}

let activeMemoryGame = null;

function initMemoryGame() {
    const canvas = document.getElementById('memory-canvas');
    if (!canvas) return;
    if (activeMemoryGame) {
        activeMemoryGame.destroy();
        activeMemoryGame = null;
    }
    activeMemoryGame = new MemoryGame('memory-canvas');
    
    // Botón reiniciar
    const resetBtn = document.getElementById('memory-reset-btn');
    if (resetBtn) {
        const newReset = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newReset, resetBtn);
        newReset.addEventListener('click', () => {
            if (activeMemoryGame) activeMemoryGame.resetGame();
        });
    }
    
    // Observar redimensionamiento de ventana
    const winMemory = document.getElementById('win-memory');
    if (winMemory) {
        const resizeObserver = new ResizeObserver(() => {
            if (winMemory.style.display !== 'none' && activeMemoryGame) {
                activeMemoryGame.resize();
            }
        });
        resizeObserver.observe(winMemory);
    }
}

window.initMemoryGame = initMemoryGame;