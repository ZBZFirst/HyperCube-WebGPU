// webgpu/ui/selection.js - Simplified GPU-based Selection System
export class SelectionSystem {
    constructor(renderer, dataProcessor) {
        this.renderer = renderer;
        this.device = renderer.device;
        this.dataProcessor = dataProcessor;
        
        // Selection state
        this.selectedPMIDs = new Set();
        this.highlightedPMID = null;
        
        // Defer selection buffer creation until data is loaded
        this.selectionBuffer = null;
        this.selectionData = null; // CPU-side selection data
        
        this.init();
    }
    
    async init() {
        console.log('GPU Selection System initialized (deferred)');
    }
    
    // Call this after data is loaded
    async initializeSelectionBuffer() {
        if (!this.dataProcessor.instanceCount) {
            console.error('Cannot initialize selection buffer: no data loaded');
            return;
        }
        
        // Create selection buffer (one 32-bit integer per cube)
        const bufferSize = this.dataProcessor.instanceCount * 4; // 4 bytes per cube
        this.selectionBuffer = this.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false
        });
        
        // Initialize CPU-side selection data
        this.selectionData = new Uint32Array(this.dataProcessor.instanceCount);
        
        console.log(`Selection buffer created for ${this.dataProcessor.instanceCount} cubes`);
    }
    
    async selectByPMID(pmid, selected = true) {
        if (!this.dataProcessor.cubeData) {
            console.error('Cube data not loaded yet');
            return false;
        }
        
        // Find cube index by PMID
        const cubeIndex = this.dataProcessor.data.findIndex(article => article.PMID === pmid);
        if (cubeIndex === -1) {
            console.warn(`PMID ${pmid} not found in data`);
            return false;
        }
        
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
        
        // Update selection data
        if (this.selectionData) {
            this.selectionData[cubeIndex] = selected ? 1 : 0;
            
            // Update GPU buffer if it exists
            if (this.selectionBuffer) {
                const offset = cubeIndex * 4; // 4 bytes per Uint32
                const data = new Uint32Array([selected ? 1 : 0]);
                this.device.queue.writeBuffer(
                    this.selectionBuffer,
                    offset,
                    data.buffer,
                    data.byteOffset,
                    data.byteLength
                );
            }
        }
        
        console.log(`Cube ${cubeIndex} (PMID: ${pmid}) ${selected ? 'selected' : 'deselected'}`);
        return true;
    }
    
    async getSelected() {
        return Array.from(this.selectedPMIDs);
    }
    
    async clearSelection() {
        // Clear CPU selection
        this.selectedPMIDs.clear();
        this.highlightedPMID = null;
        
        // Clear GPU selection buffer
        if (this.selectionBuffer && this.selectionData) {
            this.selectionData.fill(0);
            this.device.queue.writeBuffer(
                this.selectionBuffer,
                0,
                this.selectionData.buffer,
                this.selectionData.byteOffset,
                this.selectionData.byteLength
            );
        }
        
        console.log('Selection cleared');
    }
    
    dispose() {
        if (this.selectionBuffer) {
            this.selectionBuffer.destroy();
        }
        console.log('GPU Selection System disposed');
    }
}
