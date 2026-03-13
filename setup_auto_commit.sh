#!/bin/bash

# Setup script for 10-minute auto-commit workflow
# This script sets up a cron job to run auto_commit.sh every 10 minutes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_COMMIT_SCRIPT="$SCRIPT_DIR/auto_commit.sh"
CRON_JOB="*/10 * * * * $AUTO_COMMIT_SCRIPT"

# Check if auto_commit.sh exists
if [ ! -f "$AUTO_COMMIT_SCRIPT" ]; then
    echo "Error: auto_commit.sh not found in $SCRIPT_DIR"
    exit 1
fi

# Add to crontab
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "Auto-commit workflow setup complete!"
echo "Cron job added to run every 10 minutes:"
echo "  $CRON_JOB"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To remove this cron job: crontab -e (then delete the line)"
echo ""
echo "Log file will be created at: $SCRIPT_DIR/auto_commit.log"
