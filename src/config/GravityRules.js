/**
 * GraviChess Configuration
 * 
 * Central configuration file for all game rules and constants.
 * Modify these values to fine-tune the game mechanics.
 */

// Piece types enumeration
export const PieceType = {
  PAWN: 'pawn',
  KNIGHT: 'knight',
  BISHOP: 'bishop',
  ROOK: 'rook',
  QUEEN: 'queen',
  KING: 'king',
};

// Player colors
export const Color = {
  WHITE: 'white',
  BLACK: 'black',
};

/**
 * GRAVITY RULES TABLE
 * 
 * height: How deep the piece sinks into spacetime (negative = deeper)
 * gravityRadius: Number of squares around the piece affected by its gravity well
 * value: Material value for AI evaluation (standard chess values)
 * 
 * CAPTURE RULE: A piece can only capture another piece if:
 *   1. The target is within the attacker's movement range (standard chess rules)
 *   2. The attacker's current height >= target's current height
 *      (you need enough "escape velocity" to climb out of a gravity well)
 */
export const GravityRules = {
  [PieceType.PAWN]: {
    height: -1,
    gravityRadius: 0,
    value: 100,
    symbol: '♟',
  },
  [PieceType.KNIGHT]: {
    height: -2,
    gravityRadius: 1,
    value: 320,
    symbol: '♞',
  },
  [PieceType.BISHOP]: {
    height: -3,
    gravityRadius: 2,
    value: 330,
    symbol: '♝',
  },
  [PieceType.ROOK]: {
    height: -4,
    gravityRadius: 3,
    value: 500,
    symbol: '♜',
  },
  [PieceType.QUEEN]: {
    height: -5,
    gravityRadius: 4,
    value: 900,
    symbol: '♛',
  },
  [PieceType.KING]: {
    height: -6,
    gravityRadius: 5,
    value: 20000, // Infinite value effectively
    symbol: '♚',
  },
};

/**
 * BOARD CONFIGURATION
 */
export const BoardConfig = {
  SIZE: 8,
  SQUARE_SIZE: 1.0,
  BASE_HEIGHT: 0,
  HEIGHT_SCALE: 0.5, // Each gravity step = 0.5 world units (8 steps = 4 units depth)
  DEPTH_STRIPE_SIZE: 0.5, // Same as HEIGHT_SCALE for depth indicators
  LIGHT_COLOR: 0xf0d9b5,
  DARK_COLOR: 0xb58863,
  HIGHLIGHT_COLOR: 0x7bff00, // Selected piece
  MOVE_HIGHLIGHT_COLOR: 0x00ff88, // Valid move squares
  CAPTURE_HIGHLIGHT_COLOR: 0xff4444, // Capture squares
  ENEMY_HIGHLIGHT_COLOR: 0xff8800, // Enemy piece selected (orange)
  ENEMY_MOVE_COLOR: 0xffaa44, // Enemy possible moves (light orange)
  ENEMY_CAPTURE_COLOR: 0xff6600, // Enemy capture squares (dark orange)
  GRAVITY_WELL_COLOR: 0x7b2ff7, // Gravity well visualization
};

/**
 * VISUAL CONFIGURATION
 */
export const VisualConfig = {
  GRAVITY_OVERLAY_OPACITY: 0.15,
  GRAVITY_OVERLAY_HEIGHT: 0.05,
  PIECE_SCALE: 0.48, // 20% larger than 0.4
  ANIMATION_SPEED: 0.1, // Lerp factor for smooth height changes
  WHITE_PIECE_COLOR: 0xffffff,
  BLACK_PIECE_COLOR: 0x661111, // Dark red for visibility on dark background
};

/**
 * AI CONFIGURATION
 */
export const AIConfig = {
  SEARCH_DEPTH: 3, // Minimax depth (higher = stronger but slower)
  POSITION_WEIGHT: 0.1, // Weight for positional evaluation
  GRAVITY_ADVANTAGE_WEIGHT: 0.2, // Weight for gravity position advantage
  CENTER_CONTROL_BONUS: 10, // Bonus for controlling center squares
  MOBILITY_WEIGHT: 5, // Points per available move
  KING_SAFETY_WEIGHT: 50, // Penalty for exposed king
  THINK_TIME_MS: 1000, // Maximum AI thinking time
};

/**
 * Get the effective height of a square based on pieces and their gravity wells
 * IMPORTANT: Only pieces that have moved apply their gravity weight.
 * Unmoved pieces (on original squares) have weight 0 = max height.
 * 
 * @param {number} row - Board row (0-7)
 * @param {number} col - Board column (0-7)
 * @param {Array} board - 2D array of pieces
 * @returns {number} Effective height (0 = base, negative = lower)
 */
export function calculateSquareHeight(row, col, board) {
  let height = BoardConfig.BASE_HEIGHT;
  
  // Check the piece on this square
  const piece = board[row]?.[col];
  if (piece) {
    // Only apply gravity if the piece has moved
    if (piece.hasMoved) {
      height = GravityRules[piece.type].height;
    }
    // Unmoved pieces have weight 0, so height stays at BASE_HEIGHT (0)
  }
  
  // Check neighboring pieces' gravity wells (only from moved pieces)
  let gravityEffect = 0;
  for (let r = 0; r < BoardConfig.SIZE; r++) {
    for (let c = 0; c < BoardConfig.SIZE; c++) {
      const neighborPiece = board[r]?.[c];
      // Only apply gravity effect if the neighbor piece has moved
      if (neighborPiece && neighborPiece.hasMoved && (r !== row || c !== col)) {
        const gravRadius = GravityRules[neighborPiece.type].gravityRadius;
        const distance = Math.max(Math.abs(r - row), Math.abs(c - col)); // Chebyshev distance
        
        if (distance <= gravRadius) {
          // Gravity effect with 50% decay per radial step
          // Adjacent (distance=1) = 50%, distance=2 = 25%, distance=3 = 12.5%, etc.
          const falloff = Math.pow(0.5, distance);
          const effect = GravityRules[neighborPiece.type].height * falloff;
          gravityEffect += effect;
        }
      }
    }
  }
  
  // Round gravity effect to nearest integer (no fractional sinking)
  height += Math.round(gravityEffect);
  
  return height;
}

/**
 * Check if a piece can capture another based on gravity rules
 * 
 * @param {Object} attacker - The attacking piece
 * @param {Object} target - The target piece
 * @param {number} attackerRow - Attacker's row
 * @param {number} attackerCol - Attacker's column
 * @param {number} targetRow - Target's row
 * @param {number} targetCol - Target's column
 * @param {Array} board - 2D array of pieces
 * @returns {boolean} True if capture is allowed
 */
export function canCapture(attacker, target, attackerRow, attackerCol, targetRow, targetCol, board) {
  if (!attacker || !target) return false;
  if (attacker.color === target.color) return false;
  
  const attackerHeight = calculateSquareHeight(attackerRow, attackerCol, board);
  const targetHeight = calculateSquareHeight(targetRow, targetCol, board);
  
  // Can only capture if attacker is at same height or higher (less negative)
  // This simulates needing escape velocity to climb out of gravity well
  return attackerHeight >= targetHeight;
}

/**
 * Get gravity influence data for visualization
 * 
 * @param {Array} board - 2D array of pieces
 * @returns {Array} 2D array of gravity influence values
 */
export function getGravityMap(board) {
  const gravityMap = [];
  
  for (let row = 0; row < BoardConfig.SIZE; row++) {
    gravityMap[row] = [];
    for (let col = 0; col < BoardConfig.SIZE; col++) {
      gravityMap[row][col] = calculateSquareHeight(row, col, board);
    }
  }
  
  return gravityMap;
}

export default {
  PieceType,
  Color,
  GravityRules,
  BoardConfig,
  VisualConfig,
  AIConfig,
  calculateSquareHeight,
  canCapture,
  getGravityMap,
};
