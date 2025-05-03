#!/bin/sh
# Android Partition Backup Tool
# A command-line utility to backup Android device partitions

VERSION=$(grep -E '^version=' /data/adb/modules/partbak/module.prop | cut -d '=' -f2 | sed 's/^ *//')
BACKUP_DIR="/storage/emulated/0/Backups"
DATE_STAMP=$(date +"%Y%m%d_%H%M%S")
PARTITION_DIR=""

# Function to display help message
show_help() {
    cat << EOF
Android Partition Backup Tool v${VERSION}

Usage: $(basename "$0") COMMAND [OPTIONS]

Commands:
  list                         List all available partitions
  backup PARTITION [PARTITION] Backup specified partition(s)
  info                         Show device information

Options:
  -h, --help                   Show this help message
  -v, --version                Show version information
  -d, --directory DIR          Set backup directory (default: ${BACKUP_DIR})
  -q, --quiet                  Quiet mode, display only errors
  -f, --force                  Force overwrite if backup exists

Examples:
  $(basename "$0") list
  $(basename "$0") backup boot
  $(basename "$0") backup boot system vendor
  $(basename "$0") backup -d /sdcard/my_backups boot

EOF
}

# Function to display version
show_version() {
    echo "Android Partition Backup Tool v${VERSION}"
}

# Function to check root access
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "Error: This script requires root access. Please run with su or as root."
        exit 1
    fi
}

# Function to find partition directory
find_partition_dir() {
    [ "$QUIET" != "true" ] && echo "Searching for partition directory..."
    
    # Check first location
    if [ -d "/dev/block/by-name" ] && ls /dev/block/by-name/boot* >/dev/null 2>&1; then
        [ "$QUIET" != "true" ] && echo "Found partitions in /dev/block/by-name/"
        PARTITION_DIR="/dev/block/by-name"
        return 0
    fi
    
    # Check second location
    if [ -d "/dev/block/bootdevice/by-name" ] && ls /dev/block/bootdevice/by-name/boot* >/dev/null 2>&1; then
        [ "$QUIET" != "true" ] && echo "Found partitions in /dev/block/bootdevice/by-name/"
        PARTITION_DIR="/dev/block/bootdevice/by-name"
        return 0
    fi
    
    # Check third location using boot_devices from cmdline
    if [ -f "/proc/cmdline" ]; then
        BOOT_DEVICE=$(grep -o 'androidboot.boot_devices=[^ ]*' /proc/cmdline | cut -d '=' -f2)
        if [ -n "$BOOT_DEVICE" ]; then
            PLATFORM_DIR="/dev/block/platform/$BOOT_DEVICE/by-name"
            if [ -d "$PLATFORM_DIR" ] && ls "$PLATFORM_DIR"/boot* >/dev/null 2>&1; then
                [ "$QUIET" != "true" ] && echo "Found partitions in $PLATFORM_DIR"
                PARTITION_DIR="$PLATFORM_DIR"
                return 0
            fi
        fi
    fi
    
    echo "Error: Could not find partition directory"
    return 1
}

# Function to backup a partition
backup_partition() {
    local partition_name="$1"
    
    # Skip userdata partition
    if [ "$partition_name" = "userdata" ]; then
        echo "Skipping userdata partition (backing up storage to storage would be redundant)"
        return 0
    fi
    
    local partition_path="$PARTITION_DIR/$partition_name"
    
    if [ ! -e "$partition_path" ]; then
        echo "Error: Partition $partition_name not found."
        return 1
    fi
    
    # Get the actual block device through readlink
    local actual_path
    actual_path="$(readlink -f "$partition_path")"
    if [ ! -e "$actual_path" ]; then
        echo "Error: Could not resolve actual path for $partition_name."
        return 1
    fi
    
    [ "$QUIET" != "true" ] && echo "Backing up $partition_name partition from $actual_path..."
    local backup_file="$BACKUP_DIR/${partition_name}_${DATE_STAMP}.img"
    
    # Check if backup file already exists
    if [ -f "$backup_file" ] && [ "$FORCE" != "true" ]; then
        echo "Error: Backup file already exists. Use -f to overwrite."
        return 1
    fi
    
    # Use dd to backup the partition
    if dd if="$actual_path" of="$backup_file" bs=4M 2>/dev/null; then
        [ "$QUIET" != "true" ] && echo "Successfully backed up $partition_name to $backup_file"
        
        # Get file size
        local size
        size="$(stat -c %s "$backup_file" | numfmt --to=iec)"
        [ "$QUIET" != "true" ] && echo "Backup size: $size"
        
        # Calculate MD5 checksum
        [ "$QUIET" != "true" ] && echo "Calculating MD5 checksum..."
        md5sum "$backup_file" > "$backup_file.md5"
        [ "$QUIET" != "true" ] && echo "MD5 checksum saved to $backup_file.md5"
        
        return 0
    else
        echo "Error backing up $partition_name"
        return 1
    fi
}

# Function to list all available partitions
list_partitions() {
    if [ -z "$PARTITION_DIR" ]; then
        find_partition_dir || return 1
    fi
    
    echo "Available partitions in $PARTITION_DIR:"
    echo "--------------------------------------------------"
    printf "%-20s %-12s %-s\n" "PARTITION" "SIZE" "BLOCK DEVICE"
    echo "--------------------------------------------------"
    
    # Use globs instead of ls output
for partition_path in "$PARTITION_DIR"/*; do
    partition=$(basename "$partition_path")

    [ "$partition" = "userdata" ] && continue

    if [ -e "$PARTITION_DIR/$partition" ]; then
        path="$(readlink -f "$PARTITION_DIR/$partition")"
        if [ -e "$path" ]; then
            size="Unknown"
            if command -v blockdev >/dev/null 2>&1; then
                size_bytes=$(blockdev --getsize64 "$path" 2>/dev/null)
                if [ -n "$size_bytes" ]; then
                    if [ "$size_bytes" -ge 1073741824 ]; then
                        size=$(echo "scale=2; $size_bytes/1073741824" | bc)" GB"
                    elif [ "$size_bytes" -ge 1048576 ]; then
                        size=$(echo "scale=2; $size_bytes/1048576" | bc)" MB"
                    elif [ "$size_bytes" -ge 1024 ]; then
                        size=$(echo "scale=2; $size_bytes/1024" | bc)" KB"
                    else
                        size="$size_bytes B"
                    fi
                fi
            fi
            printf "%-20s %-12s %-s\n" "$partition" "$size" "$path"
        fi
    fi
done
}


# Function to show device information
show_device_info() {
    echo "Android Device Information:"
    echo "--------------------------------------------------"
    echo "Model:          $(getprop ro.product.model 2>/dev/null || echo "Unknown")"
    echo "Device:         $(getprop ro.product.device 2>/dev/null || echo "Unknown")"
    echo "Board:          $(getprop ro.product.board 2>/dev/null || echo "Unknown")"
    echo "Android:        $(getprop ro.build.version.release 2>/dev/null || echo "Unknown")"
    echo "Build:          $(getprop ro.build.display.id 2>/dev/null || echo "Unknown")"
    echo "Kernel:         $(uname -r 2>/dev/null || echo "Unknown")"
    echo "Architecture:   $(uname -m 2>/dev/null || echo "Unknown")"
    echo "--------------------------------------------------"
    
    # Find and display partition directory
    if [ -z "$PARTITION_DIR" ]; then
        find_partition_dir >/dev/null 2>&1
    fi
    
    if [ -n "$PARTITION_DIR" ]; then
        echo "Partition directory: $PARTITION_DIR"
    else
        echo "Partition directory: Not found"
    fi
}

# Main function to process arguments
main() {
    # Default values
    QUIET="false"
    FORCE="false"
    
    # No arguments provided
    if [ $# -eq 0 ]; then
        show_help
        exit 1
    fi
    
    # Get command (first argument)
    COMMAND="$1"
    shift
    
    case "$COMMAND" in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--version)
            show_version
            exit 0
            ;;
        list|backup|info)
            # Valid command, continue processing
            ;;
        *)
            echo "Error: Unknown command: $COMMAND"
            echo "Try '$(basename "$0") --help' for more information."
            exit 1
            ;;
    esac
    
    # Process remaining arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--version)
                show_version
                exit 0
                ;;
            -d|--directory)
                shift
                if [ $# -eq 0 ]; then
                    echo "Error: No directory specified for -d option"
                    exit 1
                fi
                BACKUP_DIR="$1"
                ;;
            -q|--quiet)
                QUIET="true"
                ;;
            -f|--force)
                FORCE="true"
                ;;
            -*)
                echo "Error: Unknown option: $1"
                echo "Try '$(basename "$0") --help' for more information."
                exit 1
                ;;
            *)
                # Not an option, must be a partition name for backup command
                if [ "$COMMAND" = "backup" ]; then
                    PARTITIONS="$PARTITIONS $1"
                else
                    echo "Error: Unexpected argument for $COMMAND command: $1"
                    exit 1
                fi
                ;;
        esac
        shift
    done
    
    # Check root access
    check_root
    
    # Create backup directory if it doesn't exist
    if [ "$COMMAND" = "backup" ]; then
        mkdir -p "$BACKUP_DIR"
        if [ ! -d "$BACKUP_DIR" ]; then
            echo "Error: Could not create backup directory $BACKUP_DIR"
            exit 1
        fi
    fi
    
    # Find partition directory
    find_partition_dir || exit 1
    
    # Execute command
    case "$COMMAND" in
        list)
            list_partitions
            ;;
        backup)
            if [ -z "$PARTITIONS" ]; then
                echo "Error: No partitions specified for backup"
                echo "Try '$(basename "$0") backup PARTITION [PARTITION...]'"
                exit 1
            fi
            
            # Create a backup info file
            BACKUP_INFO="$BACKUP_DIR/backup_info_${DATE_STAMP}.txt"
            echo "Android Partition Backup - $DATE_STAMP" > "$BACKUP_INFO"
            echo "Device: $(getprop ro.product.model 2>/dev/null || echo "Unknown") ($(getprop ro.product.device 2>/dev/null || echo "Unknown"))" >> "$BACKUP_INFO"
            echo "Android version: $(getprop ro.build.version.release 2>/dev/null || echo "Unknown")" >> "$BACKUP_INFO"
            echo "Build number: $(getprop ro.build.display.id 2>/dev/null || echo "Unknown")" >> "$BACKUP_INFO"
            echo "Partition directory: $PARTITION_DIR" >> "$BACKUP_INFO"
            echo "" >> "$BACKUP_INFO"
            echo "Backed up partitions:" >> "$BACKUP_INFO"
            
            success_count=0
            total_count=0
            
            for partition in $PARTITIONS; do
                # Skip userdata partition silently
                if [ "$partition" = "userdata" ]; then
                    continue
                fi
                
                total_count=$((total_count + 1))
                if backup_partition "$partition"; then
                    success_count=$((success_count + 1))
                    echo "- $partition: SUCCESS" >> "$BACKUP_INFO"
                else
                    echo "- $partition: FAILED" >> "$BACKUP_INFO"
                fi
            done
            
            [ "$QUIET" != "true" ] && echo ""
            [ "$QUIET" != "true" ] && echo "Backup summary: $success_count of $total_count partitions backed up successfully"
            [ "$QUIET" != "true" ] && echo "Backup information saved to $BACKUP_INFO"
            [ "$QUIET" != "true" ] && echo "All backups stored in $BACKUP_DIR"
            ;;
        info)
            show_device_info
            ;;
    esac
}

# Execute main function
main "$@"
exit 0
