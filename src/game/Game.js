import { PieceType, Color, BoardConfig } from '../config/GravityRules.js';
import { Board } from './Board.js';
import { Piece, PieceFactory } from './Piece.js';
import ChessRules from '../rules/ChessRules.js';
import ChessAI from '../ai/ChessAI.js';
import { soundManager } from '../audio/SoundManager.js';

/**
 * Game Controller
 * 
 * Manages the overall game state, turn management, and coordinates
 * between board, pieces, rules, and AI.
 */
export class Game {
  constructor(scene, playerColor = Color.WHITE, pieceSet = 'procedural') {
    this.scene = scene;
    this.playerColor = playerColor;
    this.aiColor = playerColor === Color.WHITE ? Color.BLACK : Color.WHITE;
    this.pieceSet = pieceSet;
    
    // Game state
    this.boardState = []; // 2D array of Piece objects
    this.currentTurn = Color.WHITE;
    this.selectedPiece = null;
    this.isGameOver = false;
    this.isAIThinking = false;
    this.hasFirstMoveMade = false; // Gravity only applies after first move
    
    // Animation state
    this.activeAnimations = []; // Currently animating pieces
    this.isAnimating = false;
    
    // Components
    this.board = new Board(scene);
    this.pieceFactory = new PieceFactory(scene, pieceSet);
    this.rules = new ChessRules();
    this.ai = new ChessAI(this.aiColor);
    
    // Callbacks
    this.onTurnChange = null;
    this.onGameOver = null;
    this.onAIThinking = null;
  }
  
  /**
   * Initialize the game (async for loading 3D models)
   */
  async init() {
    await this.pieceFactory.init();
    this.setupInitialPosition();
  }

  /**
   * Set up the initial chess position
   */
  setupInitialPosition() {
    // Initialize empty board
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      this.boardState[row] = [];
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        this.boardState[row][col] = null;
      }
    }
    
    // Set up pawns
    for (let col = 0; col < 8; col++) {
      this.createPiece(PieceType.PAWN, Color.BLACK, 1, col);
      this.createPiece(PieceType.PAWN, Color.WHITE, 6, col);
    }
    
    // Set up other pieces
    const backRowPieces = [
      PieceType.ROOK, PieceType.KNIGHT, PieceType.BISHOP, PieceType.QUEEN,
      PieceType.KING, PieceType.BISHOP, PieceType.KNIGHT, PieceType.ROOK
    ];
    
    for (let col = 0; col < 8; col++) {
      this.createPiece(backRowPieces[col], Color.BLACK, 0, col);
      this.createPiece(backRowPieces[col], Color.WHITE, 7, col);
    }
    
    // Update board heights
    this.updateBoardState();
    
    // Start intro animation with random pattern selection
    const patterns = ['allAtOnce', 'fieldByField', 'concentric', 'random'];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    this.board.startIntroAnimation(pattern);
  }

  /**
   * Create a piece and add to board
   */
  createPiece(type, color, row, col) {
    const piece = this.pieceFactory.createPiece(type, color, row, col, this.board);
    this.boardState[row][col] = piece;
    return piece;
  }

  /**
   * Update board heights and gravity overlays
   */
  updateBoardState() {
    // Only apply gravity effects after first move
    if (this.hasFirstMoveMade) {
      this.board.updateHeights(this.boardState);
      this.board.updateGravityOverlays(this.boardState);
    }
  }

  /**
   * Handle piece selection
   * @param {number} row 
   * @param {number} col 
   * @returns {boolean} True if a piece was selected
   */
  selectPiece(row, col) {
    const piece = this.boardState[row]?.[col];
    
    // Can't select during AI turn or when game is over
    if (this.isGameOver || this.isAIThinking) return false;
    
    // Deselect if clicking on same piece
    if (this.selectedPiece && this.selectedPiece.row === row && this.selectedPiece.col === col) {
      this.deselectPiece();
      return false;
    }
    
    // If clicking on enemy piece, show their possible moves (preview)
    if (piece && piece.color !== this.playerColor) {
      this.deselectPiece();
      this.showEnemyMoves(piece);
      return false; // Not a real selection, just preview
    }
    
    // Can only select own pieces on own turn
    if (piece && piece.color === this.currentTurn && piece.color === this.playerColor) {
      this.deselectPiece();
      this.selectedPiece = piece;
      this.pieceFactory.highlightPiece(piece);
      this.board.highlightSquare(row, col, 'selected');
      
      // Highlight legal moves
      const moves = this.rules.getLegalMoves(piece, this.boardState);
      for (const move of moves) {
        const type = move.type === 'capture' ? 'capture' : 'move';
        this.board.highlightSquare(move.row, move.col, type);
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Show enemy piece's possible moves (for preview/planning)
   */
  showEnemyMoves(piece) {
    this.board.clearHighlights();
    
    // Highlight the enemy piece position
    this.board.highlightSquare(piece.row, piece.col, 'enemy');
    
    // Show their legal moves with a different highlight
    const moves = this.rules.getLegalMoves(piece, this.boardState);
    for (const move of moves) {
      const type = move.type === 'capture' ? 'enemyCapture' : 'enemyMove';
      this.board.highlightSquare(move.row, move.col, type);
    }
  }

  /**
   * Deselect current piece
   */
  deselectPiece() {
    if (this.selectedPiece) {
      this.pieceFactory.unhighlightPiece(this.selectedPiece);
      this.selectedPiece = null;
    }
    this.board.clearHighlights();
  }

  /**
   * Attempt to move selected piece to target square
   * @param {number} row 
   * @param {number} col 
   * @returns {boolean} True if move was made
   */
  tryMove(row, col) {
    if (!this.selectedPiece || this.isGameOver || this.isAIThinking) return false;
    
    const moves = this.rules.getLegalMoves(this.selectedPiece, this.boardState);
    const move = moves.find(m => m.row === row && m.col === col);
    
    if (!move) return false;
    
    this.executeMove(this.selectedPiece, move);
    return true;
  }

  /**
   * Execute a move with animation
   */
  executeMove(piece, move) {
    const fromRow = piece.row;
    const fromCol = piece.col;
    
    // Mark that first move has been made - gravity now applies
    this.hasFirstMoveMade = true;
    
    // Get start and end positions
    const startPos = this.board.getSquarePosition(fromRow, fromCol);
    const endPos = this.board.getSquarePosition(move.row, move.col);
    
    // Store captured piece for delayed removal
    const capturedPiece = this.boardState[move.row][move.col];
    
    // Handle en passant captured piece
    let enPassantCaptured = null;
    if (move.enPassant) {
      const capturedRow = piece.color === Color.WHITE ? move.row + 1 : move.row - 1;
      enPassantCaptured = this.boardState[capturedRow][move.col];
    }
    
    // Update board state immediately (for game logic)
    this.boardState[move.row][move.col] = piece;
    this.boardState[fromRow][fromCol] = null;
    piece.setPosition(move.row, move.col);
    
    // Handle castling rook (instant for now)
    if (move.type === 'castle') {
      const rook = this.boardState[piece.row][move.rookFrom];
      if (rook) {
        this.boardState[piece.row][move.rookTo] = rook;
        this.boardState[piece.row][move.rookFrom] = null;
        rook.setPosition(piece.row, move.rookTo);
        // Animate rook too
        const rookStart = this.board.getSquarePosition(piece.row, move.rookFrom);
        const rookEnd = this.board.getSquarePosition(piece.row, move.rookTo);
        this.startPieceAnimation(rook, rookStart, rookEnd);
      }
    }
    
    // Update en passant target
    this.rules.setEnPassantTarget(piece, fromRow, move.row);
    
    // Check if this is a capture move
    const isCapture = !!(capturedPiece || enPassantCaptured);
    
    // Start piece animation
    this.startPieceAnimation(piece, startPos, endPos, () => {
      // Animation complete callback
      
      // Remove captured pieces
      if (capturedPiece) {
        this.pieceFactory.removePieceMesh(capturedPiece);
      }
      if (enPassantCaptured) {
        this.pieceFactory.removePieceMesh(enPassantCaptured);
        const capturedRow = piece.color === Color.WHITE ? move.row + 1 : move.row - 1;
        this.boardState[capturedRow][move.col] = null;
      }
      
      // Handle pawn promotion
      if (this.rules.shouldPromote(piece)) {
        this.promotePawn(piece, PieceType.QUEEN);
      }
      
      // Update board state
      this.updateBoardState();
      
      // Switch turns
      this.switchTurn();
    }, isCapture);
    
    this.deselectPiece();
  }
  
  /**
   * Start animated piece movement
   * Phase 1: Lift up (0.5s)
   * Phase 2: Move horizontally (1.0s) 
   * Phase 3: Land down (0.5s)
   */
  startPieceAnimation(piece, startPos, endPos, onComplete = null, isCapture = false) {
    const liftHeight = 1.0; // How high to lift piece
    
    // Play lift sound
    soundManager.playLift();
    
    const animation = {
      piece: piece,
      startPos: startPos.clone(),
      endPos: endPos.clone(),
      liftHeight: liftHeight,
      phase: 0, // 0: lift, 1: move, 2: land
      phaseTime: 0,
      phaseDurations: [0.5, 1.0, 0.5], // seconds per phase
      onComplete: onComplete,
      isCapture: isCapture, // Track if this move captures a piece
      soundsPlayed: { move: false, land: false }
    };
    
    this.activeAnimations.push(animation);
    this.isAnimating = true;
  }
  
  /**
   * Smooth ease-in-out function
   */
  easeInOutCubic(t) {
    return t < 0.5 
      ? 4 * t * t * t 
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  /**
   * Update piece animations
   */
  updateAnimations(deltaTime) {
    for (let i = this.activeAnimations.length - 1; i >= 0; i--) {
      const anim = this.activeAnimations[i];
      
      anim.phaseTime += deltaTime;
      const phaseDuration = anim.phaseDurations[anim.phase];
      const phaseProgress = Math.min(anim.phaseTime / phaseDuration, 1.0);
      const eased = this.easeInOutCubic(phaseProgress);
      
      const mesh = anim.piece.mesh;
      if (!mesh) continue;
      
      if (anim.phase === 0) {
        // Phase 0: Lift up
        const liftY = anim.startPos.y + eased * anim.liftHeight;
        mesh.position.set(anim.startPos.x, liftY, anim.startPos.z);
        
      } else if (anim.phase === 1) {
        // Phase 1: Move horizontally at lifted height
        const x = anim.startPos.x + (anim.endPos.x - anim.startPos.x) * eased;
        const z = anim.startPos.z + (anim.endPos.z - anim.startPos.z) * eased;
        const y = anim.startPos.y + anim.liftHeight;
        mesh.position.set(x, y, z);
        
      } else if (anim.phase === 2) {
        // Phase 2: Land down
        const landY = (anim.startPos.y + anim.liftHeight) - eased * anim.liftHeight;
        // Interpolate to actual end Y in case board height changed
        const finalY = anim.endPos.y + (1 - eased) * anim.liftHeight;
        mesh.position.set(anim.endPos.x, finalY, anim.endPos.z);
      }
      
      // Play sounds at phase transitions
      if (anim.phase === 1 && !anim.soundsPlayed.move) {
        soundManager.playMove();
        anim.soundsPlayed.move = true;
      }
      
      // Check phase completion
      if (phaseProgress >= 1.0) {
        anim.phase++;
        anim.phaseTime = 0;
        
        // Update end position for landing (board may have changed)
        if (anim.phase === 2) {
          anim.endPos = this.board.getSquarePosition(anim.piece.row, anim.piece.col);
        }
        
        // Animation complete
        if (anim.phase > 2) {
          // Play landing sound (capture sound if capturing)
          if (anim.isCapture) {
            soundManager.playCapture();
          } else {
            soundManager.playLand();
          }
          
          // Snap to final position
          const finalPos = this.board.getSquarePosition(anim.piece.row, anim.piece.col);
          mesh.position.set(finalPos.x, finalPos.y, finalPos.z);
          
          if (anim.onComplete) {
            anim.onComplete();
          }
          
          this.activeAnimations.splice(i, 1);
        }
      }
    }
    
    this.isAnimating = this.activeAnimations.length > 0;
  }

  /**
   * Promote a pawn to another piece type
   */
  promotePawn(pawn, newType) {
    const { row, col, color } = pawn;
    
    // Remove old pawn
    this.pieceFactory.removePieceMesh(pawn);
    this.boardState[row][col] = null;
    
    // Create new piece
    this.createPiece(newType, color, row, col);
  }

  /**
   * Switch to next player's turn
   */
  switchTurn() {
    this.currentTurn = this.currentTurn === Color.WHITE ? Color.BLACK : Color.WHITE;
    
    // Check for game over conditions
    if (this.rules.isCheckmate(this.currentTurn, this.boardState)) {
      this.isGameOver = true;
      soundManager.playGameOver();
      const winner = this.currentTurn === Color.WHITE ? Color.BLACK : Color.WHITE;
      if (this.onGameOver) {
        this.onGameOver('checkmate', winner);
      }
      return;
    }
    
    if (this.rules.isStalemate(this.currentTurn, this.boardState)) {
      this.isGameOver = true;
      soundManager.playGameOver();
      if (this.onGameOver) {
        this.onGameOver('stalemate', null);
      }
      return;
    }
    
    // Check if current player is in check (play check sound)
    if (this.rules.isInCheck(this.currentTurn, this.boardState)) {
      soundManager.playCheck();
    }
    
    // Notify turn change
    if (this.onTurnChange) {
      this.onTurnChange(this.currentTurn);
    }
    
    // AI move
    if (this.currentTurn === this.aiColor) {
      this.doAIMove();
    }
  }

  /**
   * Execute AI move
   */
  async doAIMove() {
    this.isAIThinking = true;
    if (this.onAIThinking) {
      this.onAIThinking(true);
    }
    
    // Use setTimeout to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const move = this.ai.getBestMove(this.boardState);
    
    if (move) {
      // Find the piece to move
      const piece = this.boardState[move.from.row][move.from.col];
      if (piece) {
        this.executeMove(piece, move.to);
      }
    }
    
    this.isAIThinking = false;
    if (this.onAIThinking) {
      this.onAIThinking(false);
    }
  }

  /**
   * Update game animations (call in render loop)
   */
  update(deltaTime = 0.016) {
    this.board.animate();
    
    // Update piece movement animations
    this.updateAnimations(deltaTime);
    
    // Update piece positions to follow column top surface (only non-animating pieces)
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const piece = this.boardState[row][col];
        if (piece && piece.mesh) {
          // Skip pieces that are currently animating
          const isAnimating = this.activeAnimations.some(a => a.piece === piece);
          if (!isAnimating) {
            const pos = this.board.getSquarePosition(row, col);
            piece.mesh.position.y = pos.y; // Pieces sit directly on board surface
          }
        }
      }
    }
  }

  /**
   * Reset game to initial state
   */
  reset(playerColor = null) {
    // Clear current pieces
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const piece = this.boardState[row][col];
        if (piece) {
          this.pieceFactory.removePieceMesh(piece);
        }
      }
    }
    
    // Reset state
    if (playerColor) {
      this.playerColor = playerColor;
      this.aiColor = playerColor === Color.WHITE ? Color.BLACK : Color.WHITE;
      this.ai = new ChessAI(this.aiColor);
    }
    
    this.currentTurn = Color.WHITE;
    this.selectedPiece = null;
    this.isGameOver = false;
    this.isAIThinking = false;
    this.hasFirstMoveMade = false;
    this.rules.enPassantTarget = null;
    
    this.board.clearHighlights();
    this.setupInitialPosition();
    
    // Note: setupInitialPosition already triggers intro animation
    
    if (this.onTurnChange) {
      this.onTurnChange(this.currentTurn);
    }
    
    // If AI plays white, make its move
    if (this.aiColor === Color.WHITE) {
      this.doAIMove();
    }
  }

  /**
   * Get all meshes for raycasting
   */
  getRaycastTargets() {
    return [
      ...this.board.getSquareMeshes(),
      ...this.pieceFactory.getPieceMeshes()
    ];
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.board.dispose();
    this.pieceFactory.dispose();
  }
}

export default Game;
