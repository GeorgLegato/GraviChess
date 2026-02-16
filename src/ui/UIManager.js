import * as THREE from 'three';
import { Color, PieceType } from '../config/GravityRules.js';

/**
 * UIManager
 * 
 * Manages HTML UI elements like start screen, turn indicator, and game status.
 */
export class UIManager {
  constructor() {
    // Cache DOM elements
    this.startScreen = document.getElementById('start-screen');
    this.startButton = document.getElementById('start-button');
    this.tutorialButton = document.getElementById('tutorial-button');
    this.playerColorSelect = document.getElementById('player-color');
    this.pieceSetInput = document.getElementById('piece-set');
    this.pieceSetOptions = document.querySelectorAll('.piece-set-option');
    this.gameUI = document.getElementById('game-ui');
    this.turnIndicator = document.getElementById('current-turn');
    this.gameStatus = document.getElementById('game-status');
    this.restartButton = document.getElementById('restart-button');
    this.tutorialScreen = document.getElementById('tutorial-screen');
    
    // King preview renderers
    this.kingPreviewA = null;
    this.kingPreviewB = null;
    
    // Callbacks
    this.onStartGame = null;
    this.onRestartGame = null;
    this.onStartTutorial = null;
    
    // Load saved piece set preference
    this.loadPieceSetPreference();
    
    this.setupEventListeners();
    this.initKingPreviews();
  }

  /**
   * Load piece set preference from localStorage
   */
  loadPieceSetPreference() {
    const saved = localStorage.getItem('gravichess-pieceSet');
    if (saved && (saved === 'procedural' || saved === '3ds')) {
      if (this.pieceSetInput) {
        this.pieceSetInput.value = saved;
      }
      // Update visual selection
      this.pieceSetOptions.forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.set === saved);
      });
    }
  }

  /**
   * Save piece set preference to localStorage
   */
  savePieceSetPreference(value) {
    localStorage.setItem('gravichess-pieceSet', value);
  }

  /**
   * Set up UI event listeners
   */
  setupEventListeners() {
    this.startButton?.addEventListener('click', () => {
      const color = this.playerColorSelect?.value === 'black' ? Color.BLACK : Color.WHITE;
      const pieceSet = this.pieceSetInput?.value || 'procedural';
      this.hideStartScreen();
      this.showGameUI();
      if (this.onStartGame) {
        this.onStartGame(color, pieceSet);
      }
    });

    this.tutorialButton?.addEventListener('click', () => {
      const pieceSet = this.pieceSetInput?.value || 'procedural';
      this.hideStartScreen();
      if (this.onStartTutorial) {
        this.onStartTutorial(pieceSet);
      }
    });

    this.restartButton?.addEventListener('click', () => {
      if (this.onRestartGame) {
        this.onRestartGame();
      }
    });

    // Piece set option click handlers
    this.pieceSetOptions.forEach(option => {
      option.addEventListener('click', () => {
        const setName = option.dataset.set;
        
        // Update selection
        this.pieceSetOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // Update hidden input
        if (this.pieceSetInput) {
          this.pieceSetInput.value = setName;
        }
        
        // Save preference
        this.savePieceSetPreference(setName);
      });
    });
  }

  /**
   * Initialize King preview canvases with 3D renders
   */
  initKingPreviews() {
    const canvasA = document.getElementById('king-preview-a');
    const canvasB = document.getElementById('king-preview-b');
    
    if (canvasA) {
      this.kingPreviewA = this.createKingPreview(canvasA, 'procedural');
    }
    if (canvasB) {
      this.kingPreviewB = this.createKingPreview(canvasB, '3ds');
    }
  }

  /**
   * Create a 3D King preview renderer for a canvas
   */
  createKingPreview(canvas, pieceSet) {
    const width = canvas.width;
    const height = canvas.height;
    
    // Create mini scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent
    
    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 2, 4);
    camera.lookAt(0, 1, 0);
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Lighting
    const ambient = new THREE.AmbientLight(0x606080, 0.6);
    scene.add(ambient);
    
    const directional = new THREE.DirectionalLight(0xffffff, 1.0);
    directional.position.set(2, 4, 2);
    scene.add(directional);
    
    const rim = new THREE.DirectionalLight(0x7b2ff7, 0.4);
    rim.position.set(-2, 2, -2);
    scene.add(rim);
    
    // Create King mesh based on piece set
    let kingMesh;
    
    if (pieceSet === 'procedural') {
      kingMesh = this.createProceduralKing();
    } else {
      // For 3ds, also show procedural initially, but styled differently
      // The actual 3ds model would need async loading
      kingMesh = this.createProceduralKing();
      // Make it look slightly different to indicate it's set B
      kingMesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.metalness = 0.8;
          child.material.roughness = 0.1;
        }
      });
    }
    
    scene.add(kingMesh);
    
    // Animation state
    const state = {
      scene,
      camera,
      renderer,
      kingMesh,
      rotation: 0,
    };
    
    // Animate
    const animate = () => {
      requestAnimationFrame(animate);
      state.rotation += 0.01;
      kingMesh.rotation.y = state.rotation;
      renderer.render(scene, camera);
    };
    animate();
    
    return state;
  }

  /**
   * Create a procedural King mesh for preview
   */
  createProceduralKing() {
    const group = new THREE.Group();
    
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.3,
      emissive: 0x333333,
      emissiveIntensity: 0.2,
    });
    
    // Base
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16);
    const base = new THREE.Mesh(baseGeo, material);
    base.position.y = 0.1;
    group.add(base);
    
    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.2, 16);
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.y = 0.8;
    group.add(body);
    
    // Collar
    const collarGeo = new THREE.CylinderGeometry(0.4, 0.35, 0.15, 16);
    const collar = new THREE.Mesh(collarGeo, material);
    collar.position.y = 1.45;
    group.add(collar);
    
    // Head
    const headGeo = new THREE.SphereGeometry(0.3, 16, 12);
    const head = new THREE.Mesh(headGeo, material);
    head.position.y = 1.7;
    group.add(head);
    
    // Cross vertical
    const crossVGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
    const crossV = new THREE.Mesh(crossVGeo, material);
    crossV.position.y = 2.1;
    group.add(crossV);
    
    // Cross horizontal
    const crossHGeo = new THREE.BoxGeometry(0.25, 0.08, 0.08);
    const crossH = new THREE.Mesh(crossHGeo, material);
    crossH.position.y = 2.15;
    group.add(crossH);
    
    return group;
  }

  /**
   * Hide start screen
   */
  hideStartScreen() {
    if (this.startScreen) {
      this.startScreen.classList.add('hidden');
    }
  }

  /**
   * Show start screen
   */
  showStartScreen() {
    if (this.startScreen) {
      this.startScreen.classList.remove('hidden');
    }
    this.hideGameUI();
    this.hideTutorialScreen();
  }

  /**
   * Show tutorial screen
   */
  showTutorialScreen() {
    if (this.tutorialScreen) {
      this.tutorialScreen.classList.remove('hidden');
    }
  }

  /**
   * Hide tutorial screen
   */
  hideTutorialScreen() {
    if (this.tutorialScreen) {
      this.tutorialScreen.classList.add('hidden');
    }
  }

  /**
   * Show game UI
   */
  showGameUI() {
    if (this.gameUI) {
      this.gameUI.classList.remove('hidden');
    }
  }

  /**
   * Hide game UI
   */
  hideGameUI() {
    if (this.gameUI) {
      this.gameUI.classList.add('hidden');
    }
  }

  /**
   * Update turn indicator
   */
  updateTurn(color, isAIThinking = false) {
    if (this.turnIndicator) {
      let text = color === Color.WHITE ? "White's Turn" : "Black's Turn";
      if (isAIThinking) {
        text += ' (AI thinking...)';
      }
      this.turnIndicator.textContent = text;
    }
  }

  /**
   * Show game over status
   */
  showGameOver(type, winner) {
    if (this.gameStatus) {
      let message = '';
      
      if (type === 'checkmate') {
        const winnerName = winner === Color.WHITE ? 'White' : 'Black';
        message = `Checkmate! ${winnerName} wins! 🎉`;
      } else if (type === 'stalemate') {
        message = "Stalemate! It's a draw! 🤝";
      }
      
      this.gameStatus.textContent = message;
      this.gameStatus.classList.add('visible');
    }
  }

  /**
   * Hide game status
   */
  hideGameStatus() {
    if (this.gameStatus) {
      this.gameStatus.classList.remove('visible');
    }
  }

  /**
   * Show check warning
   */
  showCheck() {
    if (this.gameStatus) {
      this.gameStatus.textContent = 'Check! ⚠️';
      this.gameStatus.classList.add('visible');
      
      // Auto-hide after 2 seconds
      setTimeout(() => {
        if (this.gameStatus.textContent === 'Check! ⚠️') {
          this.gameStatus.classList.remove('visible');
        }
      }, 2000);
    }
  }
}

export default UIManager;
