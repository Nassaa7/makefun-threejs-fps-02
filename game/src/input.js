// EMBERLINE — input: keyboard, mouse and pointer lock. The simulation reads
// this snapshot once per fixed step; edges are consumed so a click fires a
// semi-automatic weapon exactly once.
export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.attackHeld = false;
    this.attackEdge = false;
    this.aimHeld = false;
    this.locked = false;
    this.onLockChange = null;
    this.onBuyKey = null;
    this.onPauseKey = null;
    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.attackHeld = true; this.attackEdge = true; }
      if (e.button === 2) this.aimHeld = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.attackHeld = false;
      if (e.button === 2) this.aimHeld = false;
    };
    this._onLock = () => {
      this.locked = document.pointerLockElement === document.body;
      if (!this.locked) { this.attackHeld = false; this.aimHeld = false; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    };
    this._onCtx = (e) => e.preventDefault();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLock);
    document.addEventListener('contextmenu', this._onCtx);
  }

  _key(e, down) {
    if (e.code === 'Tab') e.preventDefault();
    if (down && !e.repeat) {
      if (e.code === 'KeyB' && this.onBuyKey) this.onBuyKey();
      if (e.code === 'Escape' && this.onPauseKey) this.onPauseKey();
    }
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }

  down(code) { return this.keys.has(code); }

  // Mouse deltas accumulated since the last call; the sim consumes them.
  takeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  takeAttackEdge() {
    const e = this.attackEdge;
    this.attackEdge = false;
    return e;
  }

  requestLock() {
    if (!this.locked) document.body.requestPointerLock();
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }
}
