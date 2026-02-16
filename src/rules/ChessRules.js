import { PieceType, Color, BoardConfig, canCapture, calculateSquareHeight } from '../config/GravityRules.js';

/**
 * ChessRules Engine
 * 
 * Handles all chess move validation with GraviChess gravity modifications.
 * Standard chess rules + gravity-based capture restrictions.
 */
export class ChessRules {
  constructor() {
    this.enPassantTarget = null; // Square that can be captured via en passant
  }

  /**
   * Get all legal moves for a piece
   * @param {Piece} piece - The piece to get moves for
   * @param {Array} boardState - 2D array of pieces
   * @param {boolean} checkKingSafety - Whether to filter moves that leave king in check
   * @returns {Array} Array of {row, col, type: 'move'|'capture'}
   */
  getLegalMoves(piece, boardState, checkKingSafety = true) {
    let moves = [];
    
    switch (piece.type) {
      case PieceType.PAWN:
        moves = this.getPawnMoves(piece, boardState);
        break;
      case PieceType.KNIGHT:
        moves = this.getKnightMoves(piece, boardState);
        break;
      case PieceType.BISHOP:
        moves = this.getBishopMoves(piece, boardState);
        break;
      case PieceType.ROOK:
        moves = this.getRookMoves(piece, boardState);
        break;
      case PieceType.QUEEN:
        moves = this.getQueenMoves(piece, boardState);
        break;
      case PieceType.KING:
        moves = this.getKingMoves(piece, boardState);
        break;
    }
    
    // Filter moves that would leave king in check
    if (checkKingSafety) {
      moves = this.filterKingSafetyMoves(piece, moves, boardState);
    }
    
    return moves;
  }

  /**
   * Get all legal moves for a player
   */
  getAllLegalMoves(color, boardState) {
    const allMoves = [];
    
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const piece = boardState[row]?.[col];
        if (piece && piece.color === color) {
          const moves = this.getLegalMoves(piece, boardState);
          for (const move of moves) {
            allMoves.push({
              from: { row: piece.row, col: piece.col },
              to: { row: move.row, col: move.col },
              type: move.type,
              piece: piece,
            });
          }
        }
      }
    }
    
    return allMoves;
  }

  /**
   * Pawn movement
   */
  getPawnMoves(piece, boardState) {
    const moves = [];
    const direction = piece.color === Color.WHITE ? -1 : 1;
    const startRow = piece.color === Color.WHITE ? 6 : 1;
    
    // Forward move
    const forwardRow = piece.row + direction;
    if (this.isValidSquare(forwardRow, piece.col) && !boardState[forwardRow][piece.col]) {
      moves.push({ row: forwardRow, col: piece.col, type: 'move' });
      
      // Double move from start
      if (piece.row === startRow) {
        const doubleRow = piece.row + direction * 2;
        if (!boardState[doubleRow][piece.col]) {
          moves.push({ row: doubleRow, col: piece.col, type: 'move' });
        }
      }
    }
    
    // Captures (diagonal) - pawns can ALWAYS capture diagonally regardless of gravity
    for (const colOffset of [-1, 1]) {
      const captureCol = piece.col + colOffset;
      if (this.isValidSquare(forwardRow, captureCol)) {
        const target = boardState[forwardRow]?.[captureCol];
        
        // Debug logging
        console.log(`Pawn at (${piece.row},${piece.col}) checking capture at (${forwardRow},${captureCol}):`, 
          target ? `${target.color} ${target.type}` : 'empty');
        
        // Normal capture - pawns ignore gravity rules for diagonal captures
        if (target && target.color !== piece.color) {
          console.log(`  -> Adding capture move!`);
          moves.push({ row: forwardRow, col: captureCol, type: 'capture' });
        }
        
        // En passant
        if (this.enPassantTarget && 
            this.enPassantTarget.row === forwardRow && 
            this.enPassantTarget.col === captureCol) {
          const enemyPawn = boardState[piece.row][captureCol];
          if (enemyPawn) {
            moves.push({ row: forwardRow, col: captureCol, type: 'capture', enPassant: true });
          }
        }
      }
    }
    
    console.log(`Pawn moves before king safety filter:`, moves);
    return moves;
  }

  /**
   * Knight movement (L-shape)
   */
  getKnightMoves(piece, boardState) {
    const moves = [];
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    
    for (const [rowOff, colOff] of offsets) {
      const newRow = piece.row + rowOff;
      const newCol = piece.col + colOff;
      
      if (this.isValidSquare(newRow, newCol)) {
        const target = boardState[newRow][newCol];
        if (!target) {
          moves.push({ row: newRow, col: newCol, type: 'move' });
        } else if (target.color !== piece.color) {
          if (this.canCaptureWithGravity(piece, target, boardState)) {
            moves.push({ row: newRow, col: newCol, type: 'capture' });
          }
        }
      }
    }
    
    return moves;
  }

  /**
   * Bishop movement (diagonal)
   */
  getBishopMoves(piece, boardState) {
    return this.getSlidingMoves(piece, boardState, [
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ]);
  }

  /**
   * Rook movement (straight)
   */
  getRookMoves(piece, boardState) {
    return this.getSlidingMoves(piece, boardState, [
      [-1, 0], [1, 0], [0, -1], [0, 1]
    ]);
  }

  /**
   * Queen movement (diagonal + straight)
   */
  getQueenMoves(piece, boardState) {
    return this.getSlidingMoves(piece, boardState, [
      [-1, -1], [-1, 1], [1, -1], [1, 1],
      [-1, 0], [1, 0], [0, -1], [0, 1]
    ]);
  }

  /**
   * King movement (one square any direction)
   */
  getKingMoves(piece, boardState) {
    const moves = [];
    const offsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1]
    ];
    
    for (const [rowOff, colOff] of offsets) {
      const newRow = piece.row + rowOff;
      const newCol = piece.col + colOff;
      
      if (this.isValidSquare(newRow, newCol)) {
        const target = boardState[newRow][newCol];
        if (!target) {
          moves.push({ row: newRow, col: newCol, type: 'move' });
        } else if (target.color !== piece.color) {
          if (this.canCaptureWithGravity(piece, target, boardState)) {
            moves.push({ row: newRow, col: newCol, type: 'capture' });
          }
        }
      }
    }
    
    // Castling
    if (!piece.hasMoved && !this.isInCheck(piece.color, boardState)) {
      const castlingMoves = this.getCastlingMoves(piece, boardState);
      moves.push(...castlingMoves);
    }
    
    return moves;
  }

  /**
   * Get sliding piece moves (bishop, rook, queen)
   */
  getSlidingMoves(piece, boardState, directions) {
    const moves = [];
    
    for (const [rowDir, colDir] of directions) {
      let newRow = piece.row + rowDir;
      let newCol = piece.col + colDir;
      
      while (this.isValidSquare(newRow, newCol)) {
        const target = boardState[newRow][newCol];
        
        if (!target) {
          moves.push({ row: newRow, col: newCol, type: 'move' });
        } else {
          if (target.color !== piece.color) {
            if (this.canCaptureWithGravity(piece, target, boardState)) {
              moves.push({ row: newRow, col: newCol, type: 'capture' });
            }
          }
          break; // Blocked by a piece
        }
        
        newRow += rowDir;
        newCol += colDir;
      }
    }
    
    return moves;
  }

  /**
   * Get castling moves for king
   */
  getCastlingMoves(king, boardState) {
    const moves = [];
    const row = king.row;
    
    // Kingside castling
    const kingsideRook = boardState[row][7];
    if (kingsideRook && kingsideRook.type === PieceType.ROOK && !kingsideRook.hasMoved) {
      if (!boardState[row][5] && !boardState[row][6]) {
        // Check squares king passes through aren't attacked
        if (!this.isSquareAttacked(row, 5, king.color, boardState) &&
            !this.isSquareAttacked(row, 6, king.color, boardState)) {
          moves.push({ row: row, col: 6, type: 'castle', rookFrom: 7, rookTo: 5 });
        }
      }
    }
    
    // Queenside castling
    const queensideRook = boardState[row][0];
    if (queensideRook && queensideRook.type === PieceType.ROOK && !queensideRook.hasMoved) {
      if (!boardState[row][1] && !boardState[row][2] && !boardState[row][3]) {
        if (!this.isSquareAttacked(row, 2, king.color, boardState) &&
            !this.isSquareAttacked(row, 3, king.color, boardState)) {
          moves.push({ row: row, col: 2, type: 'castle', rookFrom: 0, rookTo: 3 });
        }
      }
    }
    
    return moves;
  }

  /**
   * Check if capture is allowed by gravity rules
   */
  canCaptureWithGravity(attacker, target, boardState) {
    return canCapture(
      attacker, target,
      attacker.row, attacker.col,
      target.row, target.col,
      boardState
    );
  }

  /**
   * Check if square is within board bounds
   */
  isValidSquare(row, col) {
    return row >= 0 && row < BoardConfig.SIZE && col >= 0 && col < BoardConfig.SIZE;
  }

  /**
   * Filter out moves that would leave own king in check
   */
  filterKingSafetyMoves(piece, moves, boardState) {
    const filtered = moves.filter(move => {
      const simulated = this.simulateMove(piece, move, boardState);
      const kingInCheck = this.isInCheck(piece.color, simulated);
      if (kingInCheck && move.type === 'capture') {
        console.log(`Move to (${move.row},${move.col}) filtered - would leave king in check`);
      }
      return !kingInCheck;
    });
    console.log(`Moves after king safety filter:`, filtered);
    return filtered;
  }

  /**
   * Simulate a move and return new board state
   */
  simulateMove(piece, move, boardState) {
    // Deep copy board state
    const newBoard = [];
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      newBoard[row] = [];
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const p = boardState[row][col];
        newBoard[row][col] = p ? p.clone() : null;
      }
    }
    
    // Execute move
    newBoard[move.row][move.col] = newBoard[piece.row][piece.col];
    newBoard[piece.row][piece.col] = null;
    
    if (newBoard[move.row][move.col]) {
      newBoard[move.row][move.col].row = move.row;
      newBoard[move.row][move.col].col = move.col;
    }
    
    // Handle en passant capture
    if (move.enPassant) {
      const capturedRow = piece.color === Color.WHITE ? move.row + 1 : move.row - 1;
      newBoard[capturedRow][move.col] = null;
    }
    
    // Handle castling
    if (move.type === 'castle') {
      const rook = newBoard[piece.row][move.rookFrom];
      newBoard[piece.row][move.rookTo] = rook;
      newBoard[piece.row][move.rookFrom] = null;
      if (rook) {
        rook.row = piece.row;
        rook.col = move.rookTo;
      }
    }
    
    return newBoard;
  }

  /**
   * Check if a color's king is in check
   */
  isInCheck(color, boardState) {
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
    
    if (kingRow < 0) return false; // No king found (shouldn't happen)
    
    return this.isSquareAttacked(kingRow, kingCol, color, boardState);
  }

  /**
   * Check if a square is attacked by enemy pieces
   * Uses direct attack pattern checks to avoid recursion
   */
  isSquareAttacked(row, col, defenderColor, boardState) {
    const attackerColor = defenderColor === Color.WHITE ? Color.BLACK : Color.WHITE;
    
    // Check pawn attacks
    const pawnDir = attackerColor === Color.WHITE ? 1 : -1;
    for (const dc of [-1, 1]) {
      const pr = row + pawnDir;
      const pc = col + dc;
      if (this.isValidSquare(pr, pc)) {
        const p = boardState[pr][pc];
        if (p && p.type === PieceType.PAWN && p.color === attackerColor) {
          return true;
        }
      }
    }
    
    // Check knight attacks
    const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of knightMoves) {
      const nr = row + dr, nc = col + dc;
      if (this.isValidSquare(nr, nc)) {
        const p = boardState[nr][nc];
        if (p && p.type === PieceType.KNIGHT && p.color === attackerColor) {
          return true;
        }
      }
    }
    
    // Check king attacks (one square)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const kr = row + dr, kc = col + dc;
        if (this.isValidSquare(kr, kc)) {
          const p = boardState[kr][kc];
          if (p && p.type === PieceType.KING && p.color === attackerColor) {
            return true;
          }
        }
      }
    }
    
    // Check sliding pieces (bishop, rook, queen)
    const directions = [
      [-1, 0], [1, 0], [0, -1], [0, 1],  // Rook/Queen
      [-1, -1], [-1, 1], [1, -1], [1, 1] // Bishop/Queen
    ];
    
    for (let i = 0; i < directions.length; i++) {
      const [dr, dc] = directions[i];
      const isDiagonal = i >= 4;
      let r = row + dr, c = col + dc;
      
      while (this.isValidSquare(r, c)) {
        const p = boardState[r][c];
        if (p) {
          if (p.color === attackerColor) {
            if (p.type === PieceType.QUEEN) return true;
            if (isDiagonal && p.type === PieceType.BISHOP) return true;
            if (!isDiagonal && p.type === PieceType.ROOK) return true;
          }
          break; // Blocked
        }
        r += dr;
        c += dc;
      }
    }
    
    return false;
  }

  /**
   * Check for checkmate
   */
  isCheckmate(color, boardState) {
    if (!this.isInCheck(color, boardState)) return false;
    
    const allMoves = this.getAllLegalMoves(color, boardState);
    return allMoves.length === 0;
  }

  /**
   * Check for stalemate
   */
  isStalemate(color, boardState) {
    if (this.isInCheck(color, boardState)) return false;
    
    const allMoves = this.getAllLegalMoves(color, boardState);
    return allMoves.length === 0;
  }

  /**
   * Set en passant target after pawn double move
   */
  setEnPassantTarget(piece, fromRow, toRow) {
    if (piece.type === PieceType.PAWN && Math.abs(toRow - fromRow) === 2) {
      const passantRow = piece.color === Color.WHITE ? toRow + 1 : toRow - 1;
      this.enPassantTarget = { row: passantRow, col: piece.col };
    } else {
      this.enPassantTarget = null;
    }
  }

  /**
   * Check if pawn should be promoted
   */
  shouldPromote(piece) {
    if (piece.type !== PieceType.PAWN) return false;
    return (piece.color === Color.WHITE && piece.row === 0) ||
           (piece.color === Color.BLACK && piece.row === 7);
  }
}

export default ChessRules;
