import * as THREE from 'three';
import { BoardConfig } from '../config/GravityRules.js';

/**
 * InputHandler
 * 
 * Handles mouse/touch input, raycasting for 3D object selection,
 * and coordinates between camera controls and game interaction.
 */
export class InputHandler {
  constructor(camera, renderer, game) {
    this.camera = camera;
    this.renderer = renderer;
    this.game = game;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.isEnabled = false;
    this.onBoardClick = null; // Callback: (row, col, type) => {}
    this.onEmptyClick = null; // Callback for clicks outside board
    this.onEscapePressed = null; // Callback for ESC key
    
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    
    this.hoveredObject = null;
    
    // Always listen for keyboard events
    window.addEventListener('keydown', this.boundOnKeyDown);
  }

  /**
   * Enable input handling
   */
  enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;
    
    this.renderer.domElement.addEventListener('click', this.boundOnClick);
    this.renderer.domElement.addEventListener('mousemove', this.boundOnMouseMove);
  }

  /**
   * Disable input handling
   */
  disable() {
    if (!this.isEnabled) return;
    this.isEnabled = false;
    
    this.renderer.domElement.removeEventListener('click', this.boundOnClick);
    this.renderer.domElement.removeEventListener('mousemove', this.boundOnMouseMove);
  }

  /**
   * Handle keyboard events
   */
  onKeyDown(event) {
    if (event.key === 'Escape') {
      if (this.onEscapePressed) {
        this.onEscapePressed();
      }
    }
  }

  /**
   * Update mouse position from event
   */
  updateMousePosition(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Perform raycast and return intersections
   */
  raycast() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Only raycast against board squares - pieces are handled via game state
    const targets = this.game ? this.game.board.getSquareMeshes() : [];
    return this.raycaster.intersectObjects(targets, true);
  }

  /**
   * Handle click events
   */
  onClick(event) {
    this.updateMousePosition(event);
    const intersects = this.raycast();
    
    if (intersects.length > 0) {
      // Find the first square hit
      for (const hit of intersects) {
        const userData = this.findUserData(hit.object);
        if (userData && userData.type === 'square') {
          if (this.onBoardClick) {
            // Always pass row/col - game logic will check for pieces
            this.onBoardClick(userData.row, userData.col, 'square');
          }
          return;
        }
      }
    }
    
    // Click outside board
    if (this.onEmptyClick) {
      this.onEmptyClick(event);
    }
  }

  /**
   * Handle mouse move for hover effects
   */
  onMouseMove(event) {
    this.updateMousePosition(event);
    const intersects = this.raycast();
    
    // Reset cursor
    this.renderer.domElement.style.cursor = 'default';
    
    if (intersects.length > 0) {
      // Check for square hit (we only raycast squares now)
      for (const hit of intersects) {
        const userData = this.findUserData(hit.object);
        if (userData && userData.type === 'square') {
          this.renderer.domElement.style.cursor = 'pointer';
          break;
        }
      }
    }
  }

  /**
   * Find userData by traversing up the object hierarchy
   */
  findUserData(object) {
    let current = object;
    while (current) {
      if (current.userData && (current.userData.type === 'piece' || current.userData.type === 'square')) {
        return current.userData;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Clean up event listeners
   */
  dispose() {
    this.disable();
    window.removeEventListener('keydown', this.boundOnKeyDown);
  }
}

export default InputHandler;
