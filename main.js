// WebGPU HyperCube Main Application
import { WebGPURenderer } from './webgpu/core/renderer.js';
import { CameraSystem } from './webgpu/core/camera.js';
import { DataProcessor } from './webgpu/data/processor.js';
import { Controls } from './webgpu/ui/controls.js';
import { SelectionSystem } from './webgpu/ui/selection.js';

class WebGPUHyperCube {
    constructor() {
        this.canvas = document.getElementById('webgpu-canvas');
        this.status = document.getElementById('gpu-status');
        this.fpsElement = document.getElementById('gpu-fps');
        this.cubesElement = document.getElementById('gpu-cubes');
        this.modeElement = document.getElementById('gpu-mode');
        
        this.renderer = null;
        this.camera = null;
        this.dataProcessor = null;
        this.controls = null;
        this.selection = null;
        
        this.data = [];
        this.cubeCount = 0;
        this.lastTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        
        this.viewMode = 'grid';
        
        this.init();
    }
    
    async init() {
        try {
            this.updateStatus('Checking WebGPU support...');
            
            // Check for WebGPU support
            if (!navigator.gpu) {
                throw new Error('WebGPU not supported in this browser');
            }
            
            // Initialize WebGPU
            this.updateStatus('Initializing WebGPU...');
            this.renderer = new WebGPURenderer(this.canvas);
            await this.renderer.initialize();
            
            // Initialize systems
            this.updateStatus('Setting up camera...');
            this.camera = new CameraSystem(this.renderer);
            
            this.updateStatus('Setting up data processor...');
            this.dataProcessor = new DataProcessor(this.renderer);
            
            this.updateStatus('Setting up controls...');
            this.controls = new Controls(this.canvas, this.camera);
            
            this.updateStatus('Setting up selection system...');
            this.selection = new SelectionSystem(this.renderer, this.dataProcessor);
            
            // Load PubMed data
            this.updateStatus('Loading PubMed data...');
            await this.loadData();
            
            // Setup UI event listeners
            this.setupUI();
            
            // Start animation loop
            this.updateStatus('Starting WebGPU rendering...');
            this.status.style.display = 'none';
            
            requestAnimationFrame(this.animate.bind(this));
            
        } catch (error) {
            console.error('WebGPU initialization failed:', error);
            this.updateStatus(`Error: ${error.message}`, true);
            this.fallbackToCanvas();
        }
    }
    
    async loadData() {
        try {
            // Try to load from CSV first
            const response = await fetch('assets/pubmed_data.csv');
            if (response.ok) {
                const csvText = await response.text();
                this.data = this.parseCSV(csvText);
            } else {
                // Fallback: use hardcoded data or fetch from PubMed API
                this.data = await this.fetchPubMedData();
            }
            
            this.cubeCount = this.data.length;
            this.cubesElement.textContent = `${this.cubeCount} cubes`;
            
            // Upload data to GPU
            await this.dataProcessor.uploadData(this.data);
            
            // Setup initial view
            this.setViewMode('grid');
            
        } catch (error) {
            console.error('Failed to load data:', error);
            this.updateStatus('Failed to load data. Using sample data.', true);
            this.data = this.createSampleData();
            await this.dataProcessor.uploadData(this.data);
        }
    }
    
    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            const item = {};
            
            headers.forEach((header, index) => {
                item[header.trim()] = values[index] ? values[index].trim() : '';
            });
            
            data.push(item);
        }
        
        return data;
    }
    
    async fetchPubMedData() {
        // Simplified PubMed fetch - you can expand this
        const searchTerm = 'Liquid Mechanical Ventilation Life Support Humans';
        const response = await fetch(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerm)}&retmax=100&retmode=json`
        );
        
        const result = await response.json();
        const pmids = result.esearchresult.idlist;
        
        // Fetch details for each PMID (simplified)
        const data = [];
        for (const pmid of pmids.slice(0, 50)) { // Limit to 50 for demo
            data.push({
                PMID: pmid,
                Title: `PubMed Article ${pmid}`,
                PubYear: Math.floor(Math.random() * 30) + 1990,
                Source: 'Journal of Medicine',
                Abstract: 'Abstract text would appear here...',
                includeArticle: 'true'
            });
        }
        
        return data;
    }
    
    createSampleData() {
        const sampleData = [];
        for (let i = 0; i < 100; i++) {
            sampleData.push({
                PMID: `sample${i}`,
                Title: `Sample Article ${i + 1}`,
                PubYear: Math.floor(Math.random() * 30) + 1990,
                Source: ['Nature', 'Science', 'JAMA', 'NEJM'][Math.floor(Math.random() * 4)],
                Abstract: 'This is a sample abstract for demonstration purposes.',
                includeArticle: 'true'
            });
        }
        return sampleData;
    }
    
    setupUI() {
        // View mode buttons
        document.querySelectorAll('.view-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.setViewMode(mode);
                
                // Update button states
                document.querySelectorAll('.view-button').forEach(btn => {
                    btn.classList.toggle('active', btn === e.currentTarget);
                });
            });
        });
        
        // Delete button
        document.getElementById('delete-btn').addEventListener('click', () => {
            this.deleteSelected();
        });
        
        // Download button
        document.getElementById('download-btn').addEventListener('click', () => {
            this.downloadData();
        });
        
        // Table row clicks (for selection)
        document.getElementById('data-table').addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.pmid) {
                this.selectArticle(row.dataset.pmid, e.target.type === 'checkbox' ? e.target.checked : true);
            }
        });
    }
    
    setViewMode(mode) {
        this.viewMode = mode;
        this.modeElement.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
        
        // Update GPU compute shader with new layout
        this.dataProcessor.setLayoutMode(mode);
        
        // Trigger GPU recomputation
        this.dataProcessor.recomputeLayout();
    }
    
    async selectArticle(pmid, selected) {
        // Update selection on GPU
        await this.selection.selectByPMID(pmid, selected);
        
        // Update table UI
        const row = document.querySelector(`tr[data-pmid="${pmid}"]`);
        if (row) {
            row.classList.toggle('selected', selected);
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = selected;
        }
        
        // Update text zone if selected
        if (selected) {
            const article = this.data.find(d => d.PMID === pmid);
            if (article) {
                this.updateTextZone(article);
            }
        }
    }
    
    updateTextZone(article) {
        document.getElementById('selected-title').textContent = article.Title || 'No title';
        document.getElementById('pmid-text').textContent = article.PMID || '-';
        document.getElementById('year-text').textContent = article.PubYear || '-';
        document.getElementById('source-text').textContent = article.Source || '-';
        document.getElementById('abstract-text').textContent = article.Abstract || 'No abstract';
    }
    
    async deleteSelected() {
        const selected = await this.selection.getSelected();
        if (selected.length === 0) {
            alert('Please select articles first');
            return;
        }
        
        if (confirm(`Delete ${selected.length} selected articles?`)) {
            // Update data on GPU
            await this.dataProcessor.deleteArticles(selected);
            
            // Update local data
            this.data = this.data.filter(article => !selected.includes(article.PMID));
            this.cubeCount = this.data.length;
            this.cubesElement.textContent = `${this.cubeCount} cubes`;
            
            // Clear selection
            await this.selection.clearSelection();
            
            // Update table
            this.updateDataTable();
        }
    }
    
    downloadData() {
        const csvContent = this.convertToCSV(this.data);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pubmed_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    convertToCSV(data) {
        if (!data.length) return '';
        const headers = Object.keys(data[0]);
        const rows = data.map(row => 
            headers.map(header => 
                `"${String(row[header] || '').replace(/"/g, '""')}"`
            ).join(',')
        );
        return [headers.join(','), ...rows].join('\n');
    }
    
    updateDataTable() {
        const tbody = document.querySelector('#data-table tbody');
        tbody.innerHTML = '';
        
        this.data.forEach(article => {
            const row = document.createElement('tr');
            row.dataset.pmid = article.PMID;
            
            // Title
            const titleCell = document.createElement('td');
            titleCell.textContent = (article.Title || '').substring(0, 50) + 
                                  ((article.Title || '').length > 50 ? '...' : '');
            row.appendChild(titleCell);
            
            // Checkbox
            const checkboxCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'select-checkbox';
            checkboxCell.appendChild(checkbox);
            row.appendChild(checkboxCell);
            
            // Add more cells as needed...
            
            tbody.appendChild(row);
        });
    }
    
    updateStatus(message, isError = false) {
        this.status.textContent = message;
        this.status.style.color = isError ? '#ff4444' : '#4CAF50';
        this.status.style.borderColor = isError ? '#ff4444' : '#4CAF50';
        this.status.classList.toggle('webgpu-loading', !isError);
    }
    
    fallbackToCanvas() {
        this.status.textContent = 'WebGPU not available. Using canvas fallback.';
        this.status.style.color = '#FF9800';
        this.status.style.borderColor = '#FF9800';
        
        // Simple 2D canvas fallback
        const ctx = this.canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('WebGPU not supported', this.canvas.width / 2, this.canvas.height / 2);
        ctx.font = '16px Arial';
        ctx.fillText('Please use Chrome 113+, Edge 113+, or Safari 17+', this.canvas.width / 2, this.canvas.height / 2 + 30);
    }
    
    animate(currentTime) {
        // Calculate FPS
        this.frameCount++;
        if (currentTime - this.lastTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.fpsElement.textContent = `${this.fps} FPS`;
            this.frameCount = 0;
            this.lastTime = currentTime;
        }
        
        // Update controls
        if (this.controls) {
            this.controls.update();
        }
        
        // Render frame
        if (this.renderer && this.dataProcessor) {
            this.renderer.render(this.camera, this.dataProcessor);
        }
        
        requestAnimationFrame(this.animate.bind(this));
    }
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WebGPUHyperCube();
});

// Export for debugging
window.WebGPUHyperCube = WebGPUHyperCube;
