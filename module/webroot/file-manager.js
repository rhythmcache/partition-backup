class FileManager {
    constructor() {
        this.currentPath = '/storage/emulated/0';
        this.mode = 'directory'; // 'directory' or 'image'
        this.onSelect = null;
        this.overlay = null;
        this.init();
    }

    init() {
        this.createOverlay();
        this.setupEventListeners();
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'file-manager-overlay';
        this.overlay.innerHTML = `
            <div class="file-manager">
                <div class="file-manager-header">
                    <h3 id="fileManagerTitle">Select Folder</h3>
                    <span class="file-manager-close" id="fileManagerClose">&times;</span>
                </div>
                <div class="file-manager-path" id="fileManagerPath"></div>
                <div class="file-manager-content" id="fileManagerContent">
                    <div class="file-manager-loading">
                        <div class="loader"></div>
                        <span style="margin-left: 8px;">Loading...</span>
                    </div>
                </div>
                <div class="file-manager-footer">
                    <button class="btn btn-small" id="fileManagerCancel">Cancel</button>
                    <button class="btn btn-save btn-small" id="fileManagerSelect">Select This Folder</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);
    }

    setupEventListeners() {
        document.getElementById('fileManagerClose').addEventListener('click', () => this.close());
        document.getElementById('fileManagerCancel').addEventListener('click', () => this.close());
        document.getElementById('fileManagerSelect').addEventListener('click', () => this.selectCurrent());
        
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
    }

    async open(mode = 'directory', onSelect = null) {
        this.mode = mode;
        this.onSelect = onSelect;
        this.currentPath = '/storage/emulated/0';
        
        const title = mode === 'directory' ? 'Select Folder' : 'Select Image File';
        document.getElementById('fileManagerTitle').textContent = title;
        
        const selectBtn = document.getElementById('fileManagerSelect');
        selectBtn.textContent = mode === 'directory' ? 'Select This Folder' : 'Select File';
        selectBtn.style.display = mode === 'directory' ? 'block' : 'none';
        
        this.overlay.style.display = 'flex';
        await this.loadDirectory();
    }

    close() {
        this.overlay.style.display = 'none';
    }

    async loadDirectory() {
        const content = document.getElementById('fileManagerContent');
        const pathElement = document.getElementById('fileManagerPath');
        
        content.innerHTML = `
            <div class="file-manager-loading">
                <div class="loader"></div>
                <span style="margin-left: 8px;">Loading...</span>
            </div>
        `;
        pathElement.textContent = this.currentPath;

        try {
            const items = await this.getDirectoryContents();
            this.renderItems(items);
        } catch (error) {
            console.error('Error loading directory:', error);
            content.innerHTML = `
                <div class="file-manager-item">
                    <span style="color: #ff4d4d;">Error loading directory</span>
                </div>
            `;
        }
    }

    async getDirectoryContents() {
        const items = [];
        
        
        if (this.currentPath !== '/storage/emulated/0') {
            items.push({
                name: '.. (Go Back)',
                type: 'back',
                path: this.getParentPath()
            });
        }

        try {
            // Get directories
            const { stdout: dirs } = await exec(`find "${this.currentPath}" -maxdepth 1 -type d -not -path "${this.currentPath}" 2>/dev/null | sort`);
            if (dirs.trim()) {
                dirs.split('\n').forEach(dirPath => {
                    const name = dirPath.split('/').pop();
                    if (name && !name.startsWith('.')) {
                        items.push({
                            name: name,
                            type: 'directory',
                            path: dirPath
                        });
                    }
                });
            }

            // Get .img s
            if (this.mode === 'image') {
                const { stdout: images } = await exec(`find "${this.currentPath}" -maxdepth 1 -type f -name "*.img" 2>/dev/null | sort`);
                if (images.trim()) {
                    images.split('\n').forEach(imgPath => {
                        const name = imgPath.split('/').pop();
                        if (name) {
                            items.push({
                                name: name,
                                type: 'image',
                                path: imgPath
                            });
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error getting directory contents:', error);
        }

        return items;
    }

    getParentPath() {
        const parts = this.currentPath.split('/').filter(p => p);
        parts.pop();
        return '/' + parts.join('/');
    }

    renderItems(items) {
        const content = document.getElementById('fileManagerContent');
        
        if (items.length === 0) {
            content.innerHTML = `
                <div class="file-manager-item">
                    <span style="color: var(--text-secondary);">No items found</span>
                </div>
            `;
            return;
        }

        content.innerHTML = items.map(item => `
            <div class="file-manager-item" data-path="${item.path}" data-type="${item.type}">
                ${this.getItemIcon(item.type)}
                <span class="file-manager-name">${item.name}</span>
            </div>
        `).join('');

        
        content.querySelectorAll('.file-manager-item').forEach(item => {
            item.addEventListener('click', () => this.handleItemClick(item));
        });
    }

    getItemIcon(type) {
        const icons = {
            back: `<svg class="file-manager-icon back-icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
            directory: `<svg class="file-manager-icon folder-icon" viewBox="0 0 24 24"><path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/></svg>`,
            image: `<svg class="file-manager-icon img-file-icon" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`
        };
        return icons[type] || icons.directory;
    }

    async handleItemClick(element) {
        const path = element.dataset.path;
        const type = element.dataset.type;

        if (type === 'back' || type === 'directory') {
            this.currentPath = path;
            await this.loadDirectory();
        } else if (type === 'image' && this.mode === 'image') {
            this.selectFile(path);
        }
    }

    selectCurrent() {
        if (this.mode === 'directory' && this.onSelect) {
            this.onSelect(this.currentPath);
            this.close();
        }
    }

    selectFile(filePath) {
        if (this.onSelect) {
            this.onSelect(filePath);
            this.close();
        }
    }
}

window.fileManager = new FileManager();
