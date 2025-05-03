let isEnvironmentSupported = false;
let partitionsFound = [];
let filteredPartitions = [];

function getUniqueCallbackName(prefix) {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

async function exec(command) {
    return new Promise((resolve, reject) => {
        const callbackName = getUniqueCallbackName('exec');
        window[callbackName] = (errno, stdout, stderr) => {
            resolve({ errno, stdout: stdout.trim(), stderr });
            delete window[callbackName];
        };
        try {
            ksu.exec(command, '{}', callbackName);
        } catch (error) {
            reject(error);
            delete window[callbackName];
        }
    });
}

function showConfirmDialog(title, message, onConfirm) {
    const dialog = document.getElementById('confirmDialog');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    
    document.getElementById('confirmYes').onclick = () => {
        onConfirm();
        dialog.style.display = 'none';
    };
    
    document.getElementById('confirmNo').onclick = () => {
        dialog.style.display = 'none';
    };
    
    dialog.style.display = 'flex';
}

function showProgressDialog(partitionName) {
    const dialog = document.getElementById('progressDialog');
    document.getElementById('currentPartition').textContent = `Backing up: ${partitionName}`;
    document.getElementById('progressStatus').textContent = 'Starting backup...';
    
    document.getElementById('cancelBackup').onclick = () => {
        // Add logic to cancel the backup process
        exec('pkill dd').then(() => {
            alert('Backup cancelled');
            dialog.style.display = 'none';
        }).catch(error => {
            console.error('Error cancelling backup:', error);
            alert('Failed to cancel backup');
        });
    };
    
    dialog.style.display = 'flex';
}

function closeProgressDialog() {
    document.getElementById('progressDialog').style.display = 'none';
}

async function findBootPartitionLocation() {
    // Check in /dev/block/by-name
    const { stdout: byNameExists } = await exec('[ -d "/dev/block/by-name" ] && echo "yes" || echo "no"');
    
    if (byNameExists === "yes") {
        const { stdout: bootExists } = await exec('[ -e "/dev/block/by-name/boot" -o -e "/dev/block/by-name/boot_a" ] && echo "yes" || echo "no"');
        
        if (bootExists === "yes") {
            return "/dev/block/by-name";
        }
    }
    
    // Check in /dev/block/bootdevice/by-name
    const { stdout: bootdeviceExists } = await exec('[ -d "/dev/block/bootdevice/by-name" ] && echo "yes" || echo "no"');
    
    if (bootdeviceExists === "yes") {
        const { stdout: bootExists } = await exec('[ -e "/dev/block/bootdevice/by-name/boot" -o -e "/dev/block/bootdevice/by-name/boot_a" ] && echo "yes" || echo "no"');
        
        if (bootExists === "yes") {
            return "/dev/block/bootdevice/by-name";
        }
    }
    
    // Check using proc cmdline
    const { stdout: bootDevice } = await exec('grep -o "androidboot.boot_devices=[^ ]*" /proc/cmdline | cut -d "=" -f2');
    
    if (bootDevice) {
        const path = `/dev/block/platform/${bootDevice}/by-name`;
        const { stdout: pathExists } = await exec(`[ -d "${path}" ] && echo "yes" || echo "no"`);
        
        if (pathExists === "yes") {
            return path;
        }
    }
    
    return null;
}

async function getPartitions(basePath) {
    if (!basePath) return [];
    
    const { stdout: partitionsList } = await exec(`ls -1 ${basePath}`);
    const partitions = partitionsList.split('\n').filter(p => p.trim() !== '');
    
    const result = [];
    for (const partition of partitions) {
        const { stdout: realPath } = await exec(`readlink -f ${basePath}/${partition}`);
        const { stdout: size } = await exec(`blockdev --getsize64 ${realPath} 2>/dev/null || echo "0"`);
        
        const sizeInMB = parseInt(size) / (1024 * 1024);
        const formattedSize = sizeInMB >= 1024 
            ? `${(sizeInMB / 1024).toFixed(1)} GB` 
            : `${sizeInMB.toFixed(1)} MB`;
        
        result.push({
            name: partition,
            path: realPath,
            size: formattedSize,
            sizeBytes: size
        });
    }
    
    return result;
}

async function backupPartition(partition) {
    try {
        showProgressDialog(partition.name);
        
        // Create the backup directory if it doesn't exist
        await exec('mkdir -p /storage/emulated/0/Backups');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `/storage/emulated/0/Backups/${partition.name}_${timestamp}.img`;
        
        // Use dd without status=progress option
        const ddCommand = `dd if=${partition.path} of=${backupFile} bs=8M conv=fsync,noerror`;
        
        // Update UI to show spinner
        document.getElementById('progressStatus').innerHTML = 'Backing up in progress...';
        
        // Execute the dd command
        const result = await exec(ddCommand);
        
        if (result.errno === 0) {
            document.getElementById('progressStatus').textContent = "Backup completed successfully!";
            setTimeout(() => {
                closeProgressDialog();
                alert(`Successfully backed up ${partition.name} to ${backupFile}`);
                updateLastBackup();
            }, 1000);
        } else {
            throw new Error(`dd command failed: ${result.stderr}`);
        }
        
    } catch (error) {
        console.error(`Backup failed: ${error}`);
        document.getElementById('progressStatus').textContent = "Backup failed!";
        setTimeout(() => {
            closeProgressDialog();
            alert(`Failed to backup ${partition.name}: ${error.message}`);
        }, 1000);
    }
}

async function backupAllPartitions() {
    const partitionsToBackup = filteredPartitions.length > 0 ? filteredPartitions : partitionsFound;
    
    showConfirmDialog(
        "Backup All Partitions",
        `Are you sure you want to backup all ${partitionsToBackup.length} partitions? This may take a while.`,
        async () => {
            // Sort partitions by size (smallest first)
            const sortedPartitions = [...partitionsToBackup].sort((a, b) => 
                parseInt(a.sizeBytes) - parseInt(b.sizeBytes)
            );
            
            for (const partition of sortedPartitions) {
                await backupPartition(partition);
            }
            
            alert("All partitions backup completed!");
        }
    );
}

async function updateStorageInfo() {
    try {
        const { stdout: available } = await exec('df -h /storage/emulated/0 | tail -1 | awk \'{print $4}\'');
        document.getElementById('storageAvailable').textContent = available;
    } catch (error) {
        console.error('Error getting storage info:', error);
        document.getElementById('storageAvailable').textContent = 'Error';
    }
}

async function updateLastBackup() {
    try {
        const { stdout: lastBackupFile } = await exec('ls -t /storage/emulated/0/Backups/*.img 2>/dev/null | head -1');
        
        if (lastBackupFile) {
            const { stdout: lastBackupTime } = await exec(`stat -c "%y" "${lastBackupFile}" | cut -d. -f1`);
            document.getElementById('lastBackup').textContent = lastBackupTime;
        } else {
            document.getElementById('lastBackup').textContent = 'Never';
        }
    } catch (error) {
        console.error('Error getting last backup:', error);
        document.getElementById('lastBackup').textContent = 'Error';
    }
}

function filterPartitions(searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') {
        filteredPartitions = [];
        renderPartitionList(partitionsFound);
        return;
    }
    
    searchTerm = searchTerm.toLowerCase();
    filteredPartitions = partitionsFound.filter(partition => 
        partition.name.toLowerCase().includes(searchTerm) || 
        partition.path.toLowerCase().includes(searchTerm)
    );
    
    renderPartitionList(filteredPartitions);
}

function renderPartitionList(partitionsToRender) {
    const partitionListElement = document.getElementById('partitionList');
    partitionListElement.innerHTML = '';
    
    if (partitionsToRender.length === 0) {
        partitionListElement.innerHTML = '<div class="no-partitions">No partitions found</div>';
        return;
    }
    
    partitionsToRender.forEach(partition => {
        const partitionElement = document.createElement('div');
        partitionElement.className = 'partition-item';
        
        partitionElement.innerHTML = `
            <div class="partition-info">
                <div class="partition-name">${partition.name}</div>
                <div class="partition-path">${partition.path}</div>
            </div>
            <div class="partition-action">
                <span class="partition-size">${partition.size}</span>
                <button class="btn btn-small backup-btn">Backup</button>
            </div>
        `;
        
        partitionListElement.appendChild(partitionElement);
        
        const backupButton = partitionElement.querySelector('.backup-btn');
        backupButton.addEventListener('click', () => {
            showConfirmDialog(
                "Backup Partition",
                `Are you sure you want to backup the ${partition.name} partition?`,
                () => backupPartition(partition)
            );
        });
    });
}

function setupSidebar() {
    const menuIcon = document.getElementById('menuIcon');
    const closeSidebar = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebarBackupStatus');
    
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    
    menuIcon.addEventListener('click', () => {
        sidebar.classList.add('active');
        overlay.style.display = 'block';
    });
    
    closeSidebar.addEventListener('click', () => {
        sidebar.classList.remove('active');
        overlay.style.display = 'none';
    });
    
    // Close sidebar when overlay is clicked
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        overlay.style.display = 'none';
    });
}

function setupSearchBar() {
    const searchInput = document.getElementById('searchInput');
    
    searchInput.addEventListener('input', (e) => {
        filterPartitions(e.target.value);
    });
}

async function init() {
    try {
        // Check if KernelSU environment is available
        if (typeof ksu === 'undefined') {
            alert('KernelSU environment not detected. This app requires KernelSU.');
            return;
        }
        
        isEnvironmentSupported = true;
        
        // Set up sidebar and search functionality
        setupSidebar();
        setupSearchBar();
        
        // Find partition path
        const partitionPath = await findBootPartitionLocation();
        
        if (!partitionPath) {
            document.getElementById('loading').innerHTML = 'Failed to find partition location';
            return;
        }
        
        // Get partitions
        partitionsFound = await getPartitions(partitionPath);
        
        // Hide loading indicator
        document.getElementById('loading').style.display = 'none';
        
        // Render partition list
        renderPartitionList(partitionsFound);
        
        // Update storage info
        await updateStorageInfo();
        
        // Update last backup info
        await updateLastBackup();
        
        // Setup backup all button
        document.getElementById('backupAllBtn').addEventListener('click', backupAllPartitions);
        
    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('loading').innerHTML = `Error: ${error.message}`;
    }
}

function openLink(url) {
            if (typeof ksu !== 'undefined' && ksu.exec) {
                ksu.exec(`am start -a android.intent.action.VIEW -d "${url}"`, '{}', 'openLink_callback');
            } else {
                window.open(url, '_blank');
            }
        }

// Initialize when the page loads
window.addEventListener('load', init);
