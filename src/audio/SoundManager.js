/**
 * Sound Manager
 * 
 * Handles all game audio including piece movement sounds,
 * captures, and game events.
 * 
 * Sound sources from freesound.org (CC0 License):
 * - el_boss: Chess Puzzle Blitz SFX pack (546118-546121)
 * - dland: hint.wav (320181)
 * 
 * Download the sounds manually from freesound.org and place in /public/sounds/
 */

export class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.volume = 0.5;
    this.loaded = false;
    
    // Sound file paths
    this.soundFiles = {
      lift: '/sounds/lift.mp3',       // Piece picking up
      move: '/sounds/move.mp3',       // Piece sliding/moving
      land: '/sounds/land.mp3',       // Piece landing on board
      capture: '/sounds/capture.mp3', // Piece capturing another
      gameStart: '/sounds/start.mp3', // Game starting
      check: '/sounds/check.mp3',     // King in check
      gameOver: '/sounds/gameover.mp3' // Checkmate/game over
    };
  }
  
  /**
   * Initialize and load all sounds
   */
  async init() {
    const loadPromises = [];
    
    for (const [name, path] of Object.entries(this.soundFiles)) {
      loadPromises.push(this.loadSound(name, path));
    }
    
    try {
      await Promise.all(loadPromises);
      this.loaded = true;
      console.log('✓ All sounds loaded');
    } catch (error) {
      console.warn('Some sounds failed to load:', error);
      // Continue without sounds - game should still work
    }
  }
  
  /**
   * Load a single sound file
   */
  loadSound(name, path) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      
      audio.addEventListener('canplaythrough', () => {
        this.sounds[name] = audio;
        resolve();
      }, { once: true });
      
      audio.addEventListener('error', (e) => {
        console.warn(`Failed to load sound: ${name} from ${path}`);
        resolve(); // Resolve anyway to not block the game
      }, { once: true });
      
      audio.src = path;
      audio.load();
    });
  }
  
  /**
   * Play a sound by name
   */
  play(name, volumeMultiplier = 1.0) {
    if (!this.enabled || !this.sounds[name]) {
      return;
    }
    
    // Clone the audio to allow overlapping sounds
    const sound = this.sounds[name].cloneNode();
    sound.volume = Math.min(1.0, this.volume * volumeMultiplier);
    
    sound.play().catch(e => {
      // Ignore play errors (usually due to user interaction requirements)
    });
    
    return sound;
  }
  
  /**
   * Play piece lift sound
   */
  playLift() {
    this.play('lift', 0.7);
  }
  
  /**
   * Play piece move/slide sound
   */
  playMove() {
    this.play('move', 0.5);
  }
  
  /**
   * Play piece landing sound
   */
  playLand() {
    this.play('land', 0.8);
  }
  
  /**
   * Play capture sound
   */
  playCapture() {
    this.play('capture', 1.0);
  }
  
  /**
   * Play game start sound
   */
  playGameStart() {
    this.play('gameStart', 0.6);
  }
  
  /**
   * Play check sound
   */
  playCheck() {
    this.play('check', 0.9);
  }
  
  /**
   * Play game over sound
   */
  playGameOver() {
    this.play('gameOver', 1.0);
  }
  
  /**
   * Set master volume (0.0 - 1.0)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }
  
  /**
   * Enable/disable all sounds
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  /**
   * Toggle sounds on/off
   */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

// Singleton instance
export const soundManager = new SoundManager();
