// WebGPU Data Processor for PubMed Data
export class DataProcessor {
    constructor(renderer) {
        this.renderer = renderer;
        this.device = renderer.device;
        
        this.data = [];
        this.cubeData = null; // GPU buffer for cube instances
        this.instanceCount = 0;
        
        this.computePipeline = null;
        this.renderBindGroup = null;
        
        this.layoutMode = 'grid';
    }
    
    async uploadData(data) {
        this.data = data;
        this.instanceCount = data.length;
        
        // Create GPU buffer for cube instances
        const cubeDataSize = this.instanceCount * 32; // Each cube: position(12) + color(12) + size(4) + selected(4)
        this.cubeData = this.device.createBuffer({
            size: cubeDataSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // Initial CPU processing and GPU upload
        await this.processData();
        
        // Create bind group for rendering
        this.createRenderBindGroup();
    }
    
    async processData() {
        // Process data on CPU initially, then we'll move this to GPU compute shaders
        const cubeInstances = new Float32Array(this.instanceCount * 8); // 8 floats per instance
        
        for (let i = 0; i < this.data.length; i++) {
            const article = this.data[i];
            const baseIdx = i * 8;
            
            // Calculate position based on layout mode
            const position = this.calculatePosition(article, i);
            
            // Calculate color based on year
            const color = this.calculateColor(article);
            
            // Size (default 0.8)
            const size = 0.8;
            
            // Selected flag (0 or 1)
            const selected = 0;
            
            cubeInstances[baseIdx + 0] = position[0];
            cubeInstances[baseIdx + 1] = position[1];
            cubeInstances[baseIdx + 2] = position[2];
            
            cubeInstances[baseIdx + 3] = color[0];
            cubeInstances[baseIdx + 4] = color[1];
            cubeInstances[baseIdx + 5] = color[2];
            
            cubeInstances[baseIdx + 6] = size;
            cubeInstances[baseIdx + 7] = selected;
        }
        
        // Upload to GPU
        this.device.queue.writeBuffer(
            this.cubeData,
            0,
            cubeInstances.buffer,
            cubeInstances.byteOffset,
            cubeInstances.byteLength
        );
    }
    
    calculatePosition(article, index) {
        switch (this.layoutMode) {
            case 'year':
                return this.positionByYear(article, index);
            case 'journal':
                return this.positionByJournal(article, index);
            case 'cluster':
                return this.positionByCluster(article, index);
            case 'grid':
            default:
                return this.positionByGrid(article, index);
        }
    }
    
    positionByGrid(article, index) {
        const gridSize = Math.ceil(Math.sqrt(this.instanceCount));
        const x = (index % gridSize - gridSize / 2) * 2.5;
        const z = (Math.floor(index / gridSize) - gridSize / 2) * 2.5;
        return [x, 0, z];
    }
    
    positionByYear(article, index) {
        const year = parseInt(article.PubYear) || 2000;
        const yearOffset = (year - 1990) * 3; // Group by year
        
        const yearData = this.data.filter(a => a.PubYear === article.PubYear);
        const yearIndex = yearData.findIndex(a => a.PMID === article.PMID);
        
        return [yearOffset, yearIndex * 1.5, 0];
    }
    
    positionByJournal(article, index) {
        // Simplified journal grouping
        const journals = [...new Set(this.data.map(a => a.Source))];
        const journalIndex = journals.indexOf(article.Source);
        const angle = (journalIndex / journals.length) * Math.PI * 2;
        const radius = 15;
        
        return [
            Math.cos(angle) * radius,
            Math.random() * 5,
            Math.sin(angle) * radius
        ];
    }
    
    positionByCluster(article, index) {
        // Simple random cluster for now
        const clusterSize = Math.ceil(Math.sqrt(this.instanceCount / 4));
        const clusterX = Math.floor(index / clusterSize);
        const clusterZ = index % clusterSize;
        
        return [
            clusterX * 6 + (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 3,
            clusterZ * 6 + (Math.random() - 0.5) * 2
        ];
    }
    
    calculateColor(article) {
        // Color based on publication year
        const year = parseInt(article.PubYear) || 2000;
        const minYear = 1950;
        const maxYear = new Date().getFullYear();
        const normalized = Math.min(1, Math.max(0, (year - minYear) / (maxYear - minYear)));
        
        // Interpolate from blue to red
        const r = normalized;
        const g = 0.2;
        const b = 1 - normalized;
        
        return [r, g, b];
    }
    
    createRenderBindGroup() {
        const bindGroupLayout = this.renderer.pipeline.getBindGroupLayout(1);
        
        this.renderBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: {
                    buffer: this.cubeData
                }
            }]
        });
    }
    
    setLayoutMode(mode) {
        this.layoutMode = mode;
    }
    
    async recomputeLayout() {
        // This should be done with a compute shader for large datasets
        await this.processData();
    }
    
    async deleteArticles(pmids) {
        // Remove articles from data
        this.data = this.data.filter(article => !pmids.includes(article.PMID));
        this.instanceCount = this.data.length;
        
        // Re-process data
        await this.processData();
    }
}
