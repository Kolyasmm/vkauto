#!/bin/bash
# VK Automation Database Backup Script

BACKUP_DIR="/root/vkauto/backups"
DATE=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=7

# Create backup
docker compose -f /root/vkauto/docker-compose.yml exec -T postgres pg_dump -U postgres vk_automation > "${BACKUP_DIR}/backup_${DATE}.sql"

# Compress backup
gzip "${BACKUP_DIR}/backup_${DATE}.sql"

# Remove old backups (keep last 7 days)
find "${BACKUP_DIR}" -name "backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Database backup created: backup_${DATE}.sql.gz"
