# Partition Backup
- This Utility Allows You To Save Android Device Partition


## Requirements
- Rooted Android Device

## Installation 
- Flash Module in KSU/APATCH/MAGISK
- Reboot Your Device


## Usage

- `CLI` and `WebUI` both are supported



-CLI Usage :
```
Usage: partition [OPTIONS]
Options:
  -b, --backup PARTITIONS     Backup partitions (comma-separated)
  -d, --directory DIR         Backup directory (default: current)
  -l, --list                  List available partitions
  -h, --help                  Show help
```
- Example : To backup, boot, vendor and system to internal storage, run

```
partition -b boot,vendor,system -d /sdcard
```



### Screenshots
- WebUI

<p align="center">
  <img src="./images/webui1.png" alt="WebUI 1" width="45%" style="margin-right:10px;">
  <img src="./images/webui2.png" alt="WebUI 2" width="45%">
</p>

- CLI

![CLI](./images/cli.png)
