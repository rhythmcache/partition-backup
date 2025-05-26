#ifndef PARTITION_H
#define PARTITION_H

#include <time.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <getopt.h>
#include <dirent.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <fcntl.h>
#include <errno.h>
#include <linux/fs.h>
#include <sys/ioctl.h>
#include <libgen.h>

#define MAX_PATH_LEN 512
#define MAX_PARTITIONS 644
#define BUFFER_SIZE 4194304 
#define MAX_PARTITION_NAME 644


typedef struct {
    char name[MAX_PARTITION_NAME];
    char path[MAX_PATH_LEN];
    char real_path[MAX_PATH_LEN];
    off_t size;
} partition_info_t;


typedef struct {
    int backup_mode;
    int list_mode;
    char backup_dir[MAX_PATH_LEN];
    char partitions[MAX_PARTITIONS][MAX_PARTITION_NAME];
    int partition_count;
} program_args_t;

void print_usage(const char *program_name);
int parse_arguments(int argc, char *argv[], program_args_t *args);
char *find_partition_directory(void);
int search_partition_in_dir(const char *dir_path, const char *target);
int search_partition_recursive(const char *base_path, const char *target, char *found_path);
int list_partitions(const char *partition_dir);
int backup_partitions(const program_args_t *args, const char *partition_dir);
int backup_single_partition(const char *partition_name, const char *partition_dir, const char *backup_dir);
off_t get_partition_size(const char *device_path);
int copy_partition(const char *source, const char *dest);
int file_exists(const char *path);
int is_directory(const char *path);
void create_directory_if_not_exists(const char *path);
void format_size(off_t size_bytes, char *output, size_t output_size);

#endif
