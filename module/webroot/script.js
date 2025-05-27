let isEnvironmentSupported = false;
let partitionsFound = [];
let filteredPartitions = [];
let isSelectionMode = false;
let selectedPartitions = [];
let isDynamicPartition = false;
let currentActiveSlot = "";
let isHidingInactiveSlots = false;
let saveMD5 = localStorage.getItem('saveMD5') === 'true';


function getUniqueCallbackName(prefix) {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}


function showEnvironmentDialog() {
    const dialog = document.getElementById('environmentDialog');
    dialog.style.display = 'flex';
    dialog.style.zIndex = '9999';   
    document.getElementById('closeApp').addEventListener('click', () => {
        window.location.reload();
    });   
    document.querySelectorAll('.container, .header, .card').forEach(element => {
        element.style.pointerEvents = 'none';
    });
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


function setupInactiveSlotToggle() {
    const toggleCheckbox = document.getElementById('hideInactiveToggle');
    toggleCheckbox.addEventListener('change', function() {
        isHidingInactiveSlots = this.checked;
        applyPartitionFilter();
    });
}


async function checkDynamicPartitions() {
    try {
        const { stdout: isDynamic } = await exec('getprop ro.boot.dynamic_partitions');
        isDynamicPartition = isDynamic.trim() === 'true';
        const dynamicSection = document.getElementById('dynamicPartitionSection');
        const dynamicStatus = document.getElementById('dynamicPartitionStatus');
        
        if (isDynamicPartition) {
            dynamicSection.style.display = 'block';
            dynamicStatus.textContent = 'Yes';
            document.querySelector('.dynamic-status').classList.add('active');
            const { stdout: slotSuffix } = await exec('getprop ro.boot.slot_suffix');
            currentActiveSlot = slotSuffix.trim();
            document.getElementById('activeSlotInfo').textContent = 
                currentActiveSlot === '_a' ? 'A' : 
                currentActiveSlot === '_b' ? 'B' : 
                currentActiveSlot;
            setupInactiveSlotToggle();
        } else {
            dynamicSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking dynamic partitions:', error);
        document.getElementById('dynamicPartitionSection').style.display = 'none';
    }
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
    const { stdout: byNameExists } = await exec('[ -d "/dev/block/by-name" ] && echo "yes" || echo "no"');
    if (byNameExists.trim() === "yes") {
        const { stdout: bootExists } = await exec('[ -e "/dev/block/by-name/boot" -o -e "/dev/block/by-name/boot_a" ] && echo "yes" || echo "no"');
        if (bootExists.trim() === "yes") {
            return "/dev/block/by-name";
        }
    }
    const { stdout: bootdeviceExists } = await exec('[ -d "/dev/block/bootdevice/by-name" ] && echo "yes" || echo "no"');
    if (bootdeviceExists.trim() === "yes") {
        const { stdout: bootExists } = await exec('[ -e "/dev/block/bootdevice/by-name/boot" -o -e "/dev/block/bootdevice/by-name/boot_a" ] && echo "yes" || echo "no"');
        if (bootExists.trim() === "yes") {
            return "/dev/block/bootdevice/by-name";
        }
    }
    const { stdout: bootPath } = await exec('find /dev/block/platform -name "boot*" | head -n1 | xargs dirname');
    if (bootPath.trim()) {
        return bootPath.trim();
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



function generateMD5ForFile(filePath, callback) {
    const command = `md5sum "${filePath}" | awk '{print $1}'`;
    ksu.exec(command, function (code, stdout, stderr) {
        if (code === 0) {
            const md5sum = stdout.trim();
            const md5Path = filePath + ".md5";
            ksu.exec(`echo "${md5sum}" > "${md5Path}"`, function (c, out, err) {
                if (c === 0) {
                    console.log(`MD5 saved to ${md5Path}`);
                    callback && callback(true);
                } else {
                    console.error(`Failed to write MD5 to file: ${err}`);
                    callback && callback(false);
                }
            });
        } else {
            console.error(`MD5 generation failed: ${stderr}`);
            callback && callback(false);
        }
    });
}



async function backupPartition(partition, isMultiBackup = false, currentIndex = 0, totalCount = 1) {
    try {
        if (!isMultiBackup || currentIndex === 0) {
            showProgressDialog(partition.name, isMultiBackup, currentIndex, totalCount);
        } else {
            updateProgressDialogInfo(partition.name, currentIndex, totalCount);
        }

        await exec('mkdir -p /storage/emulated/0/PartitionBackup');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `/storage/emulated/0/PartitionBackup/${partition.name}_${timestamp}.img`;
        const ddCommand = `dd if=${partition.path} of=${backupFile} bs=8M conv=fsync,noerror`;

        document.getElementById('progressStatus').innerHTML = 'Backing up in progress...';
        const result = await exec(ddCommand);

        if (result.errno === 0) {
            // If MD5 is enabled, compute checksum
            if (saveMD5) {
                document.getElementById('progressStatus').textContent = "Generating MD5 checksum...";
                const md5Command = `md5sum "${backupFile}" | awk '{print $1}' > "${backupFile}.md5"`;
                const md5Result = await exec(md5Command);
                if (md5Result.errno !== 0) {
                    console.warn(`Failed to save MD5 for ${partition.name}: ${md5Result.stderr}`);
                }
            }

            document.getElementById('progressStatus').textContent = isMultiBackup ?
                `Completed ${currentIndex + 1} of ${totalCount} partitions` :
                "Backup completed successfully!";

            if (!isMultiBackup) {
                setTimeout(() => {
                    closeProgressDialog();
                    alert(`Successfully backed up ${partition.name} to ${backupFile}`);
                    updateLastBackup();
                }, 1000);
            } else {
                updateLastBackup();
                if (currentIndex === totalCount - 1) {
                    setTimeout(() => {
                        closeProgressDialog();
                        alert("All partitions backup completed!");
                    }, 1000);
                }
            }
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


function updateProgressDialogInfo(partitionName, currentIndex, totalCount) {
    document.getElementById('currentPartition').textContent = `Backing up: ${partitionName}`;
    document.getElementById('progressStatus').textContent = `Progress: ${currentIndex + 1} of ${totalCount} partitions`;
}



function showProgressDialog(partitionName, isMultiBackup = false, currentIndex = 0, totalCount = 1) {
    const dialog = document.getElementById('progressDialog');   
    if (isMultiBackup) {
        document.getElementById('currentPartition').textContent = `Backing up: ${partitionName}`;
        document.getElementById('progressStatus').textContent = `Progress: ${currentIndex + 1} of ${totalCount} partitions`;
    } else {
        document.getElementById('currentPartition').textContent = `Backing up: ${partitionName}`;
        document.getElementById('progressStatus').textContent = 'Starting backup...';
    } 
    document.getElementById('cancelBackup').onclick = () => {
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


async function backupAllPartitions() {
    const partitionsToBackup = filteredPartitions.length > 0 ? filteredPartitions : partitionsFound;   
    showConfirmDialog(
        "Backup All Partitions",
        `Are you sure you want to backup all ${partitionsToBackup.length} partitions? This may take a while.`,
        async () => {
            const sortedPartitions = [...partitionsToBackup].sort((a, b) => 
                parseInt(a.sizeBytes) - parseInt(b.sizeBytes)
            );
            for (let i = 0; i < sortedPartitions.length; i++) {
                await backupPartition(sortedPartitions[i], true, i, sortedPartitions.length);
            }
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
    let filtered = partitionsFound;
    if (searchTerm && searchTerm.trim() !== '') {
        searchTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(partition => 
            partition.name.toLowerCase().includes(searchTerm) || 
            partition.path.toLowerCase().includes(searchTerm)
        );
    }
    if (isDynamicPartition && isHidingInactiveSlots && currentActiveSlot) {
        const inactiveSlot = currentActiveSlot === '_a' ? '_b' : '_a';
        filtered = filtered.filter(partition => !partition.name.endsWith(inactiveSlot));
    }
    filteredPartitions = filtered;
    renderPartitionList(filteredPartitions);
}


function applyPartitionFilter() {
    const searchTerm = document.getElementById('searchInput').value;
    filterPartitions(searchTerm);
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
        if (isSelectionMode) {
            partitionElement.classList.add('selectable');
            const isSelected = selectedPartitions.some(p => p.name === partition.name);
            if (isSelected) {
                partitionElement.classList.add('selected');
            }
        }     
        partitionElement.innerHTML = `
            <div class="partition-info">
                <img src="logo.svg" alt="IMG" class="partition-image">
                <div>
                    <div class="partition-name">${partition.name}</div>
                    <div class="partition-path">${partition.path}</div>
                </div>
            </div>
            <div class="partition-action">
                <span class="partition-size">${partition.size}</span>
                ${isSelectionMode ? '' : '<button class="btn btn-small backup-btn">Backup</button>'}
                <div class="selection-checkbox"></div>
            </div>
        `;
        partitionListElement.appendChild(partitionElement);
        if (!isSelectionMode) {
            const backupButton = partitionElement.querySelector('.backup-btn');
            backupButton.addEventListener('click', () => {
                showConfirmDialog(
                    "Backup Partition",
                    `Are you sure you want to backup the ${partition.name} partition?`,
                    () => backupPartition(partition)
                );
            });
        }
        let longPressTimer;   
        partitionElement.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => {
                if (!isSelectionMode) {
                    toggleSelectionMode(true);
                }
                toggleItemSelection(partitionElement, partition);
            }, 500);
        });      
        partitionElement.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        });
        
        partitionElement.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        });
        partitionElement.addEventListener('mousedown', (e) => {
            longPressTimer = setTimeout(() => {
                if (!isSelectionMode) {
                    toggleSelectionMode(true);
                }
                toggleItemSelection(partitionElement, partition);
            }, 500);
        });
        partitionElement.addEventListener('mouseup', () => {
            clearTimeout(longPressTimer);
        });
        partitionElement.addEventListener('mouseleave', () => {
            clearTimeout(longPressTimer);
        });
        partitionElement.addEventListener('click', () => {
            if (isSelectionMode) {
                toggleItemSelection(partitionElement, partition);
            }
        });
    });
}



function setupSidebar() {
    const menuIcon = document.getElementById('menuIcon');
    const closeSidebar = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebarBackupStatus');
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



function toggleSelectionMode(enable) {
    isSelectionMode = enable;
    const selectionIndicator = document.getElementById('selectionModeIndicator');
    const backupAllBtn = document.getElementById('backupAllBtn');
    const backupSelectedBtn = document.getElementById('backupSelectedBtn');
    if (enable) {
        selectionIndicator.classList.add('active');
        backupAllBtn.style.display = 'none';
        backupSelectedBtn.style.display = 'block';
        document.querySelectorAll('.partition-item').forEach(item => {
            item.classList.add('selectable');
        });
    } else {
        selectionIndicator.classList.remove('active');
        backupAllBtn.style.display = 'block';
        backupSelectedBtn.style.display = 'none';
        document.querySelectorAll('.partition-item').forEach(item => {
            item.classList.remove('selectable', 'selected');
        });
        selectedPartitions = [];
        updateSelectionCount();
    }
}



function toggleItemSelection(partitionElement, partition) {
    const isSelected = partitionElement.classList.toggle('selected');  
    if (isSelected) {
        selectedPartitions.push(partition);
    } else {
        const index = selectedPartitions.findIndex(p => p.name === partition.name);
        if (index !== -1) {
            selectedPartitions.splice(index, 1);
        }
    }
    updateSelectionCount();
    if (selectedPartitions.length === 0) {
        toggleSelectionMode(false);
    }
}


function updateSelectionCount() {
    const countElement = document.getElementById('selectionCount');
    countElement.textContent = selectedPartitions.length;
    const backupSelectedBtn = document.getElementById('backupSelectedBtn');
    backupSelectedBtn.classList.toggle('active', selectedPartitions.length > 0);
}


async function backupSelectedPartitions() {
    if (selectedPartitions.length === 0) {
        alert('No partitions selected');
        return;
    }
    showConfirmDialog(
        "Backup Selected Partitions",
        `Are you sure you want to backup ${selectedPartitions.length} selected partition(s)?`,
        async () => {
            const sortedPartitions = [...selectedPartitions].sort((a, b) => 
                parseInt(a.sizeBytes) - parseInt(b.sizeBytes)
            );
            for (let i = 0; i < sortedPartitions.length; i++) {
                await backupPartition(sortedPartitions[i], true, i, sortedPartitions.length);
            }
            toggleSelectionMode(false);
        }
    );
}


    async function init() {
        try {
            if (window.isEnvironmentBlocked) {
                return;
            }
            if (typeof ksu === 'undefined' || typeof ksu.exec === 'undefined') {
                showEnvironmentDialog();
                return;
            }  
            isEnvironmentSupported = true;
            
        setupSidebar();
        setupSearchBar();
        const partitionPath = await findBootPartitionLocation();
        if (!partitionPath) {
            document.getElementById('loading').innerHTML = 'Failed to find partition location';
            return;
        }
        partitionsFound = await getPartitions(partitionPath);
        await checkDynamicPartitions();
        document.getElementById('loading').style.display = 'none';
        renderPartitionList(partitionsFound);
        await updateStorageInfo();
        await updateLastBackup();
        document.getElementById('backupAllBtn').addEventListener('click', backupAllPartitions);
        document.getElementById('cancelSelectionBtn').addEventListener('click', () => toggleSelectionMode(false));
        document.getElementById('backupSelectedBtn').addEventListener('click', backupSelectedPartitions);
        document.getElementById("md5Toggle").checked = saveMD5;
        document.getElementById("md5Toggle").addEventListener("change", function () {
        saveMD5 = this.checked;
        localStorage.setItem('saveMD5', saveMD5);
        console.log("Save MD5 Checksum:", saveMD5);
        });
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

        
window.addEventListener('load', init);
