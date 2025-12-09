// webgpu/ui/controls.js - WebGPU Camera Controls
export class Controls {
    constructor(canvas, camera) {
        this.canvas = canvas;
        this.camera = camera;
        
        // Mouse state
        this.mouse = {
            x: 0,
            y: 0,
            prevX: 0,
            prevY: 0,
            deltaX: 0,
            deltaY: 0,
            isDragging: false,
            sensitivity: 0.002
        };
        
        // Keyboard state
        this.keys = new Set();
        this.keyState = {};
        
        // Movement parameters
        this.movementSpeed = 5.0;
        this.rotationSpeed = 0.5;
        this.altitudeSpeed = 3.0;
        
        // Control state
        this.isPointerLocked = false;
        this.isEnabled = true;
        
        // Projectiles for selection
        this.projectiles = [];
        this.projectileSpeed = 15.0;
        this.maxProjectiles = 100;
        
        // Raycasting for selection
        this.rayOrigin = new Float32Array(3);
        this.rayDirection = new Float32Array(3);
        
        this.init();
    }
    
    init() {
        // Event listeners
        this.setupEventListeners();
        
        // Request pointer lock on canvas click
        this.canvas.addEventListener('click', () => {
            if (!this.isPointerLocked && document.pointerLockElement !== this.canvas) {
                this.canvas.requestPointerLock();
            }
        });
        
        console.log('WebGPU Controls initialized');
    }
    
    setupEventListeners() {
        // Pointer lock events
        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
        document.addEventListener('mozpointerlockchange', this.onPointerLockChange.bind(this));
        document.addEventListener('webkitpointerlockchange', this.onPointerLockChange.bind(this));
        
        // Mouse events
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        
        // Keyboard events
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        
        // Wheel for zoom
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    }
    
    onPointerLockChange() {
        this.isPointerLocked = document.pointerLockElement === this.canvas;
        
        if (this.isPointerLocked) {
            console.log('Pointer lock acquired');
            this.mouse.prevX = this.canvas.width / 2;
            this.mouse.prevY = this.canvas.height / 2;
        } else {
            console.log('Pointer lock released');
            this.mouse.isDragging = false;
            this.keys.clear();
        }
    }
    
    onMouseDown(event) {
        if (event.button === 0 && this.isPointerLocked) { // Left click
            this.mouse.isDragging = true;
            this.mouse.prevX = event.clientX;
            this.mouse.prevY = event.clientY;
            
            // Check if we're clicking on a UI element
            if (!this.isClickOnUI(event)) {
                this.generateProjectile();
            }
        }
    }
    
    onMouseMove(event) {
        if (!this.isPointerLocked || !this.isEnabled) return;
        
        this.mouse.x = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        this.mouse.y = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
        
        if (this.mouse.isDragging) {
            this.handleRotation();
        }
    }
    
    onMouseUp(event) {
        if (event.button === 0) {
            this.mouse.isDragging = false;
        }
    }
    
    onKeyDown(event) {
        if (!this.isPointerLocked || !this.isEnabled) return;
        
        const key = event.key.toLowerCase();
        this.keys.add(key);
        this.keyState[key] = true;
        
        // Prevent default for control keys
        if ([' ', 'control', 'shift', 'g'].includes(key)) {
            event.preventDefault();
        }
        
        // Generate projectile on 'g' key
        if (key === 'g') {
            this.generateProjectile();
        }
        
        // Toggle controls on 'escape'
        if (key === 'escape') {
            if (document.pointerLockElement === this.canvas) {
                document.exitPointerLock();
            }
        }
    }
    
    onKeyUp(event) {
        const key = event.key.toLowerCase();
        this.keys.delete(key);
        this.keyState[key] = false;
    }
    
    onWheel(event) {
        if (!this.isEnabled) return;
        
        event.preventDefault();
        const zoomAmount = event.deltaY > 0 ? 1.1 : 0.9;
        
        // Move camera forward/backward based on wheel
        const direction = this.getCameraDirection();
        this.camera.position[0] += direction[0] * (zoomAmount - 1) * 2;
        this.camera.position[1] += direction[1] * (zoomAmount - 1) * 2;
        this.camera.position[2] += direction[2] * (zoomAmount - 1) * 2;
        this.camera.target[0] += direction[0] * (zoomAmount - 1) * 2;
        this.camera.target[1] += direction[1] * (zoomAmount - 1) * 2;
        this.camera.target[2] += direction[2] * (zoomAmount - 1) * 2;
        
        this.camera.updateMatrices();
    }
    
    onTouchStart(event) {
        if (!this.isEnabled) return;
        
        event.preventDefault();
        if (event.touches.length === 1) {
            this.mouse.isDragging = true;
            this.mouse.prevX = event.touches[0].clientX;
            this.mouse.prevY = event.touches[0].clientY;
        } else if (event.touches.length === 2) {
            // Two-finger pinch for zoom
            this.touchStartDistance = this.getTouchDistance(event.touches);
            this.isPinching = true;
        }
    }
    
    onTouchMove(event) {
        if (!this.isEnabled) return;
        
        event.preventDefault();
        
        if (this.mouse.isDragging && event.touches.length === 1) {
            const touch = event.touches[0];
            this.mouse.x = touch.clientX - this.mouse.prevX;
            this.mouse.y = touch.clientY - this.mouse.prevY;
            this.mouse.prevX = touch.clientX;
            this.mouse.prevY = touch.clientY;
            
            this.handleRotation();
        } else if (this.isPinching && event.touches.length === 2) {
            const currentDistance = this.getTouchDistance(event.touches);
            const zoomFactor = this.touchStartDistance / currentDistance;
            
            // Apply zoom
            const direction = this.getCameraDirection();
            this.camera.position[0] += direction[0] * (zoomFactor - 1) * 2;
            this.camera.position[1] += direction[1] * (zoomFactor - 1) * 2;
            this.camera.position[2] += direction[2] * (zoomFactor - 1) * 2;
            this.camera.target[0] += direction[0] * (zoomFactor - 1) * 2;
            this.camera.target[1] += direction[1] * (zoomFactor - 1) * 2;
            this.camera.target[2] += direction[2] * (zoomFactor - 1) * 2;
            
            this.camera.updateMatrices();
            this.touchStartDistance = currentDistance;
        }
    }
    
    onTouchEnd(event) {
        this.mouse.isDragging = false;
        this.isPinching = false;
    }
    
    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    handleRotation() {
        if (!this.isEnabled) return;
        
        // Calculate rotation angles
        const yaw = -this.mouse.x * this.mouse.sensitivity;
        const pitch = -this.mouse.y * this.mouse.sensitivity;
        
        // Apply rotation to camera target
        this.rotateCamera(yaw, pitch);
        
        // Reset mouse delta
        this.mouse.x = 0;
        this.mouse.y = 0;
    }
    
    rotateCamera(yaw, pitch) {
        // Get camera direction vector
        const direction = [
            this.camera.target[0] - this.camera.position[0],
            this.camera.target[1] - this.camera.position[1],
            this.camera.target[2] - this.camera.position[2]
        ];
        
        // Normalize direction
        const length = Math.sqrt(direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2]);
        direction[0] /= length;
        direction[1] /= length;
        direction[2] /= length;
        
        // Calculate right vector
        const right = this.cross(direction, this.camera.up);
        
        // Apply yaw (horizontal rotation)
        const yawCos = Math.cos(yaw);
        const yawSin = Math.sin(yaw);
        
        const newDirYaw = [
            direction[0] * yawCos + right[0] * yawSin,
            direction[1] * yawCos + right[1] * yawSin,
            direction[2] * yawCos + right[2] * yawSin
        ];
        
        // Apply pitch (vertical rotation) - limit to avoid flipping
        const currentPitch = Math.asin(newDirYaw[1]);
        const newPitch = currentPitch + pitch;
        
        // Limit pitch to ±85 degrees
        const maxPitch = 85 * Math.PI / 180;
        if (Math.abs(newPitch) < maxPitch) {
            const pitchCos = Math.cos(pitch);
            const pitchSin = Math.sin(pitch);
            
            // Calculate up vector for pitch
            const pitchUp = this.cross(right, newDirYaw);
            
            direction[0] = newDirYaw[0] * pitchCos + pitchUp[0] * pitchSin;
            direction[1] = newDirYaw[1] * pitchCos + pitchUp[1] * pitchSin;
            direction[2] = newDirYaw[2] * pitchCos + pitchUp[2] * pitchSin;
        } else {
            direction[0] = newDirYaw[0];
            direction[1] = newDirYaw[1];
            direction[2] = newDirYaw[2];
        }
        
        // Normalize final direction
        const finalLength = Math.sqrt(direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2]);
        direction[0] /= finalLength;
        direction[1] /= finalLength;
        direction[2] /= finalLength;
        
        // Update camera target
        this.camera.target[0] = this.camera.position[0] + direction[0] * 5;
        this.camera.target[1] = this.camera.position[1] + direction[1] * 5;
        this.camera.target[2] = this.camera.position[2] + direction[2] * 5;
        
        this.camera.updateMatrices();
    }
    
    getCameraDirection() {
        return [
            this.camera.target[0] - this.camera.position[0],
            this.camera.target[1] - this.camera.position[1],
            this.camera.target[2] - this.camera.position[2]
        ];
    }
    
    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }
    
    generateProjectile() {
        if (this.projectiles.length >= this.maxProjectiles) {
            this.projectiles.shift(); // Remove oldest projectile
        }
        
        const direction = this.getCameraDirection();
        const normalizedDirection = this.normalize(direction);
        
        const projectile = {
            position: [...this.camera.position],
            velocity: [
                normalizedDirection[0] * this.projectileSpeed,
                normalizedDirection[1] * this.projectileSpeed,
                normalizedDirection[2] * this.projectileSpeed
            ],
            lifetime: 2.0, // seconds
            active: true
        };
        
        this.projectiles.push(projectile);
        
        // Emit custom event for selection system
        const event = new CustomEvent('projectile-fired', {
            detail: {
                origin: [...this.camera.position],
                direction: normalizedDirection
            }
        });
        document.dispatchEvent(event);
    }
    
    normalize(v) {
        const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return [
            v[0] / length,
            v[1] / length,
            v[2] / length
        ];
    }
    
    update(deltaTime) {
        if (!this.isEnabled || !this.isPointerLocked) return;
        
        // Handle movement
        this.handleMovement(deltaTime);
        
        // Update projectiles
        this.updateProjectiles(deltaTime);
        
        // Update camera matrices
        this.camera.updateMatrices();
    }
    
    handleMovement(deltaTime) {
        let moveForward = 0;
        let moveRight = 0;
        let moveUp = 0;
        
        // Check key states
        if (this.keys.has('w') || this.keys.has('arrowup')) moveForward = 1;
        if (this.keys.has('s') || this.keys.has('arrowdown')) moveForward = -1;
        if (this.keys.has('d') || this.keys.has('arrowright')) moveRight = 1;
        if (this.keys.has('a') || this.keys.has('arrowleft')) moveRight = -1;
        if (this.keys.has(' ') || this.keys.has('arrowup')) moveUp = 1;
        if (this.keys.has('control') || this.keys.has('arrowdown')) moveUp = -1;
        
        if (moveForward !== 0 || moveRight !== 0 || moveUp !== 0) {
            const direction = this.getCameraDirection();
            const normalizedDirection = this.normalize(direction);
            
            // Calculate right vector
            const right = this.cross(normalizedDirection, this.camera.up);
            
            // Apply movement
            const forwardVec = [
                normalizedDirection[0] * moveForward,
                normalizedDirection[1] * moveForward,
                normalizedDirection[2] * moveForward
            ];
            
            const rightVec = [
                right[0] * moveRight,
                right[1] * moveRight,
                right[2] * moveRight
            ];
            
            const upVec = [
                this.camera.up[0] * moveUp,
                this.camera.up[1] * moveUp,
                this.camera.up[2] * moveUp
            ];
            
            // Calculate total movement
            const totalMovement = [
                (forwardVec[0] + rightVec[0] + upVec[0]) * this.movementSpeed * deltaTime,
                (forwardVec[1] + rightVec[1] + upVec[1]) * this.altitudeSpeed * deltaTime,
                (forwardVec[2] + rightVec[2] + upVec[2]) * this.movementSpeed * deltaTime
            ];
            
            // Update camera position and target
            this.camera.position[0] += totalMovement[0];
            this.camera.position[1] += totalMovement[1];
            this.camera.position[2] += totalMovement[2];
            
            this.camera.target[0] += totalMovement[0];
            this.camera.target[1] += totalMovement[1];
            this.camera.target[2] += totalMovement[2];
        }
    }
    
    updateProjectiles(deltaTime) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            
            if (!projectile.active) {
                this.projectiles.splice(i, 1);
                continue;
            }
            
            // Update position
            projectile.position[0] += projectile.velocity[0] * deltaTime;
            projectile.position[1] += projectile.velocity[1] * deltaTime;
            projectile.position[2] += projectile.velocity[2] * deltaTime;
            
            // Update lifetime
            projectile.lifetime -= deltaTime;
            if (projectile.lifetime <= 0) {
                projectile.active = false;
            }
            
            // Check collisions (simplified - would need GPU ray-casting for real implementation)
            this.checkProjectileCollision(projectile, i);
        }
    }
    
    checkProjectileCollision(projectile, index) {
        // This is a simplified collision check
        // In a real implementation, you'd use GPU ray-casting or compute shaders
        const collisionDistance = 1.0;
        
        // For now, just deactivate projectiles after distance
        const distanceFromCamera = Math.sqrt(
            Math.pow(projectile.position[0] - this.camera.position[0], 2) +
            Math.pow(projectile.position[1] - this.camera.position[1], 2) +
            Math.pow(projectile.position[2] - this.camera.position[2], 2)
        );
        
        if (distanceFromCamera > 50) {
            projectile.active = false;
        }
    }
    
    isClickOnUI(event) {
        // Check if click is on UI elements
        const uiElements = document.querySelectorAll('#data-container, #button-container, #text-container');
        for (const element of uiElements) {
            const rect = element.getBoundingClientRect();
            if (
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom
            ) {
                return true;
            }
        }
        return false;
    }
    
    enable() {
        this.isEnabled = true;
        this.canvas.style.cursor = 'none';
    }
    
    disable() {
        this.isEnabled = false;
        this.canvas.style.cursor = 'default';
        this.keys.clear();
        this.mouse.isDragging = false;
    }
    
    dispose() {
        // Clean up event listeners
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('touchstart', this.onTouchStart);
        this.canvas.removeEventListener('touchmove', this.onTouchMove);
        this.canvas.removeEventListener('touchend', this.onTouchEnd);
        
        if (document.pointerLockElement === this.canvas) {
            document.exitPointerLock();
        }
        
        console.log('WebGPU Controls disposed');
    }
}

// Utility functions
Controls.prototype.normalize = function(v) {
    const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0];
};

Controls.prototype.cross = function(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
};

Controls.prototype.dot = function(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

// Export for debugging
window.Controls = Controls;
