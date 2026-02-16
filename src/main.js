import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Color, BoardConfig } from './config/GravityRules.js';
import { Game } from './game/Game.js';
import { InputHandler } from './ui/InputHandler.js';
import { UIManager } from './ui/UIManager.js';
import { TutorialManager } from './ui/TutorialManager.js';
import { soundManager } from './audio/SoundManager.js';

/**
 * GraviChess Main Entry Point
 * 
 * Sets up Three.js scene, camera, lighting, and coordinates all game components.
 */
class GraviChessApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    
    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    // Game components
    this.game = null;
    this.inputHandler = null;
    this.uiManager = null;
    this.tutorialManager = null;
    
    this.isRunning = false;
    this.isTutorialMode = false;
    
    this.init();
  }

  /**
   * Initialize the application
   */
  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLighting();
    this.setupControls();
    this.setupUI();
    
    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Start render loop
    this.animate();
  }

  /**
   * Set up Three.js scene
   */
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050510);
    
    // Add subtle fog for depth (extended range to not clip stars)
    this.scene.fog = new THREE.Fog(0x050510, 20, 60);
    
    // Create starfield background
    this.createStarfield();
  }
  
  /**
   * Create 3D starfield background with movement
   */
  createStarfield() {
    this.starCount = 1200;
    this.starSpeed = 0.03; // Movement speed towards white side
    this.starBounds = { minZ: -50, maxZ: 50, radius: 40 };
    
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(this.starCount * 3);
    
    for (let i = 0; i < this.starCount; i++) {
      this.initStarPosition(starPositions, i, true);
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    });
    
    this.starfield = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starfield);
  }
  
  /**
   * Initialize or respawn a star position
   */
  initStarPosition(positions, index, randomZ = false) {
    const i = index * 3;
    // Random position in a cylinder around the board
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * this.starBounds.radius;
    const height = (Math.random() - 0.5) * 60;
    
    positions[i] = Math.cos(angle) * radius;     // X
    positions[i + 1] = height;                    // Y (up/down)
    positions[i + 2] = randomZ 
      ? (Math.random() - 0.5) * 100              // Random Z for initial spawn
      : this.starBounds.minZ;                    // Start at black side for respawn
  }
  
  /**
   * Update starfield animation - move stars from black to white side
   */
  updateStarfield() {
    if (!this.starfield) return;
    
    const positions = this.starfield.geometry.attributes.position.array;
    
    for (let i = 0; i < this.starCount; i++) {
      const idx = i * 3 + 2; // Z component
      positions[idx] += this.starSpeed;
      
      // Respawn star at black side when it passes white side
      if (positions[idx] > this.starBounds.maxZ) {
        this.initStarPosition(positions, i, false);
      }
    }
    
    this.starfield.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Set up camera
   */
  setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 10, 10);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Set up WebGL renderer
   */
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * Set up scene lighting
   */
  setupLighting() {
    // Ambient light for base illumination
    const ambient = new THREE.AmbientLight(0x404070, 0.5);
    this.scene.add(ambient);
    
    // Main directional light (sun-like)
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(5, 15, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -10;
    mainLight.shadow.camera.right = 10;
    mainLight.shadow.camera.top = 10;
    mainLight.shadow.camera.bottom = -10;
    mainLight.shadow.bias = -0.0001;
    this.scene.add(mainLight);
    
    // Fill light from the opposite side
    const fillLight = new THREE.DirectionalLight(0x7b2ff7, 0.3);
    fillLight.position.set(-5, 10, -5);
    this.scene.add(fillLight);
    
    // Rim light for dramatic effect
    const rimLight = new THREE.DirectionalLight(0xf107a3, 0.2);
    rimLight.position.set(0, 5, -10);
    this.scene.add(rimLight);
    
    // Add some point lights for ambiance
    const pointLight1 = new THREE.PointLight(0x00d4ff, 0.5, 20);
    pointLight1.position.set(-8, 3, 0);
    this.scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0xf107a3, 0.5, 20);
    pointLight2.position.set(8, 3, 0);
    this.scene.add(pointLight2);
  }

  /**
   * Set up OrbitControls for camera movement
   */
  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI / 2.2; // Prevent going below board
    this.controls.minPolarAngle = Math.PI / 6; // Prevent going too high
    this.controls.target.set(0, 0, 0);
    
    // Disable controls initially (enabled after game starts)
    this.controls.enabled = false;
  }

  /**
   * Set up UI manager and callbacks
   */
  setupUI() {
    this.uiManager = new UIManager();
    
    // Start game callback
    this.uiManager.onStartGame = (playerColor, pieceSet) => {
      this.startGame(playerColor, pieceSet);
    };
    
    // Start tutorial callback
    this.uiManager.onStartTutorial = (pieceSet) => {
      this.startTutorial(pieceSet);
    };
    
    // Restart game callback
    this.uiManager.onRestartGame = () => {
      this.restartGame();
    };
  }

  /**
   * Start the tutorial
   */
  async startTutorial(pieceSet = 'procedural') {
    // Initialize sound manager
    if (!soundManager.loaded) {
      await soundManager.init();
    }
    
    // Dispose any existing game
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    
    this.isTutorialMode = true;
    this.isRunning = false;
    
    // Create tutorial manager
    this.tutorialManager = new TutorialManager(this.scene, pieceSet);
    
    // Tutorial exit callback
    this.tutorialManager.onExit = () => {
      this.isTutorialMode = false;
      this.uiManager.showStartScreen();
    };
    
    // Tutorial start game callback
    this.tutorialManager.onStartGame = () => {
      this.isTutorialMode = false;
      const color = this.uiManager.playerColorSelect?.value === 'black' ? Color.BLACK : Color.WHITE;
      this.uiManager.showGameUI();
      this.startGame(color, pieceSet);
    };
    
    // Set up ESC key handler
    if (!this.inputHandler) {
      this.inputHandler = new InputHandler(this.camera, this.renderer, null);
    }
    this.inputHandler.onEscapePressed = () => {
      if (this.isTutorialMode && this.tutorialManager) {
        this.tutorialManager.exit();
      } else if (this.isRunning) {
        // ESC during game returns to menu
        this.returnToMenu();
      }
    };
    
    // Enable orbit controls for tutorial
    this.controls.enabled = true;
    
    // Start tutorial
    await this.tutorialManager.start();
  }

  /**
   * Return to main menu
   */
  returnToMenu() {
    this.isRunning = false;
    this.isTutorialMode = false;
    
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    
    if (this.tutorialManager) {
      this.tutorialManager.exit();
      this.tutorialManager = null;
    }
    
    this.controls.enabled = false;
    this.uiManager.showStartScreen();
  }

  /**
   * Start the game
   */
  async startGame(playerColor, pieceSet = 'procedural') {
    // Initialize sound manager (first time only)
    if (!soundManager.loaded) {
      await soundManager.init();
    }
    
    // If game exists with different piece set, dispose and recreate
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    
    // Create new game with selected piece set
    this.game = new Game(this.scene, playerColor, pieceSet);
    await this.game.init();
    
    // Play game start sound
    soundManager.playGameStart();
    
    // Set up input handler
    if (!this.inputHandler) {
      this.inputHandler = new InputHandler(this.camera, this.renderer, this.game);
    } else {
      this.inputHandler.game = this.game;
    }
    
    // Set up ESC key handler
    this.inputHandler.onEscapePressed = () => {
      if (this.isTutorialMode && this.tutorialManager) {
        this.tutorialManager.exit();
      } else if (this.isRunning) {
        this.returnToMenu();
      }
    };
    
    // Handle board clicks
    this.inputHandler.onBoardClick = (row, col, type) => {
      if (this.game.isGameOver || this.game.isAIThinking) return;
      
      if (this.game.selectedPiece) {
        // Try to move to clicked square
        const moved = this.game.tryMove(row, col);
        if (!moved) {
          // If can't move, try to select a different piece
          this.game.selectPiece(row, col);
        }
      } else {
        // Select piece
        this.game.selectPiece(row, col);
      }
    };
    
    // Enable empty click for camera control hint
    this.inputHandler.onEmptyClick = () => {
      // Camera controls are always enabled now
    };
    
    this.inputHandler.enable();
    
    // Set up game callbacks
    this.game.onTurnChange = (turn) => {
      this.uiManager.updateTurn(turn, this.game.isAIThinking);
      
      // Check if in check
      if (this.game.rules.isInCheck(turn, this.game.boardState)) {
        this.uiManager.showCheck();
      }
    };
    
    this.game.onGameOver = (type, winner) => {
      this.uiManager.showGameOver(type, winner);
    };
    
    this.game.onAIThinking = (isThinking) => {
      this.uiManager.updateTurn(this.game.currentTurn, isThinking);
    };
    
    // Enable camera controls
    this.controls.enabled = true;
    
    // Update UI
    this.uiManager.updateTurn(Color.WHITE);
    this.uiManager.hideGameStatus();
    
    this.isRunning = true;
    
    // If AI plays white, make its move
    if (this.game.aiColor === Color.WHITE) {
      this.game.doAIMove();
    }
  }

  /**
   * Restart the game
   */
  restartGame() {
    if (this.game) {
      const playerColor = this.game.playerColor;
      this.game.reset(playerColor);
      this.uiManager.updateTurn(Color.WHITE);
      this.uiManager.hideGameStatus();
    }
  }

  /**
   * Handle window resize
   */
  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }

  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    // Calculate delta time
    const now = performance.now();
    const deltaTime = (now - (this.lastTime || now)) / 1000; // Convert to seconds
    this.lastTime = now;
    
    // Update controls
    if (this.controls.enabled) {
      this.controls.update();
    }
    
    // Update game animations
    if (this.game && this.isRunning) {
      this.game.update(deltaTime);
    }
    
    // Update tutorial animations
    if (this.tutorialManager && this.isTutorialMode) {
      this.tutorialManager.update(deltaTime);
    }
    
    // Update starfield movement
    this.updateStarfield();
    
    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.game) {
      this.game.dispose();
    }
    if (this.tutorialManager) {
      this.tutorialManager.exit();
    }
    if (this.inputHandler) {
      this.inputHandler.dispose();
    }
    this.renderer.dispose();
  }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new GraviChessApp();
});

export default GraviChessApp;
