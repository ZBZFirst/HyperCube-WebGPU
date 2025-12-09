// webgpu/core/renderer.js - Fixed with vertex buffer
export class WebGPURenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.device = null;
        this.context = null;
        this.format = null;
        this.pipeline = null;
        this.depthTexture = null;
        
        // Vertex buffer for cube geometry
        this.vertexBuffer = null;
        this.cubeVertices = null;
        
        this.frameCount = 0;
    }
    
    async initialize() {
        // 1. Get WebGPU adapter and device
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }
        
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('No GPU adapter found');
        }
        
        this.device = await adapter.requestDevice();
        
        // 2. Setup canvas context
        this.context = this.canvas.getContext('webgpu');
        if (!this.context) {
            throw new Error('WebGPU context not available');
        }
        
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied'
        });
        
        // 3. Create cube geometry
        this.createCubeGeometry();
        
        // 4. Create depth texture
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        
        // 5. Create render pipeline
        await this.createPipeline();
        
        console.log('WebGPU Renderer initialized successfully');
        return this.device;
    }
    
    createCubeGeometry() {
        // Cube vertices (36 vertices, 3 floats each)
        // Positions only - normals calculated in shader
        this.cubeVertices = new Float32Array([
            // Front face
            -0.5, -0.5,  0.5,
             0.5, -0.5,  0.5,
             0.5,  0.5,  0.5,
            -0.5, -0.5,  0.5,
             0.5,  0.5,  0.5,
            -0.5,  0.5,  0.5,
            
            // Back face
            -0.5, -0.5, -0.5,
             0.5,  0.5, -0.5,
             0.5, -0.5, -0.5,
            -0.5, -0.5, -0.5,
            -0.5,  0.5, -0.5,
             0.5,  0.5, -0.5,
            
            // Top face
            -0.5,  0.5, -0.5,
            -0.5,  0.5,  0.5,
             0.5,  0.5,  0.5,
            -0.5,  0.5, -0.5,
             0.5,  0.5,  0.5,
             0.5,  0.5, -0.5,
            
            // Bottom face
            -0.5, -0.5, -0.5,
             0.5, -0.5,  0.5,
            -0.5, -0.5,  0.5,
            -0.5, -0.5, -0.5,
             0.5, -0.5, -0.5,
             0.5, -0.5,  0.5,
            
            // Right face
             0.5, -0.5, -0.5,
             0.5,  0.5,  0.5,
             0.5, -0.5,  0.5,
             0.5, -0.5, -0.5,
             0.5,  0.5, -0.5,
             0.5,  0.5,  0.5,
            
            // Left face
            -0.5, -0.5, -0.5,
            -0.5, -0.5,  0.5,
            -0.5,  0.5,  0.5,
            -0.5, -0.5, -0.5,
            -0.5,  0.5,  0.5,
            -0.5,  0.5, -0.5,
        ]);
        
        // Create vertex buffer
        this.vertexBuffer = this.device.createBuffer({
            size: this.cubeVertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false
        });
        
        // Upload vertex data
        this.device.queue.writeBuffer(
            this.vertexBuffer,
            0,
            this.cubeVertices.buffer,
            this.cubeVertices.byteOffset,
            this.cubeVertices.byteLength
        );
        
        console.log(`Cube geometry created: ${this.cubeVertices.length / 3} vertices`);
    }
    
    async createPipeline() {
        // Simplified shader for testing
        const cubeShaderCode = `
            // Simple cube shader for testing
            
            struct CameraUniforms {
                viewProjectionMatrix: mat4x4<f32>,
                cameraPosition: vec3<f32>,
                time: f32,
            };
            
            struct CubeData {
                position: vec3<f32>,
                color: vec3<f32>,
                size: f32,
                selected: f32,
            };
            
            @group(0) @binding(0) var<uniform> camera: CameraUniforms;
            @group(1) @binding(0) var<storage, read> cubes: array<CubeData>;
            
            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) color: vec3<f32>,
                @location(1) selected: f32,
            };
            
            @vertex
            fn vertex_main(
                @location(0) position: vec3<f32>,
                @builtin(instance_index) instanceIndex: u32
            ) -> VertexOutput {
                let cube = cubes[instanceIndex];
                let worldPosition = position * cube.size + cube.position;
                
                var output: VertexOutput;
                output.position = camera.viewProjectionMatrix * vec4<f32>(worldPosition, 1.0);
                output.color = cube.color;
                output.selected = cube.selected;
                
                return output;
            }
            
            @fragment
            fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
                // Simple color with selection highlight
                var finalColor = input.color;
                
                // Highlight selected cubes
                if (input.selected > 0.5) {
                    finalColor = mix(finalColor, vec3<f32>(1.0, 1.0, 0.0), 0.5);
                }
                
                return vec4<f32>(finalColor, 1.0);
            }
        `;
        
        const cubeShaderModule = this.device.createShaderModule({
            code: cubeShaderCode
        });
        
        // Create pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                // Camera uniforms (group 0)
                this.device.createBindGroupLayout({
                    entries: [{
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: { type: 'uniform' }
                    }]
                }),
                // Cube data (group 1)
                this.device.createBindGroupLayout({
                    entries: [{
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: { type: 'read-only-storage' }
                    }]
                })
            ]
        });
        
        // Create render pipeline
        this.pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: cubeShaderModule,
                entryPoint: 'vertex_main',
                buffers: [{
                    arrayStride: 3 * 4, // 3 floats (x, y, z) * 4 bytes each
                    attributes: [{
                        shaderLocation: 0,
                        offset: 0,
                        format: 'float32x3'
                    }]
                }]
            },
            fragment: {
                module: cubeShaderModule,
                entryPoint: 'fragment_main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    }
                }]
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back'
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus'
            }
        });
        
        console.log('Render pipeline created successfully');
    }
    
    render(camera, dataProcessor) {
        if (!this.device || !this.pipeline || !this.vertexBuffer) {
            console.warn('Renderer not ready for rendering');
            return;
        }
        
        if (!dataProcessor || !dataProcessor.renderBindGroup || dataProcessor.instanceCount === 0) {
            console.warn('No data to render or bind group not ready');
            return;
        }
        
        this.frameCount++;
        
        // Update depth texture if canvas size changed
        if (this.canvas.width !== this.depthTexture.width || 
            this.canvas.height !== this.depthTexture.height) {
            this.depthTexture.destroy();
            this.depthTexture = this.device.createTexture({
                size: [this.canvas.width, this.canvas.height],
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            });
        }
        
        try {
            // Create command encoder
            const commandEncoder = this.device.createCommandEncoder();
            
            // Begin render pass
            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0.1, g: 0.1, b: 0.2, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }],
                depthStencilAttachment: {
                    view: this.depthTexture.createView(),
                    depthClearValue: 1.0,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store'
                }
            });
            
            // Set pipeline
            renderPass.setPipeline(this.pipeline);
            
            // Set vertex buffer
            renderPass.setVertexBuffer(0, this.vertexBuffer);
            
            // Bind camera uniforms
            if (camera && camera.bindGroup) {
                renderPass.setBindGroup(0, camera.bindGroup);
            }
            
            // Bind cube data
            renderPass.setBindGroup(1, dataProcessor.renderBindGroup);
            
            // Draw instanced cubes
            const instanceCount = dataProcessor.instanceCount || 0;
            if (instanceCount > 0) {
                renderPass.draw(36, instanceCount, 0, 0); // 36 vertices per cube
            }
            
            renderPass.end();
            
            // Submit command buffer
            this.device.queue.submit([commandEncoder.finish()]);
            
        } catch (error) {
            console.error('Rendering error:', error);
        }
    }
    
    cleanup() {
        if (this.depthTexture) {
            this.depthTexture.destroy();
        }
        if (this.vertexBuffer) {
            this.vertexBuffer.destroy();
        }
    }
}
