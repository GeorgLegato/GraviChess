import { PieceType, Color, BoardConfig, AIConfig, GravityRules, calculateSquareHeight } from '../config/GravityRules.js';
import ChessRules from '../rules/ChessRules.js';

/**
 * GraviChess AI
 * 
 * Minimax-based AI with alpha-beta pruning.
 * Adapts classic chess strategies to GraviChess gravity mechanics.
 * 
 * Strategy considerations:
 * - Material value (standard chess)
 * - Positional advantage (center control)
 * - Gravity advantage (pieces in higher positions can capture more)
 * - King safety
 * - Mobility (number of available moves)
 */
export class ChessAI {
  constructor(color) {
    this.color = color;
    this.rules = new ChessRules();
    this.nodesEvaluated = 0;
    
    // Piece-square tables for positional evaluation (from white's perspective)
    this.pieceSquareTables = this.initPieceSquareTables();
  }

  /**
   * Initialize piece-square tables for positional evaluation
   * Higher values = better squares for that piece type
   */
  initPieceSquareTables() {
    return {
      [PieceType.PAWN]: [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0],
        [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5],
        [0,  0,  0,  0,  0,  0,  0,  0]
      ],
      [PieceType.KNIGHT]: [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
      ],
      [PieceType.BISHOP]: [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
      ],
      [PieceType.ROOK]: [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [0,  0,  0,  5,  5,  0,  0,  0]
      ],
      [PieceType.QUEEN]: [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [-5,  0,  5,  5,  5,  5,  0, -5],
        [0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
      ],
      [PieceType.KING]: [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [20, 20,  0,  0,  0,  0, 20, 20],
        [20, 30, 10,  0,  0, 10, 30, 20]
      ]
    };
  }

  /**
   * Get the best move for the AI
   * @param {Array} boardState - 2D array of pieces
   * @returns {Object} Best move {from, to, score}
   */
  getBestMove(boardState) {
    this.nodesEvaluated = 0;
    const startTime = Date.now();
    
    const moves = this.rules.getAllLegalMoves(this.color, boardState);
    
    if (moves.length === 0) {
      return null; // No legal moves
    }
    
    // Iterative deepening for better time management
    let bestMove = moves[0];
    let bestScore = -Infinity;
    
    // Order moves for better alpha-beta pruning
    const orderedMoves = this.orderMoves(moves, boardState);
    
    for (const move of orderedMoves) {
      const simulated = this.rules.simulateMove(move.piece, move.to, boardState);
      const score = this.minimax(
        simulated,
        AIConfig.SEARCH_DEPTH - 1,
        -Infinity,
        Infinity,
        false
      );
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      
      // Time limit check
      if (Date.now() - startTime > AIConfig.THINK_TIME_MS) {
        break;
      }
    }
    
    console.log(`AI evaluated ${this.nodesEvaluated} positions in ${Date.now() - startTime}ms`);
    return bestMove;
  }

  /**
   * Minimax algorithm with alpha-beta pruning
   */
  minimax(boardState, depth, alpha, beta, isMaximizing) {
    this.nodesEvaluated++;
    
    const currentColor = isMaximizing ? this.color : this.getOpponentColor();
    
    // Terminal conditions
    if (this.rules.isCheckmate(currentColor, boardState)) {
      return isMaximizing ? -100000 + depth : 100000 - depth;
    }
    
    if (this.rules.isStalemate(currentColor, boardState)) {
      return 0; // Draw
    }
    
    if (depth === 0) {
      return this.evaluate(boardState);
    }
    
    const moves = this.rules.getAllLegalMoves(currentColor, boardState);
    
    if (isMaximizing) {
      let maxEval = -Infinity;
      
      for (const move of moves) {
        const simulated = this.rules.simulateMove(move.piece, move.to, boardState);
        const evaluation = this.minimax(simulated, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        
        if (beta <= alpha) break; // Prune
      }
      
      return maxEval;
    } else {
      let minEval = Infinity;
      
      for (const move of moves) {
        const simulated = this.rules.simulateMove(move.piece, move.to, boardState);
        const evaluation = this.minimax(simulated, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        
        if (beta <= alpha) break; // Prune
      }
      
      return minEval;
    }
  }

  /**
   * Evaluate board position
   * Positive = good for AI, Negative = good for opponent
   */
  evaluate(boardState) {
    let score = 0;
    
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const piece = boardState[row][col];
        if (!piece) continue;
        
        const multiplier = piece.color === this.color ? 1 : -1;
        
        // Material value
        score += multiplier * GravityRules[piece.type].value;
        
        // Positional value (piece-square tables)
        const posScore = this.getPositionalScore(piece, row, col);
        score += multiplier * posScore * AIConfig.POSITION_WEIGHT;
        
        // Gravity advantage: pieces at higher positions can capture more
        const height = calculateSquareHeight(row, col, boardState);
        const gravityScore = -height * AIConfig.GRAVITY_ADVANTAGE_WEIGHT * 10;
        score += multiplier * gravityScore;
        
        // Center control bonus
        if (this.isCenterSquare(row, col)) {
          score += multiplier * AIConfig.CENTER_CONTROL_BONUS;
        }
      }
    }
    
    // Mobility evaluation
    const aiMoves = this.rules.getAllLegalMoves(this.color, boardState);
    const oppMoves = this.rules.getAllLegalMoves(this.getOpponentColor(), boardState);
    score += (aiMoves.length - oppMoves.length) * AIConfig.MOBILITY_WEIGHT;
    
    // King safety (penalty for exposed king)
    score += this.evaluateKingSafety(this.color, boardState);
    score -= this.evaluateKingSafety(this.getOpponentColor(), boardState);
    
    return score;
  }

  /**
   * Get positional score from piece-square tables
   */
  getPositionalScore(piece, row, col) {
    const table = this.pieceSquareTables[piece.type];
    if (!table) return 0;
    
    // Flip table for black pieces
    const tableRow = piece.color === Color.WHITE ? row : 7 - row;
    return table[tableRow][col];
  }

  /**
   * Check if square is in the center (d4, d5, e4, e5)
   */
  isCenterSquare(row, col) {
    return row >= 3 && row <= 4 && col >= 3 && col <= 4;
  }

  /**
   * Evaluate king safety
   */
  evaluateKingSafety(color, boardState) {
    // Find king
    let kingRow = -1, kingCol = -1;
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const piece = boardState[row][col];
        if (piece && piece.type === PieceType.KING && piece.color === color) {
          kingRow = row;
          kingCol = col;
          break;
        }
      }
      if (kingRow >= 0) break;
    }
    
    if (kingRow < 0) return 0;
    
    let safety = 0;
    
    // Bonus for pawn shield in front of king
    const direction = color === Color.WHITE ? -1 : 1;
    for (const colOff of [-1, 0, 1]) {
      const shieldRow = kingRow + direction;
      const shieldCol = kingCol + colOff;
      
      if (shieldRow >= 0 && shieldRow < 8 && shieldCol >= 0 && shieldCol < 8) {
        const piece = boardState[shieldRow][shieldCol];
        if (piece && piece.type === PieceType.PAWN && piece.color === color) {
          safety += AIConfig.KING_SAFETY_WEIGHT / 3;
        }
      }
    }
    
    // Penalty if king is in check
    if (this.rules.isInCheck(color, boardState)) {
      safety -= AIConfig.KING_SAFETY_WEIGHT * 2;
    }
    
    return safety;
  }

  /**
   * Order moves for better alpha-beta pruning
   * Captures and checks first
   */
  orderMoves(moves, boardState) {
    return moves.sort((a, b) => {
      // Captures first
      if (a.type === 'capture' && b.type !== 'capture') return -1;
      if (b.type === 'capture' && a.type !== 'capture') return 1;
      
      // Higher value captures first (MVV-LVA)
      if (a.type === 'capture' && b.type === 'capture') {
        const targetA = boardState[a.to.row][a.to.col];
        const targetB = boardState[b.to.row][b.to.col];
        const valueA = targetA ? GravityRules[targetA.type].value : 0;
        const valueB = targetB ? GravityRules[targetB.type].value : 0;
        return valueB - valueA;
      }
      
      // Center control moves prioritized
      const centerA = this.isCenterSquare(a.to.row, a.to.col) ? 1 : 0;
      const centerB = this.isCenterSquare(b.to.row, b.to.col) ? 1 : 0;
      return centerB - centerA;
    });
  }

  /**
   * Get opponent's color
   */
  getOpponentColor() {
    return this.color === Color.WHITE ? Color.BLACK : Color.WHITE;
  }
}

export default ChessAI;
