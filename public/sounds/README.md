# GraviChess Sound Files

This folder contains sound effects for the chess game. The sounds need to be downloaded manually from freesound.org.

## Required Sound Files

Download these files and rename them as specified:

### From "Chess Puzzle Blitz SFX" pack by el_boss (CC0 License)
https://freesound.org/people/el_boss/packs/30764/

| Original File | Rename To | Use |
|--------------|-----------|-----|
| [Piece Placement.mp3](https://freesound.org/people/el_boss/sounds/546119/) | `land.mp3` | Piece landing on board |
| [Piece Capture.mp3](https://freesound.org/people/el_boss/sounds/546120/) | `capture.mp3` | Capturing a piece |
| [Board Start.mp3](https://freesound.org/people/el_boss/sounds/546121/) | `start.mp3` | Game starting |
| [Piece Slide.mp3](https://freesound.org/people/el_boss/sounds/546118/) | `move.mp3` | Piece sliding/moving |

### Additional Sounds (CC0 License)
| Original File | Rename To | Use |
|--------------|-----------|-----|
| [hint.wav](https://freesound.org/people/dland/sounds/320181/) | `check.mp3` | King in check |

### Suggested Alternatives for Lift Sound
For the lift sound, you can use the slide sound at a higher pitch, or find a light "pick up" sound. Options:
- Use the same `move.mp3` for `lift.mp3`
- Or find a light wooden tap/click sound

### Game Over Sound
For game over, you can use a dramatic chord or fanfare. Suggestions:
- Search for "game over" or "victory fanfare" on freesound.org
- Keep it short (1-2 seconds)

## File List

Place these files in `/public/sounds/`:

```
sounds/
├── lift.mp3      (piece picking up)
├── move.mp3      (piece sliding/moving)
├── land.mp3      (piece landing)
├── capture.mp3   (capturing piece)
├── start.mp3     (game start)
├── check.mp3     (king in check)
└── gameover.mp3  (game over)
```

## License

All sounds from freesound.org are under Creative Commons 0 (CC0) license - free for any use without attribution required.

## Quick Download Links

1. **Piece Placement** → land.mp3: https://freesound.org/people/el_boss/sounds/546119/
2. **Piece Capture** → capture.mp3: https://freesound.org/people/el_boss/sounds/546120/
3. **Board Start** → start.mp3: https://freesound.org/people/el_boss/sounds/546121/
4. **Piece Slide** → move.mp3: https://freesound.org/people/el_boss/sounds/546118/
5. **Hint** → check.mp3: https://freesound.org/people/dland/sounds/320181/

Note: You'll need a freesound.org account (free) to download the files.
