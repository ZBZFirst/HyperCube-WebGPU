// WebGPU Camera System
export class CameraSystem {
    constructor(renderer) {
        this.renderer = renderer;
        this.device = renderer.device;
        
        this.position = [0, 1.6, 5];
        this.target = [0, 0, 0];
        this.up = [0, 1, 0];
        this.fov = 75 * Math.PI / 180;
        this.aspect = 1;
        this.near = 0.1;
        this.far = 1000;
        
        this.viewMatrix = new Float32Array(16);
        this.projectionMatrix = new Float32Array(16);
        this.viewProjectionMatrix = new Float32Array(16);
        
        this.uniformBuffer = null;
        this.bindGroup = null;
        
        this.time = 0;
        
        this.init();
    }
    
    init() {
        this.createUniformBuffer();
        this.createBindGroup();
        this.updateMatrices();
    }
    
    createUniformBuffer() {
        // Camera uniform buffer layout:
        // - viewProjectionMatrix: 16 floats (64 bytes)
        // - cameraPosition: 3 floats (12 bytes)
        // - time: 1 float (4 bytes)
        // Total: 80 bytes (pad to 256 for alignment)
        this.uniformBuffer = this.device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }
    
    createBindGroup() {
        const bindGroupLayout = this.renderer.pipeline.getBindGroupLayout(0);
        
        this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: {
                    buffer: this.uniformBuffer
                }
            }]
        });
    }
    
    updateMatrices() {
        // Update aspect ratio
        this.aspect = this.renderer.canvas.width / this.renderer.canvas.height;
        
        // Update projection matrix
        this.updateProjectionMatrix();
        
        // Update view matrix
        this.updateViewMatrix();
        
        // Update view-projection matrix
        this.multiplyMatrices(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
        
        // Update uniform buffer
        this.updateUniformBuffer();
    }
    
    updateProjectionMatrix() {
        const f = 1.0 / Math.tan(this.fov / 2);
        const rangeInv = 1.0 / (this.near - this.far);
        
        this.projectionMatrix.set([
            f / this.aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (this.near + this.far) * rangeInv, -1,
            0, 0, this.near * this.far * rangeInv * 2, 0
        ]);
    }
    
    updateViewMatrix() {
        const z = this.normalize(this.subtractVectors(this.target, this.position));
        const x = this.normalize(this.cross(this.up, z));
        const y = this.cross(z, x);
        
        this.viewMatrix.set([
            x[0], y[0], z[0], 0,
            x[1], y[1], z[1], 0,
            x[2], y[2], z[2], 0,
            -this.dot(x, this.position), -this.dot(y, this.position), -this.dot(z, this.position), 1
        ]);
    }
    
    updateUniformBuffer() {
        this.time += 0.01; // Simple time increment
        
        const uniformData = new Float32Array(20); // 16 + 3 + 1 = 20 floats
        
        // Copy viewProjectionMatrix
        uniformData.set(this.viewProjectionMatrix, 0);
        
        // Copy camera position
        uniformData.set(this.position, 16);
        
        // Copy time
        uniformData[19] = this.time;
        
        // Update buffer
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            0,
            uniformData.buffer,
            uniformData.byteOffset,
            uniformData.byteLength
        );
    }
    
    // Math helper functions
    normalize(v) {
        const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return [v[0] / length, v[1] / length, v[2] / length];
    }
    
    subtractVectors(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    
    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }
    
    dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    
    multiplyMatrices(out, a, b) {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        
        const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
        const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
        const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
        const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];
        
        out[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
        out[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
        out[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
        out[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;
        
        out[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
        out[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
        out[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
        out[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;
        
        out[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
        out[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
        out[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
        out[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;
        
        out[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
        out[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
        out[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
        out[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;
    }
    
    // Camera movement methods
    moveForward(distance) {
        const direction = this.normalize(this.subtractVectors(this.target, this.position));
        this.position[0] += direction[0] * distance;
        this.position[1] += direction[1] * distance;
        this.position[2] += direction[2] * distance;
        this.target[0] += direction[0] * distance;
        this.target[1] += direction[1] * distance;
        this.target[2] += direction[2] * distance;
        this.updateMatrices();
    }
    
    moveRight(distance) {
        const direction = this.normalize(this.subtractVectors(this.target, this.position));
        const right = this.cross(direction, this.up);
        this.position[0] += right[0] * distance;
        this.position[1] += right[1] * distance;
        this.position[2] += right[2] * distance;
        this.target[0] += right[0] * distance;
        this.target[1] += right[1] * distance;
        this.target[2] += right[2] * distance;
        this.updateMatrices();
    }
    
    rotate(yaw, pitch) {
        // Implement camera rotation if needed
        this.updateMatrices();
    }
}
