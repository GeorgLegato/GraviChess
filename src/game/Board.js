import * as THREE from 'three';
import { BoardConfig, VisualConfig, GravityRules, calculateSquareHeight } from '../config/GravityRules.js';

/**
 * Board Class
 * 
 * Handles the 3D chessboard rendering with dynamic height deformation
 * based on piece positions and gravity wells.
 */
export class Board {
  constructor(scene) {
    this.scene = scene;
    this.squares = []; // 2D array of square meshes
    this.gravityOverlays = []; // Blue concentric rings for gravity visualization
    this.highlightedSquares = []; // Currently highlighted squares
    this.group = new THREE.Group();
    this.targetHeights = []; // Target heights for smooth animation
    this.time = 0; // Animation time
    
    // Intro animation state
    this.introState = 'waiting'; // 'waiting', 'animating', 'done'
    this.introTimer = 0;
    this.introDelay = 3.0; // 3 seconds before animation starts
    this.introDuration = 3.0; // 3 seconds for animation
    this.introPattern = 'concentric'; // 'allAtOnce', 'fieldByField', 'concentric', 'random'
    this.introSquareDelays = []; // Per-square delay based on pattern
    
    this.createBoard();
    this.scene.add(this.group);
  }
  
  /**
   * Animation patterns for board intro
   */
  static IntroPatterns = {
    ALL_AT_ONCE: 'allAtOnce',
    FIELD_BY_FIELD: 'fieldByField',
    CONCENTRIC: 'concentric',
    RANDOM: 'random'
  };

  /**
   * Create depth number texture for column sides
   * Shows floor numbers 0-7 vertically on the walls
   * The column is 4 world units tall (8 levels × 0.5 HEIGHT_SCALE)
   * 
   * Column has BOTTOM fixed at y=-4, TOP at y=0 when at full height.
   * When scaled down, top moves down but bottom stays fixed.
   * 
   * BoxGeometry side face UVs: v=0 at bottom of face, v=1 at top
   * We want level 7 at bottom (v=0), level 0 at top (v=1)
   * 
   * With default flipY=true in CanvasTexture:
   * - Canvas top (y=0) maps to v=1 (geometry top)
   * - Canvas bottom maps to v=0 (geometry bottom)
   * So draw level 0 at canvas TOP, level 7 at canvas BOTTOM
   */
  createDepthNumberTexture() {
    const canvas = document.createElement('canvas');
    const levelHeight = 128; // pixels per level
    const numLevels = 8; // 8 levels (0-7)
    canvas.width = 128;
    canvas.height = levelHeight * numLevels;
    
    const ctx = canvas.getContext('2d');
    
    // Background - dark 
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw level 0 at canvas TOP (y=0), level 7 at canvas BOTTOM
    for (let level = 0; level < numLevels; level++) {
      const canvasY = level * levelHeight;
      
      // Alternate background for visibility
      if (level % 2 === 0) {
        ctx.fillStyle = '#444444';
      } else {
        ctx.fillStyle = '#3a3a3a';
      }
      ctx.fillRect(0, canvasY, canvas.width, levelHeight);
      
      // Draw numbers for all levels 0-7
      ctx.fillStyle = '#888888';
      ctx.fillText(level.toString(), canvas.width / 2, canvasY + levelHeight / 2);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping; // Allow vertical offset
    
    // Default flipY=true: canvas top = v=1 = geometry top
    // texture.flipY = true; // default
    
    texture.repeat.set(1, 1);
    texture.needsUpdate = true;
    
    return texture;
  }

  /**
   * Create the 8x8 chessboard
   */
  createBoard() {
    const size = BoardConfig.SIZE;
    const squareSize = BoardConfig.SQUARE_SIZE;
    const offset = (size * squareSize) / 2 - squareSize / 2;
    
    // Create depth number texture for side faces
    const depthTexture = this.createDepthNumberTexture();

    for (let row = 0; row < size; row++) {
      this.squares[row] = [];
      this.targetHeights[row] = [];
      
      for (let col = 0; col < size; col++) {
        // Create square geometry - tall columns (4 units high = 8 levels × 0.5 HEIGHT_SCALE)
        // Column BOTTOM is fixed, TOP shrinks down when sinking
        const columnHeight = 4;
        const geometry = new THREE.BoxGeometry(squareSize * 0.98, columnHeight, squareSize * 0.98);
        // Shift geometry so BOTTOM is at y=0 (column extends upward)
        geometry.translate(0, columnHeight / 2, 0);
        
        const isLight = (row + col) % 2 === 0;
        
        // Top face material (original chess colors)
        const topMaterial = new THREE.MeshStandardMaterial({
          color: isLight ? BoardConfig.LIGHT_COLOR : BoardConfig.DARK_COLOR,
          roughness: 0.5,
          metalness: 0.2,
        });
        
        // Plain side material (no numbers) for outer edges
        const plainSideMaterial = new THREE.MeshStandardMaterial({
          color: 0x3a3a3a,
          roughness: 0.7,
          metalness: 0.1,
        });
        
        // Side material with depth numbers - create unique materials for each side
        // so we can update texture offset independently
        // Only show numbers on inner faces, not outer board edges
        const sideMaterials = [];
        for (let i = 0; i < 4; i++) {
          // i=0: +X (right), i=1: -X (left), i=2: +Z (front), i=3: -Z (back)
          // Hide numbers on outer edges:
          // - +X (right) when col == 7
          // - -X (left) when col == 0
          // - +Z (front) when row == 7
          // - -Z (back) when row == 0
          const isOuterEdge = 
            (i === 0 && col === 7) ||
            (i === 1 && col === 0) ||
            (i === 2 && row === 7) ||
            (i === 3 && row === 0);
          
          if (isOuterEdge) {
            sideMaterials.push(plainSideMaterial);
          } else {
            const mat = new THREE.MeshStandardMaterial({
              map: depthTexture.clone(),
              roughness: 0.7,
              metalness: 0.1,
            });
            sideMaterials.push(mat);
          }
        }
        
        // Bottom material (dark)
        const bottomMaterial = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a,
          roughness: 0.8,
          metalness: 0.1,
        });
        
        // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
        // We want: sides = numbered, top (+Y) = chess color, bottom (-Y) = dark
        const materials = [
          sideMaterials[0], // +X (right)
          sideMaterials[1], // -X (left)
          topMaterial,      // +Y (top)
          bottomMaterial,   // -Y (bottom)
          sideMaterials[2], // +Z (front)
          sideMaterials[3], // -Z (back)
        ];

        const square = new THREE.Mesh(geometry, materials);
        // Position so BOTTOM is at y=-4 (fixed), TOP at y=0 at full height
        // Column extends upward from bottom
        square.position.set(
          col * squareSize - offset,
          -4, // Bottom of column at y=-4
          row * squareSize - offset
        );
        
        // Store board position for raycasting
        square.userData = {
          type: 'square',
          row: row,
          col: col,
          originalColor: topMaterial.color.getHex(),
          sideMaterials: sideMaterials, // Store for dynamic texture offset
        };
        
        square.receiveShadow = true;
        this.squares[row][col] = square;
        
        // All squares start at full height (scale 1.0 = 8 levels visible)
        // targetHeights stores the scale factor (1.0 = full, 0.125 = 1 level)
        this.targetHeights[row][col] = 1.0;
        
        square.scale.y = 1.0; // Full column height (4 units = 8 levels)
        this.group.add(square);

        // Create gravity overlay - concentric blue rings
        const ringGroup = new THREE.Group();
        const ringCount = 3;
        for (let r = 0; r < ringCount; r++) {
          const ringRadius = squareSize * 0.2 * (r + 1);
          const ringGeometry = new THREE.RingGeometry(ringRadius - 0.02, ringRadius, 32);
          const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
          });
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          ring.rotation.x = -Math.PI / 2; // Lay flat
          ring.userData.ringIndex = r;
          ringGroup.add(ring);
        }
        ringGroup.position.set(square.position.x, 0.05, square.position.z);
        ringGroup.userData = { row, col };
        
        if (!this.gravityOverlays[row]) this.gravityOverlays[row] = [];
        this.gravityOverlays[row][col] = ringGroup;
        this.group.add(ringGroup);
      }
    }
    
    // Initialize intro animation delays
    this.setupIntroPattern(this.introPattern);
  }
  
  /**
   * Set up intro animation pattern delays
   * @param {string} pattern - Pattern type
   */
  setupIntroPattern(pattern) {
    this.introPattern = pattern;
    this.introSquareDelays = [];
    
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      this.introSquareDelays[row] = [];
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        let delay = 0;
        
        switch (pattern) {
          case 'allAtOnce':
            delay = 0;
            break;
            
          case 'fieldByField':
            // Row by row, left to right
            delay = (row * 8 + col) / 64;
            break;
            
          case 'concentric':
            // From center outward
            const centerRow = 3.5;
            const centerCol = 3.5;
            const dist = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol));
            delay = dist / 4; // Max dist is ~3.5, normalize to 0-1
            break;
            
          case 'random':
            delay = Math.random();
            break;
        }
        
        this.introSquareDelays[row][col] = delay;
      }
    }
  }
  
  /**
   * Start the intro animation
   * @param {string} pattern - Optional pattern override
   */
  startIntroAnimation(pattern = null) {
    if (pattern) {
      this.setupIntroPattern(pattern);
    }
    this.introState = 'waiting';
    this.introTimer = 0;
    
    // Reset all squares to flat
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        this.squares[row][col].scale.y = 0.01;
      }
    }
  }

  /**
   * Update board heights based on piece positions
   * @param {Array} boardState - 2D array of pieces
   */
  updateHeights(boardState) {
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const height = calculateSquareHeight(row, col, boardState);
        // height is 0 to -7 (integer levels)
        // Convert to scale: full height (8 levels) = 1.0
        // Each level sunk reduces scale by 1/8
        // height 0 = scale 1.0 (full), height -7 = scale 1/8 (1 level showing)
        const levelsSunk = -height; // 0 to 7
        const scale = (8 - levelsSunk) / 8; // 1.0 to 0.125
        this.targetHeights[row][col] = Math.max(0.125, scale); // Minimum 1 level visible
      }
    }
  }

  /**
   * Animate board to target heights (call in render loop)
   * Uses scale.y for compression effect - bottom stays fixed
   */
  animate() {
    const dt = 0.016; // Approx 60fps timestep
    this.time += dt;
    
    // Handle intro animation
    if (this.introState !== 'done') {
      this.introTimer += dt;
      
      if (this.introState === 'waiting' && this.introTimer >= this.introDelay) {
        this.introState = 'animating';
        this.introTimer = 0;
      }
      
      if (this.introState === 'animating') {
        const progress = Math.min(this.introTimer / this.introDuration, 1.0);
        
        for (let row = 0; row < BoardConfig.SIZE; row++) {
          for (let col = 0; col < BoardConfig.SIZE; col++) {
            const square = this.squares[row][col];
            const squareDelay = this.introSquareDelays[row][col];
            
            // Calculate this square's progress (accounting for its delay)
            // Use 0.7 of duration for staggering, 0.3 for individual animation
            const staggerDuration = 0.7;
            const squareProgress = Math.max(0, Math.min(1, 
              (progress - squareDelay * staggerDuration) / (1 - staggerDuration * squareDelay)
            ));
            
            // Ease out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - squareProgress, 3);
            
            // Animate scale from 0 to 1 (columns grow up from bottom)
            square.scale.y = eased * 1.0;
            
            // Ring stays at top of column (bottom at -4, height = 4*scale)
            const ringGroup = this.gravityOverlays[row][col];
            ringGroup.position.y = -4 + 4 * square.scale.y + 0.05;
          }
        }
        
        if (progress >= 1.0) {
          this.introState = 'done';
        }
        
        return; // Skip normal animation during intro
      }
      
      // Still waiting, keep squares flat
      return;
    }
    
    // Normal animation after intro is done
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const square = this.squares[row][col];
        const targetScale = this.targetHeights[row][col];
        
        // Smooth lerp to target scale (sinking = shrinking column)
        square.scale.y += (targetScale - square.scale.y) * VisualConfig.ANIMATION_SPEED;
        
        // Calculate levels sunk from scale
        // scale 1.0 = 0 levels sunk, scale 0.125 = 7 levels sunk
        const levelsSunk = Math.round((1.0 - square.scale.y) * 8);
        
        // Update texture offset so the top of visible wall shows correct floor number
        // When sunk by N levels, offset texture so level N is at top
        // Texture has 8 levels, offset = levelsSunk / 8
        const textureOffset = levelsSunk / 8;
        
        // Update all side material texture offsets
        if (square.userData.sideMaterials) {
          for (const mat of square.userData.sideMaterials) {
            if (mat.map) {
              mat.map.offset.y = -textureOffset; // Negative to shift correct direction
            }
          }
        }
        
        // Ring stays at top of column (which moves with scale)
        // Column bottom at y=-4, top at y = -4 + 4*scale
        const ringGroup = this.gravityOverlays[row][col];
        ringGroup.position.y = -4 + 4 * square.scale.y + 0.05;
        
        // Animate ring opacity with pulsing effect
        ringGroup.children.forEach((ring, i) => {
          if (ring.material.opacity > 0 || ring.userData.baseOpacity > 0) {
            const baseOpacity = ring.userData.baseOpacity || 0;
            const pulse = Math.sin(this.time * 2 + i * 0.5) * 0.3 + 0.7;
            ring.material.opacity = baseOpacity * pulse;
          }
        });
      }
    }
  }

  /**
   * Update gravity well visualizations - blue concentric rings
   * @param {Array} boardState - 2D array of pieces
   */
  updateGravityOverlays(boardState) {
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        const ringGroup = this.gravityOverlays[row][col];
        const piece = boardState[row]?.[col];
        
        if (piece && piece.hasMoved) {
          const gravRadius = GravityRules[piece.type].gravityRadius;
          
          if (gravRadius > 0) {
            // Show gravity rings for pieces with gravity wells
            const baseOpacity = 0.15 + (gravRadius / 5) * 0.25;
            const scale = 0.8 + gravRadius * 0.4;
            ringGroup.scale.set(scale, 1, scale);
            
            ringGroup.children.forEach((ring, i) => {
              ring.userData.baseOpacity = baseOpacity * (1 - i * 0.2);
            });
          } else {
            ringGroup.children.forEach(ring => {
              ring.userData.baseOpacity = 0;
              ring.material.opacity = 0;
            });
          }
        } else {
          ringGroup.children.forEach(ring => {
            ring.userData.baseOpacity = 0;
            ring.material.opacity = 0;
          });
        }
      }
    }
  }

  /**
   * Highlight a square
   * @param {number} row 
   * @param {number} col 
   * @param {string} type - 'selected', 'move', 'capture', 'enemy', 'enemyMove', 'enemyCapture'
   */
  highlightSquare(row, col, type = 'move') {
    const square = this.squares[row]?.[col];
    if (!square) return;

    let color;
    switch (type) {
      case 'selected':
        color = BoardConfig.HIGHLIGHT_COLOR;
        break;
      case 'capture':
        color = BoardConfig.CAPTURE_HIGHLIGHT_COLOR;
        break;
      case 'enemy':
        color = BoardConfig.ENEMY_HIGHLIGHT_COLOR;
        break;
      case 'enemyMove':
        color = BoardConfig.ENEMY_MOVE_COLOR;
        break;
      case 'enemyCapture':
        color = BoardConfig.ENEMY_CAPTURE_COLOR;
        break;
      case 'move':
      default:
        color = BoardConfig.MOVE_HIGHLIGHT_COLOR;
    }

    // Apply to top material (index 2 in material array)
    const topMaterial = Array.isArray(square.material) ? square.material[2] : square.material;
    topMaterial.emissive.setHex(color);
    topMaterial.emissiveIntensity = 0.5;
    this.highlightedSquares.push({ row, col });
  }

  /**
   * Clear all highlights
   */
  clearHighlights() {
    for (const { row, col } of this.highlightedSquares) {
      const square = this.squares[row]?.[col];
      if (square) {
        // Apply to top material (index 2 in material array)
        const topMaterial = Array.isArray(square.material) ? square.material[2] : square.material;
        topMaterial.emissive.setHex(0x000000);
        topMaterial.emissiveIntensity = 0;
      }
    }
    this.highlightedSquares = [];
  }

  /**
   * Get world position for a board square (top surface)
   * @param {number} row 
   * @param {number} col 
   * @returns {THREE.Vector3}
   */
  getSquarePosition(row, col) {
    const square = this.squares[row]?.[col];
    if (!square) return new THREE.Vector3();
    // Column bottom at y=-4, top at y = -4 + 4*scale
    const topY = -4 + 4 * square.scale.y;
    return new THREE.Vector3(square.position.x, topY, square.position.z);
  }

  /**
   * Get all square meshes for raycasting
   * @returns {Array<THREE.Mesh>}
   */
  getSquareMeshes() {
    const meshes = [];
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        meshes.push(this.squares[row][col]);
      }
    }
    return meshes;
  }

  /**
   * Reset all squares to flat (full height)
   */
  resetHeights() {
    for (let row = 0; row < BoardConfig.SIZE; row++) {
      for (let col = 0; col < BoardConfig.SIZE; col++) {
        this.squares[row][col].scale.y = 1.0;
        this.targetHeights[row][col] = 1.0;
      }
    }
    // Clear gravity overlays
    this.updateGravityOverlays([]);
  }

  /**
   * Dispose of all board resources
   */
  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.scene.remove(this.group);
  }
}

export default Board;
