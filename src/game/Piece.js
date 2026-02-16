import * as THREE from 'three';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { PieceType, Color, GravityRules, VisualConfig, BoardConfig } from '../config/GravityRules.js';

/**
 * Piece Class
 * 
 * Represents a chess piece with gravity properties and 3D mesh.
 */
export class Piece {
  constructor(type, color, row, col, mesh = null) {
    this.type = type;
    this.color = color;
    this.row = row;
    this.col = col;
    this.mesh = mesh;
    this.hasMoved = false; // For castling and pawn double move
    
    // Gravity properties from rules
    this.height = GravityRules[type].height;
    this.gravityRadius = GravityRules[type].gravityRadius;
    this.value = GravityRules[type].value;
  }

  /**
   * Clone the piece (without mesh)
   */
  clone() {
    const clone = new Piece(this.type, this.color, this.row, this.col);
    clone.hasMoved = this.hasMoved;
    return clone;
  }

  /**
   * Update piece position
   */
  setPosition(row, col) {
    this.row = row;
    this.col = col;
    this.hasMoved = true;
  }

  /**
   * Get piece info for debugging
   */
  toString() {
    return `${this.color} ${this.type} at (${this.row}, ${this.col})`;
  }
}

/**
 * PieceFactory
 * 
 * Creates and manages 3D piece meshes using procedural geometry or loaded 3DS models.
 */
export class PieceFactory {
  constructor(scene, pieceSet = 'procedural') {
    this.scene = scene;
    this.pieceSet = pieceSet;
    this.pieceGroup = new THREE.Group();
    this.scene.add(this.pieceGroup);
    
    // Loaded 3DS model templates (cloned for each piece)
    this.loadedModels = {};
    this.modelsReady = false;
    
    // Materials for white and black pieces - solid metal look
    this.whiteMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.2,
      emissive: 0x333333,
      emissiveIntensity: 0.3,
      envMapIntensity: 1.0,
    });
    
    this.blackMaterial = new THREE.MeshStandardMaterial({
      color: 0x881111, // Dark red for visibility
      roughness: 0.2,
      metalness: 0.7,
      emissive: 0x220000,
      emissiveIntensity: 0.2,
      envMapIntensity: 1.0,
    });
  }
  
  /**
   * Initialize the piece factory (load 3DS models if needed)
   */
  async init() {
    if (this.pieceSet === '3ds') {
      await this.load3DSModels();
    }
    this.modelsReady = true;
  }
  
  /**
   * Load 3DS chess set models
   */
  async load3DSModels() {
    return new Promise((resolve, reject) => {
      const loader = new TDSLoader();
      
      loader.load(
        '/models/chess-set.3ds',
        (object) => {
          console.log('3DS model loaded:', object);
          
          // Parse the loaded model to find individual pieces
          // 3DS files typically have named objects for each piece
          this.parse3DSModel(object);
          resolve();
        },
        (progress) => {
          console.log('Loading 3DS:', (progress.loaded / progress.total * 100).toFixed(1) + '%');
        },
        (error) => {
          console.error('Error loading 3DS model:', error);
          // Fall back to procedural
          this.pieceSet = 'procedural';
          resolve();
        }
      );
    });
  }
  
  /**
   * Parse 3DS model to extract individual piece meshes
   */
  parse3DSModel(object) {
    // 3DS models are often Z-up, rotate to Y-up
    object.rotation.x = -Math.PI / 2;
    object.updateMatrixWorld(true);
    
    // Log all object names to understand structure
    const allMeshes = [];
    object.traverse((child) => {
      if (child.isMesh) {
        console.log('Found mesh:', child.name, 'pos:', child.position);
        allMeshes.push(child);
      }
    });
    
    // Common naming patterns in chess 3DS files (more inclusive)
    const piecePatterns = {
      [PieceType.PAWN]: /pawn|bauer|pion|p[0-9]/i,
      [PieceType.ROOK]: /rook|turm|tower|castle|tour|rok/i,
      [PieceType.KNIGHT]: /knight|springer|horse|cavalier|cavallo|pferd/i,
      [PieceType.BISHOP]: /bishop|läufer|laeufer|fou|alfil|loper/i,
      [PieceType.QUEEN]: /queen|dame|königin|reine|regina|dama/i,
      [PieceType.KING]: /king|könig|roi|re[^i]/i,
    };
    
    // Try to find pieces by name patterns
    for (const child of allMeshes) {
      const name = child.name.toLowerCase();
      
      for (const [pieceType, pattern] of Object.entries(piecePatterns)) {
        if (pattern.test(name)) {
          if (!this.loadedModels[pieceType]) {
            // Create a group to hold the mesh with proper transforms
            const group = new THREE.Group();
            const clone = child.clone();
            
            // Apply parent transforms
            clone.applyMatrix4(child.matrixWorld);
            clone.position.set(0, 0, 0);
            clone.rotation.set(0, 0, 0);
            clone.scale.set(1, 1, 1);
            
            // Get geometry and recompute
            if (clone.geometry) {
              clone.geometry = clone.geometry.clone();
              clone.geometry.applyMatrix4(child.matrixWorld);
              clone.geometry.center();
              clone.geometry.computeBoundingBox();
              
              // Move bottom to y=0
              const box = clone.geometry.boundingBox;
              clone.geometry.translate(0, -box.min.y, 0);
            }
            
            group.add(clone);
            this.loadedModels[pieceType] = group;
            console.log(`Mapped ${pieceType} to mesh: ${child.name}`);
          }
        }
      }
    }
    
    // Check which piece types are still missing
    // Order by typical height: King > Queen > Knight > Bishop > Rook > Pawn
    const allPieceTypes = [PieceType.KING, PieceType.QUEEN, PieceType.KNIGHT, 
                           PieceType.BISHOP, PieceType.ROOK, PieceType.PAWN];
    const missingTypes = allPieceTypes.filter(t => !this.loadedModels[t]);
    
    console.log('Loaded pieces:', Object.keys(this.loadedModels));
    console.log('Missing pieces:', missingTypes);
    
    // If we have missing pieces, try to fill them from unused meshes
    if (missingTypes.length > 0) {
      console.log('Filling missing pieces from unused meshes...');
      
      // Find meshes that weren't mapped yet
      const usedMeshNames = new Set();
      for (const pieceType in this.loadedModels) {
        // Track which meshes we've used
        this.loadedModels[pieceType].traverse((child) => {
          if (child.isMesh && child.name) {
            usedMeshNames.add(child.name);
          }
        });
      }
      
      const unusedMeshes = allMeshes.filter(m => !usedMeshNames.has(m.name));
      
      // Sort unused meshes by bounding box height (tallest first)
      const meshesWithSize = unusedMeshes.map(mesh => {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        return { mesh, height: size.y };
      }).sort((a, b) => b.height - a.height);
      
      // Assign unused meshes to missing piece types (by relative size order)
      for (let i = 0; i < Math.min(meshesWithSize.length, missingTypes.length); i++) {
        const group = new THREE.Group();
        const clone = meshesWithSize[i].mesh.clone();
        
        // Apply world matrix and reset
        if (clone.geometry) {
          clone.geometry = clone.geometry.clone();
          clone.geometry.applyMatrix4(meshesWithSize[i].mesh.matrixWorld);
          clone.geometry.center();
          clone.geometry.computeBoundingBox();
          const box = clone.geometry.boundingBox;
          clone.geometry.translate(0, -box.min.y, 0);
        }
        
        clone.position.set(0, 0, 0);
        clone.rotation.set(0, 0, 0);
        clone.scale.set(1, 1, 1);
        
        group.add(clone);
        this.loadedModels[missingTypes[i]] = group;
        console.log(`Auto-filled ${missingTypes[i]} with mesh: ${meshesWithSize[i].mesh.name}`);
      }
    }
    
    // Normalize all loaded models
    for (const pieceType in this.loadedModels) {
      this.normalizeModel(this.loadedModels[pieceType], pieceType);
    }
    
    console.log('Final loaded pieces:', Object.keys(this.loadedModels));
  }
  
  /**
   * Normalize a piece model - scale to standard size
   */
  normalizeModel(group, pieceType) {
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    
    // Scale based on height to fit standard piece size
    // Set B (3DS) - adjusted for proper board fit
    let targetHeight = 1.25;
    
    // Pawns are smaller
    if (pieceType === PieceType.PAWN) {
      targetHeight = 1.25 * 0.75; // 75% of officer size
    }
    
    const scale = targetHeight / size.y;
    group.scale.set(scale, scale, scale);
  }
  
  /**
   * Normalize mesh - center it and scale appropriately (legacy)
   */
  normalizeMesh(mesh) {
    // Compute bounding box
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Center the mesh at origin (horizontally), bottom at y=0
    mesh.position.sub(center);
    mesh.position.y += size.y / 2;
    
    // Scale to fit in standard size
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 2; // Standard piece height
    const scale = targetSize / maxDim;
    mesh.scale.multiplyScalar(scale);
  }

  /**
   * Create a chess piece mesh - uses loaded 3DS models or procedural geometry
   * Returns a Group containing all the piece parts
   */
  createPieceMesh(type, color) {
    const material = color === Color.WHITE ? 
      this.whiteMaterial.clone() : 
      this.blackMaterial.clone();
    
    // Different scales for each piece set
    const baseScale = VisualConfig.PIECE_SCALE;
    let group;
    let scale;
    
    // Try to use loaded 3DS model first
    if (this.pieceSet === '3ds' && this.loadedModels[type]) {
      group = this.loadedModels[type].clone();
      scale = baseScale; // Set B uses base scale
      
      // Apply material to all meshes in the model
      group.traverse((child) => {
        if (child.isMesh) {
          child.material = material;
        }
      });
    } else {
      // Fall back to procedural geometry
      scale = baseScale * 1.66; // Set A is bigger (was 1.33, now +25% more)
      
      switch (type) {
        case PieceType.PAWN:
          group = this.createPawnGroup(material);
          break;
        case PieceType.KNIGHT:
          group = this.createKnightGroup(material);
          break;
        case PieceType.BISHOP:
          group = this.createBishopGroup(material);
          break;
        case PieceType.ROOK:
          group = this.createRookGroup(material);
          break;
        case PieceType.QUEEN:
          group = this.createQueenGroup(material);
          break;
        case PieceType.KING:
          group = this.createKingGroup(material);
          break;
        default:
          group = new THREE.Group();
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), material);
          group.add(sphere);
      }
    }
    
    // Only apply scale to procedural pieces - 3DS models are pre-normalized
    if (this.pieceSet !== '3ds' || !this.loadedModels[type]) {
      group.scale.set(scale, scale, scale);
    }
    
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    return group;
  }

  createPawnGroup(material) {
    const group = new THREE.Group();
    
    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.15, 16), material);
    base.position.y = 0.075;
    group.add(base);
    
    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.4, 16), material);
    body.position.y = 0.35;
    group.add(body);
    
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), material);
    head.position.y = 0.65;
    group.add(head);
    
    return group;
  }

  createRookGroup(material) {
    const group = new THREE.Group();
    
    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.15, 16), material);
    base.position.y = 0.075;
    group.add(base);
    
    // Tower body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.7, 16), material);
    body.position.y = 0.5;
    group.add(body);
    
    // Top platform
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.15, 16), material);
    top.position.y = 0.9;
    group.add(top);
    
    // Battlements
    for (let i = 0; i < 4; i++) {
      const battlement = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.12), material);
      const angle = (i / 4) * Math.PI * 2;
      battlement.position.set(Math.cos(angle) * 0.25, 1.05, Math.sin(angle) * 0.25);
      group.add(battlement);
    }
    
    return group;
  }

  createKnightGroup(material) {
    const group = new THREE.Group();
    
    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.15, 16), material);
    base.position.y = 0.075;
    group.add(base);
    
    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.4, 16), material);
    body.position.y = 0.35;
    group.add(body);
    
    // Head (elongated for horse shape)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.4), material);
    head.position.set(0.1, 0.75, 0);
    head.rotation.z = -0.3;
    group.add(head);
    
    // Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.25), material);
    snout.position.set(0.3, 0.65, 0);
    group.add(snout);
    
    // Ears
    const ear1 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 8), material);
    ear1.position.set(0, 1.05, 0.1);
    group.add(ear1);
    
    const ear2 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 8), material);
    ear2.position.set(0, 1.05, -0.1);
    group.add(ear2);
    
    return group;
  }

  createBishopGroup(material) {
    const group = new THREE.Group();
    
    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.15, 16), material);
    base.position.y = 0.075;
    group.add(base);
    
    // Body (tapered)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, 0.7, 16), material);
    body.position.y = 0.5;
    group.add(body);
    
    // Mitre (bishop's hat)
    const mitre = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), material);
    mitre.scale.y = 1.5;
    mitre.position.y = 0.95;
    group.add(mitre);
    
    // Top ball
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), material);
    top.position.y = 1.2;
    group.add(top);
    
    return group;
  }

  createQueenGroup(material) {
    const group = new THREE.Group();
    
    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.15, 16), material);
    base.position.y = 0.075;
    group.add(base);
    
    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 0.8, 16), material);
    body.position.y = 0.55;
    group.add(body);
    
    // Crown base
    const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.15, 16), material);
    crownBase.position.y = 1.0;
    group.add(crownBase);
    
    // Crown points
    for (let i = 0; i < 8; i++) {
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 8), material);
      const angle = (i / 8) * Math.PI * 2;
      point.position.set(Math.cos(angle) * 0.18, 1.2, Math.sin(angle) * 0.18);
      group.add(point);
    }
    
    // Top orb
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), material);
    orb.position.y = 1.35;
    group.add(orb);
    
    return group;
  }

  createKingGroup(material) {
    const group = new THREE.Group();
    
    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.15, 16), material);
    base.position.y = 0.075;
    group.add(base);
    
    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 0.85, 16), material);
    body.position.y = 0.6;
    group.add(body);
    
    // Crown base
    const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.15, 16), material);
    crownBase.position.y = 1.1;
    group.add(crownBase);
    
    // Cross (King's symbol)
    const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), material);
    crossVertical.position.y = 1.4;
    group.add(crossVertical);
    
    const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.08), material);
    crossHorizontal.position.y = 1.45;
    group.add(crossHorizontal);
    
    return group;
  }

  /**
   * Create a Piece instance with mesh at given position
   */
  createPiece(type, color, row, col, board) {
    const mesh = this.createPieceMesh(type, color);
    const pos = board.getSquarePosition(row, col);
    mesh.position.set(pos.x, pos.y + 0.05, pos.z);
    
    // Rotate knights 180° for Set B (3DS models face backwards)
    if (type === PieceType.KNIGHT && this.pieceSet === '3ds') {
      mesh.rotation.y = Math.PI;
    }
    
    mesh.userData = {
      type: 'piece',
      pieceType: type,
      color: color,
      row: row,
      col: col,
    };
    
    this.pieceGroup.add(mesh);
    
    const piece = new Piece(type, color, row, col, mesh);
    return piece;
  }

  /**
   * Update piece mesh position to sit on top of column
   */
  updatePieceMeshPosition(piece, board) {
    if (!piece.mesh) return;
    
    const pos = board.getSquarePosition(piece.row, piece.col);
    
    piece.mesh.position.x = pos.x;
    piece.mesh.position.z = pos.z;
    piece.mesh.position.y = pos.y; // Sit directly on column top
    
    // Update mesh userData
    piece.mesh.userData.row = piece.row;
    piece.mesh.userData.col = piece.col;
  }

  /**
   * Remove piece mesh from scene
   */
  removePieceMesh(piece) {
    if (piece.mesh) {
      this.pieceGroup.remove(piece.mesh);
      // Dispose all children geometries and materials
      piece.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      piece.mesh = null;
    }
  }

  /**
   * Get all piece meshes for raycasting
   */
  getPieceMeshes() {
    const meshes = [];
    this.pieceGroup.traverse((child) => {
      if (child.isMesh) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /**
   * Highlight a piece as selected
   */
  highlightPiece(piece) {
    if (piece.mesh) {
      piece.mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.emissive.setHex(BoardConfig.HIGHLIGHT_COLOR);
          child.material.emissiveIntensity = 0.4;
        }
      });
    }
  }

  /**
   * Remove highlight from piece
   */
  unhighlightPiece(piece) {
    if (piece.mesh) {
      piece.mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }
      });
    }
  }

  /**
   * Dispose all resources
   */
  dispose() {
    this.pieceGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    this.scene.remove(this.pieceGroup);
  }
}

export default { Piece, PieceFactory };
