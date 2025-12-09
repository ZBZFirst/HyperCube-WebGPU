// webgpu/ui/selection.js - GPU-based Selection System
export class SelectionSystem {
    constructor(renderer, dataProcessor) {
        this.renderer = renderer;
        this.device = renderer.device;
        this.dataProcessor = dataProcessor;
        
        // Selection state
        this.selectedPMIDs = new Set();
        this.highlightedPMID = null;
        
        // GPU buffers for selection
        this.selectionBuffer = null;
        this.selectionStagingBuffer = null;
        
        // Compute pipeline for GPU selection
        this.selectionPipeline = null;
        this.selectionBindGroup = null;
        
        // Ray-casting for mouse picking
        this.rayOrigin = new Float32Array(3);
        this.rayDirection = new Float32Array(3);
        
        // Event listeners for projectiles
        this.projectileListeners = [];
        
        this.init();
    }
    
    async init() {
        await this.createSelectionBuffers();
        await this.createSelectionPipeline();
        this.setupEventListeners();
        
        console.log('GPU Selection System initialized');
    }
    
    async createSelectionBuffers() {
        // Create GPU buffer for selection state (1 byte per cube: 0 = not selected, 1 = selected)
        const bufferSize = Math.ceil(this.dataProcessor.instanceCount / 8); // 1 bit per cube
        this.selectionBuffer = this.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });
        
        // Staging buffer for reading back selection data
        this.selectionStagingBuffer = this.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
        
        // Initialize with zeros (no selections)
        const zeroData = new Uint8Array(bufferSize).fill(0);
        this.device.queue.writeBuffer(this.selectionBuffer, 0, zeroData);
    }
    
    async createSelectionPipeline() {
        // Load selection compute shader
        const selectionShaderCode = `
            // Selection compute shader
            
            struct CubeData {
                position: vec3<f32>,
                color: vec3<f32>,
                size: f32,
                pmid: u32,
            };
            
            struct SelectionData {
                selected: array<u32>,
            };
            
            @group(0) @binding(0) var<storage, read> cubes: array<CubeData>;
            @group(0) @binding(1) var<storage, read_write> selection: SelectionData;
            
            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let cube_index = global_id.x;
                if (cube_index >= arrayLength(&cubes)) {
                    return;
                }
                
                // Selection logic would go here
                // For now, just pass through existing selection
            }
        `;
        
        const selectionShaderModule = this.device.createShaderModule({
            code: selectionShaderCode
        });
        
        // Create compute pipeline for selection updates
        this.selectionPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: selectionShaderModule,
                entryPoint: 'main'
            }
        });
        
        // Create bind group
        this.selectionBindGroup = this.device.createBindGroup({
            layout: this.selectionPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.dataProcessor.cubeData }
                },
                {
                    binding: 1,
                    resource: { buffer: this.selectionBuffer }
                }
            ]
        });
    }
    
    setupEventListeners() {
        // Listen for projectile events from controls
        document.addEventListener('projectile-fired', this.handleProjectile.bind(this));
        
        // Listen for table row clicks
        document.addEventListener('click', this.handleTableClick.bind(this));
    }
    
    async selectByPMID(pmid, selected = true) {
        // Find cube index by PMID
        const cubeIndex = this.dataProcessor.data.findIndex(article => article.PMID === pmid);
        if (cubeIndex === -1) return false;
        
        // Update CPU selection state
        if (selected) {
            this.selectedPMIDs.add(pmid);
            this.highlightedPMID = pmid;
        } else {
            this.selectedPMIDs.delete(pmid);
            if (this.highlightedPMID === pmid) {
                this.highlightedPMID = null;
            }
        }
        
        // Update GPU selection buffer
        await this.updateGPUSelection(cubeIndex, selected);
        
        // Update cube colors (highlight selected cubes)
        await this.updateCubeHighlighting();
        
        return true;
    }
    
    async updateGPUSelection(cubeIndex, selected) {
        // Calculate byte and bit position
        const byteIndex = Math.floor(cubeIndex / 8);
        const bitIndex = cubeIndex % 8;
        
        // Read current byte
        const currentByte = await this.readSelectionByte(byteIndex);
        
        // Update bit
        let updatedByte = currentByte;
        if (selected) {
            updatedByte |= (1 << bitIndex);
        } else {
            updatedByte &= ~(1 << bitIndex);
        }
        
        // Write back to GPU
        const byteArray = new Uint8Array([updatedByte]);
        this.device.queue.writeBuffer(
            this.selectionBuffer,
            byteIndex,
            byteArray.buffer,
            byteArray.byteOffset,
            byteArray.byteLength
        );
    }
    
    async readSelectionByte(byteIndex) {
        // Copy from GPU to staging buffer
        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
            this.selectionBuffer,
            byteIndex,
            this.selectionStagingBuffer,
            0,
            1
        );
        
        this.device.queue.submit([commandEncoder.finish()]);
        
        // Map and read
        await this.selectionStagingBuffer.mapAsync(GPUMapMode.READ, 0, 1);
        const arrayBuffer = this.selectionStagingBuffer.getMappedRange(0, 1);
        const byte = new Uint8Array(arrayBuffer)[0];
        this.selectionStagingBuffer.unmap();
        
        return byte;
    }
    
    async updateCubeHighlighting() {
        // This would update the cube colors in the GPU buffer
        // For now, we'll just trigger a re-render
        
        // In a full implementation, we'd update the cubeData buffer
        // to change colors of selected cubes
        console.log('Selection updated:', Array.from(this.selectedPMIDs));
    }
    
    async handleProjectile(event) {
        const { origin, direction } = event.detail;
        
        // Simple CPU ray-casting for now
        // In production, this should be done on GPU with compute shaders
        const hitCube = await this.rayCast(origin, direction);
        
        if (hitCube) {
            await this.selectByPMID(hitCube.pmid, true);
            
            // Dispatch selection event
            const selectionEvent = new CustomEvent('cube-selected', {
                detail: { pmid: hitCube.pmid, article: hitCube.article }
            });
            document.dispatchEvent(selectionEvent);
        }
    }
    
    async rayCast(origin, direction) {
        // Simplified CPU ray-casting
        // This should be replaced with GPU compute shaders for large datasets
        
        const cubes = this.dataProcessor.data;
        let closestHit = null;
        let closestDistance = Infinity;
        
        for (let i = 0; i < cubes.length; i++) {
            const cube = cubes[i];
            const position = this.dataProcessor.calculatePosition(cube, i);
            const size = 0.8; // Cube size
            
            // Simple sphere intersection (good enough for demo)
            const sphereRadius = size * 1.5; // Slightly larger than cube for easier selection
            
            const oc = [
                origin[0] - position[0],
                origin[1] - position[1],
                origin[2] - position[2]
            ];
            
            const a = direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2];
            const b = 2 * (oc[0] * direction[0] + oc[1] * direction[1] + oc[2] * direction[2]);
            const c = (oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2]) - (sphereRadius * sphereRadius);
            
            const discriminant = b * b - 4 * a * c;
            
            if (discriminant >= 0) {
                const distance = (-b - Math.sqrt(discriminant)) / (2 * a);
                if (distance > 0 && distance < closestDistance) {
                    closestDistance = distance;
                    closestHit = {
                        index: i,
                        pmid: cube.PMID,
                        article: cube,
                        distance: distance
                    };
                }
            }
        }
        
        return closestHit;
    }
    
    handleTableClick(event) {
        // Check if click was on a table row with PMID
        const row = event.target.closest('tr[data-pmid]');
        if (row) {
            const pmid = row.dataset.pmid;
            const checkbox = row.querySelector('input[type="checkbox"]');
            const isSelected = checkbox ? checkbox.checked : true;
            
            this.selectByPMID(pmid, isSelected);
        }
    }
    
    async getSelected() {
        return Array.from(this.selectedPMIDs);
    }
    
    async clearSelection() {
        // Clear CPU selection
        this.selectedPMIDs.clear();
        this.highlightedPMID = null;
        
        // Clear GPU selection buffer
        const bufferSize = this.selectionBuffer.size;
        const zeroData = new Uint8Array(bufferSize).fill(0);
        this.device.queue.writeBuffer(this.selectionBuffer, 0, zeroData);
        
        // Update cube highlighting
        await this.updateCubeHighlighting();
    }
    
    async deleteArticles(pmids) {
        // Remove from CPU selection
        pmids.forEach(pmid => this.selectedPMIDs.delete(pmid));
        
        // Recreate selection buffer with new size
        await this.createSelectionBuffers();
    }
    
    dispose() {
        // Clean up event listeners
        document.removeEventListener('projectile-fired', this.handleProjectile);
        document.removeEventListener('click', this.handleTableClick);
        
        // Clean up buffers
        if (this.selectionBuffer) this.selectionBuffer.destroy();
        if (this.selectionStagingBuffer) this.selectionStagingBuffer.destroy();
        
        console.log('GPU Selection System disposed');
    }
}
