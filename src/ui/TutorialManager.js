import * as THREE from 'three';
import { PieceType, Color, GravityRules, BoardConfig } from '../config/GravityRules.js';
import { Board } from '../game/Board.js';
import { Piece, PieceFactory } from '../game/Piece.js';
import { soundManager } from '../audio/SoundManager.js';

/**
 * Tutorial steps with piece placements and explanatory text
 */
const TUTORIAL_STEPS = [
  {
    id: 'intro',
    title: 'Welcome to GraviChess!',
    text: 'In this game, chess pieces have mass and warp the board like gravity warps spacetime. Let\'s see how this works step by step.',
    pieces: [],
  },
  {
    id: 'pawn',
    title: 'The Pawn — Weight: -1',
    text: 'Pawns are the lightest pieces. They sink only 1 level deep and create no gravity well around them. Other pieces remain unaffected by pawns.',
    pieces: [{ type: PieceType.PAWN, color: Color.WHITE, row: 4, col: 4 }],
  },
  {
    id: 'knight',
    title: 'The Knight — Weight: -2',
    text: 'Knights sink 2 levels and create a gravity well with radius 1. Adjacent squares sink slightly towards the Knight.',
    pieces: [{ type: PieceType.KNIGHT, color: Color.WHITE, row: 4, col: 2 }],
  },
  {
    id: 'bishop',
    title: 'The Bishop — Weight: -3',
    text: 'Bishops sink 3 levels with a gravity radius of 2. The surrounding squares form a deeper depression around them.',
    pieces: [{ type: PieceType.BISHOP, color: Color.WHITE, row: 4, col: 6 }],
  },
  {
    id: 'rook',
    title: 'The Rook — Weight: -4',
    text: 'Rooks are heavy! They sink 4 levels deep and pull neighboring squares down within 3 squares of distance.',
    pieces: [{ type: PieceType.ROOK, color: Color.WHITE, row: 2, col: 3 }],
  },
  {
    id: 'queen',
    title: 'The Queen — Weight: -5',
    text: 'The Queen creates a massive gravity well, sinking 5 levels with a radius of 4. She warps a large area of the board!',
    pieces: [{ type: PieceType.QUEEN, color: Color.WHITE, row: 2, col: 5 }],
  },
  {
    id: 'king',
    title: 'The King — Weight: -6',
    text: 'The King is the heaviest piece! He sinks 6 levels deep with a gravity radius of 5, affecting nearly half the board.',
    pieces: [{ type: PieceType.KING, color: Color.WHITE, row: 6, col: 4 }],
  },
  {
    id: 'capture-rule',
    title: 'Capture Rule — Escape Velocity',
    text: 'Here\'s the key rule: A piece can only capture another piece if the attacker is at the SAME height or HIGHER than the target. You can\'t climb out of a deeper gravity well to attack!',
    pieces: [],
  },
  {
    id: 'pitfall',
    title: 'The Pitfall Effect',
    text: 'Watch the pawn! When a piece is in a gravity well, moving "uphill" costs extra effort. A pawn stuck in a deep well LOSES its 2-square opening move — it can only take 1 step when climbing out.',
    pieces: [
      { type: PieceType.QUEEN, color: Color.BLACK, row: 3, col: 3 },
      { type: PieceType.PAWN, color: Color.WHITE, row: 4, col: 4, highlight: true },
    ],
    clearPrevious: true,
  },
  {
    id: 'strategy',
    title: 'Strategic Implications',
    text: 'Heavy pieces create defensive zones — lighter pieces can\'t easily capture them. Use your King and Queen to create "safe" areas on the board. Control the heights to control the game!',
    pieces: [],
  },
  {
    id: 'ready',
    title: 'Ready to Play!',
    text: 'You now understand gravity chess! Remember: pieces only create gravity AFTER they move. Opening moves don\'t warp the board yet. Good luck, spacetime tactician!',
    pieces: [],
    showStartButton: true,
  },
];

/**
 * TutorialManager
 * 
 * Manages the interactive tutorial that teaches gravity mechanics.
 */
export class TutorialManager {
  constructor(scene, pieceSet = 'procedural') {
    this.scene = scene;
    this.pieceSet = pieceSet;
    
    this.board = null;
    this.pieceFactory = null;
    this.pieces = []; // Active tutorial pieces
    this.boardState = []; // 2D board state array
    
    this.currentStep = 0;
    this.isActive = false;
    
    // Drop animation state
    this.dropAnimations = [];
    
    // Callbacks
    this.onExit = null;
    this.onStartGame = null;
    
    // Cache DOM elements
    this.tutorialScreen = document.getElementById('tutorial-screen');
    this.tutorialTitle = document.getElementById('tutorial-title');
    this.tutorialText = document.getElementById('tutorial-text');
    this.nextButton = document.getElementById('tutorial-next');
    this.leaveButton = document.getElementById('tutorial-leave');
    this.startButton = document.getElementById('tutorial-start');
    this.stepIndicator = document.getElementById('tutorial-step-indicator');
    
    this.setupEventListeners();
  }
  
  /**
   * Set up button event listeners
   */
  setupEventListeners() {
    this.nextButton?.addEventListener('click', () => this.nextStep());
    this.leaveButton?.addEventListener('click', () => this.exit());
    this.startButton?.addEventListener('click', () => {
      this.exit();
      if (this.onStartGame) this.onStartGame();
    });
  }
  
  /**
   * Initialize the tutorial (async for model loading)
   */
  async init() {
    // Initialize empty board state
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      this.boardState[row] = [];
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        this.boardState[row][col] = null;
      }
    }
    
    // Create board
    this.board = new Board(this.scene);
    
    // Create piece factory
    this.pieceFactory = new PieceFactory(this.scene, this.pieceSet);
    await this.pieceFactory.init();
  }
  
  /**
   * Start the tutorial
   */
  async start() {
    if (!this.board) {
      await this.init();
    }
    
    // Initialize sound if needed
    if (!soundManager.loaded) {
      await soundManager.init();
    }
    
    this.isActive = true;
    this.currentStep = 0;
    
    // Clear any existing pieces
    this.clearAllPieces();
    
    // Reset board heights to flat
    this.board.resetHeights();
    
    // Start board intro animation
    this.board.startIntroAnimation('concentric');
    
    // Show first step
    this.showStep(0);
    
    // Show tutorial UI
    this.show();
  }
  
  /**
   * Show tutorial overlay
   */
  show() {
    if (this.tutorialScreen) {
      this.tutorialScreen.classList.remove('hidden');
    }
  }
  
  /**
   * Hide tutorial overlay
   */
  hide() {
    if (this.tutorialScreen) {
      this.tutorialScreen.classList.add('hidden');
    }
  }
  
  /**
   * Show a specific tutorial step
   */
  showStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= TUTORIAL_STEPS.length) return;
    
    const step = TUTORIAL_STEPS[stepIndex];
    this.currentStep = stepIndex;
    
    // Update text content
    if (this.tutorialTitle) {
      this.tutorialTitle.textContent = step.title;
    }
    if (this.tutorialText) {
      this.tutorialText.textContent = step.text;
    }
    
    // Update step indicator
    if (this.stepIndicator) {
      this.stepIndicator.textContent = `${stepIndex + 1} / ${TUTORIAL_STEPS.length}`;
    }
    
    // Show/hide buttons based on step
    if (this.nextButton) {
      this.nextButton.style.display = step.showStartButton ? 'none' : 'block';
    }
    if (this.startButton) {
      this.startButton.style.display = step.showStartButton ? 'block' : 'none';
    }
    
    // Clear pieces if requested
    if (step.clearPrevious) {
      this.clearAllPieces();
    }
    
    // Add new pieces with drop animation
    if (step.pieces && step.pieces.length > 0) {
      this.addPiecesWithAnimation(step.pieces);
    }
  }
  
  /**
   * Advance to next step
   */
  nextStep() {
    if (this.currentStep < TUTORIAL_STEPS.length - 1) {
      soundManager.playMove();
      this.showStep(this.currentStep + 1);
    }
  }
  
  /**
   * Go to previous step
   */
  previousStep() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }
  
  /**
   * Add pieces with drop animation
   */
  addPiecesWithAnimation(pieceDefs) {
    const dropHeight = 3.0;
    const dropDuration = 0.6;
    
    for (let i = 0; i < pieceDefs.length; i++) {
      const def = pieceDefs[i];
      const delay = i * 0.2; // Stagger drops
      
      // Create piece
      const piece = this.pieceFactory.createPiece(
        def.type, 
        def.color, 
        def.row, 
        def.col, 
        this.board
      );
      
      // Mark as moved so gravity applies
      piece.hasMoved = true;
      
      // Store in board state
      this.boardState[def.row][def.col] = piece;
      this.pieces.push(piece);
      
      // Get target position
      const targetPos = this.board.getSquarePosition(def.row, def.col);
      
      // Start piece above
      piece.mesh.position.y = targetPos.y + dropHeight;
      
      // Create drop animation
      this.dropAnimations.push({
        piece: piece,
        startY: targetPos.y + dropHeight,
        endY: targetPos.y + 0.05,
        delay: delay,
        duration: dropDuration,
        timer: 0,
        completed: false,
        updateBoard: true,
      });
    }
  }
  
  /**
   * Clear all pieces from board
   */
  clearAllPieces() {
    for (const piece of this.pieces) {
      if (piece.mesh) {
        this.pieceFactory.pieceGroup.remove(piece.mesh);
        piece.mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
    }
    this.pieces = [];
    
    // Clear board state
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        this.boardState[row][col] = null;
      }
    }
    
    // Reset board heights
    this.board.resetHeights();
  }
  
  /**
   * Exit tutorial
   */
  exit() {
    this.isActive = false;
    this.hide();
    this.clearAllPieces();
    
    // Dispose board
    if (this.board) {
      this.board.dispose();
      this.board = null;
    }
    
    // Dispose piece factory
    if (this.pieceFactory) {
      this.pieceFactory.dispose();
      this.pieceFactory = null;
    }
    
    if (this.onExit) {
      this.onExit();
    }
  }
  
  /**
   * Update animations (called from main loop)
   */
  update(deltaTime) {
    if (!this.isActive) return;
    
    // Update board intro animation
    if (this.board) {
      this.board.animate();
    }
    
    // Update drop animations
    let needsBoardUpdate = false;
    
    for (const anim of this.dropAnimations) {
      if (anim.completed) continue;
      
      anim.timer += deltaTime;
      
      if (anim.timer < anim.delay) continue;
      
      const elapsed = anim.timer - anim.delay;
      const progress = Math.min(elapsed / anim.duration, 1.0);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate Y position
      const y = anim.startY + (anim.endY - anim.startY) * eased;
      anim.piece.mesh.position.y = y;
      
      // Check completion
      if (progress >= 1.0) {
        anim.completed = true;
        anim.piece.mesh.position.y = anim.endY;
        
        // Play landing sound
        soundManager.playLand();
        
        if (anim.updateBoard) {
          needsBoardUpdate = true;
        }
      }
    }
    
    // Remove completed animations
    this.dropAnimations = this.dropAnimations.filter(a => !a.completed);
    
    // Update board heights after pieces land
    if (needsBoardUpdate) {
      this.board.updateHeights(this.boardState);
      this.board.updateGravityOverlays(this.boardState);
    }
  }
  
  /**
   * Check if tutorial is running
   */
  get running() {
    return this.isActive;
  }
}

export default TutorialManager;
