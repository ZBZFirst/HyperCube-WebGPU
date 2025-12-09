// WebGPU Renderer
export class WebGPURenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.device = null;
        this.context = null;
        this.format = null;
        this.pipeline = null;
        this.depthTexture = null;
        
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
        
        // 3. Create depth texture
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        
        // 4. Create render pipeline
        await this.createPipeline();
        
        console.log('WebGPU Renderer initialized successfully');
        return this.device;
    }
    
    async createPipeline() {
        // Load shader modules
        const cubeShaderModule = this.device.createShaderModule({
            code: await this.loadShader('cube')
        });
        
        // Create pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                // Camera uniform
                this.device.createBindGroupLayout({
                    entries: [
                        {
                            binding: 0,
                            visibility: GPUShaderStage.VERTEX,
                            buffer: { type: 'uniform' }
                        }
                    ]
                }),
                // Cube data storage
                this.device.createBindGroupLayout({
                    entries: [
                        {
                            binding: 0,
                            visibility: GPUShaderStage.VERTEX,
                            buffer: { type: 'read-only-storage' }
                        }
                    ]
                })
            ]
        });
        
        // Create render pipeline
        this.pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: cubeShaderModule,
                entryPoint: 'vertex_main',
                buffers: [
                    // Vertex buffer for cube geometry (we'll use instanced rendering)
                    {
                        arrayStride: 3 * 4, // 3 floats (x, y, z)
                        attributes: [{
                            shaderLocation: 0,
                            offset: 0,
                            format: 'float32x3'
                        }]
                    }
                ]
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
    }
    
    async loadShader(name) {
        // In production, you'd load these from separate .wgsl files
        // For now, we'll embed them
        const shaders = {
            cube: `
                // Camera uniforms
                struct CameraUniforms {
                    viewProjectionMatrix: mat4x4<f32>,
                    cameraPosition: vec3<f32>,
                    time: f32,
                };
                
                // Cube instance data
                struct CubeData {
                    position: vec3<f32>,
                    color: vec3<f32>,
                    size: f32,
                    selected: f32,
                    pmid: u32,
                };
                
                @group(0) @binding(0) var<uniform> camera: CameraUniforms;
                @group(1) @binding(0) var<storage, read> cubes: array<CubeData>;
                
                struct VertexOutput {
                    @builtin(position) position: vec4<f32>,
                    @location(0) color: vec3<f32>,
                    @location(1) normal: vec3<f32>,
                    @location(2) selected: f32,
                };
                
                // Cube vertices (hardcoded for now)
                const CUBE_VERTICES = array<vec3<f32>, 36>(
                    // Front face
                    vec3<f32>(-0.5, -0.5,  0.5),
                    vec3<f32>( 0.5, -0.5,  0.5),
                    vec3<f32>( 0.5,  0.5,  0.5),
                    vec3<f32>(-0.5, -0.5,  0.5),
                    vec3<f32>( 0.5,  0.5,  0.5),
                    vec3<f32>(-0.5,  0.5,  0.5),
                    // Back face
                    vec3<f32>(-0.5, -0.5, -0.5),
                    vec3<f32>( 0.5,  0.5, -0.5),
                    vec3<f32>( 0.5, -0.5, -0.5),
                    vec3<f32>(-0.5, -0.5, -0.5),
                    vec3<f32>(-0.5,  0.5, -0.5),
                    vec3<f32>( 0.5,  0.5, -0.5),
                    // Top face
                    vec3<f32>(-0.5,  0.5, -0.5),
                    vec3<f32>(-0.5,  0.5,  0.5),
                    vec3<f32>( 0.5,  0.5,  0.5),
                    vec3<f32>(-0.5,  0.5, -0.5),
                    vec3<f32>( 0.5,  0.5,  0.5),
                    vec3<f32>( 0.5,  0.5, -0.5),
                    // Bottom face
                    vec3<f32>(-0.5, -0.5, -0.5),
                    vec3<f32>( 0.5, -0.5,  0.5),
                    vec3<f32>(-0.5, -0.5,  0.5),
                    vec3<f32>(-0.5, -0.5, -0.5),
                    vec3<f32>( 0.5, -0.5, -0.5),
                    vec3<f32>( 0.5, -0.5,  0.5),
                    // Right face
                    vec3<f32>( 0.5, -0.5, -0.5),
                    vec3<f32>( 0.5,  0.5,  0.5),
                    vec3<f32>( 0.5, -0.5,  0.5),
                    vec3<f32>( 0.5, -0.5, -0.5),
                    vec3<f32>( 0.5,  0.5, -0.5),
                    vec3<f32>( 0.5,  0.5,  0.5),
                    // Left face
                    vec3<f32>(-0.5, -0.5, -0.5),
                    vec3<f32>(-0.5, -0.5,  0.5),
                    vec3<f32>(-0.5,  0.5,  0.5),
                    vec3<f32>(-0.5, -0.5, -0.5),
                    vec3<f32>(-0.5,  0.5,  0.5),
                    vec3<f32>(-0.5,  0.5, -0.5),
                );
                
                @vertex
                fn vertex_main(@builtin(instance_index) instanceIndex: u32, @builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
                    let cube = cubes[instanceIndex];
                    let vertex = CUBE_VERTICES[vertexIndex] * cube.size + cube.position;
                    
                    var output: VertexOutput;
                    output.position = camera.viewProjectionMatrix * vec4<f32>(vertex, 1.0);
                    output.color = cube.color;
                    output.normal = normalize(vertex - cube.position);
                    output.selected = cube.selected;
                    
                    return output;
                }
                
                @fragment
                fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
                    // Simple lighting
                    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
                    let ambient = 0.3;
                    let diffuse = max(dot(input.normal, lightDir), 0.0);
                    
                    // Selection highlight
                    let baseColor = input.color * (ambient + diffuse);
                    let selectionColor = mix(baseColor, vec3<f32>(1.0, 0.8, 0.0), input.selected * 0.5);
                    
                    return vec4<f32>(selectionColor, 1.0);
                }
            `
        };
        
        return shaders[name] || '';
    }
    
    render(camera, dataProcessor) {
        if (!this.device || !this.pipeline) return;
        
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
        
        // Create command encoder
        const commandEncoder = this.device.createCommandEncoder();
        
        // Begin render pass
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
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
        
        // Set pipeline and bind groups
        renderPass.setPipeline(this.pipeline);
        
        // Bind camera uniforms
        if (camera && camera.bindGroup) {
            renderPass.setBindGroup(0, camera.bindGroup);
        }
        
        // Bind cube data
        if (dataProcessor && dataProcessor.renderBindGroup) {
            renderPass.setBindGroup(1, dataProcessor.renderBindGroup);
            
            // Draw instanced cubes
            const instanceCount = dataProcessor.instanceCount || 0;
            if (instanceCount > 0) {
                // We're using a hardcoded vertex buffer with 36 vertices per cube
                renderPass.draw(36, instanceCount, 0, 0);
            }
        }
        
        renderPass.end();
        
        // Submit command buffer
        this.device.queue.submit([commandEncoder.finish()]);
    }
    
    cleanup() {
        if (this.depthTexture) {
            this.depthTexture.destroy();
        }
        // Add more cleanup as needed
    }
}
