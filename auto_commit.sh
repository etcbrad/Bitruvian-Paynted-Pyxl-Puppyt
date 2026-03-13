#!/bin/bash

# Auto-commit script for every 10 minutes with detected changes
# This script will be run periodically to check for changes and commit them

WORK_DIR="/Users/bradleygeiser/Downloads/Bitruvius FK Base, Rig Builder"
LOG_FILE="$WORK_DIR/auto_commit.log"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Change to working directory
cd "$WORK_DIR" || exit 1

# Check if there are any changes
if git diff --quiet && git diff --cached --quiet; then
    log "No changes detected, skipping commit"
    exit 0
fi

# Add all changes
git add .

# Check if there are staged changes
if git diff --cached --quiet; then
    log "No staged changes after git add, skipping commit"
    exit 0
fi

# Create commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
COMMIT_MSG="Auto-commit: $TIMESTAMP

Changes: $(git diff --cached --name-only | wc -l | tr -d ' ') modified

[auto-sync] Ready for CodeRabbit review"

git commit -m "$COMMIT_MSG"

if [ $? -eq 0 ]; then
    log "Successfully committed changes"
    log "Files changed: $(git diff --cached --name-only | tr '\n' ', ')"
    
    # Push to remote if configured
    if git remote | grep -q origin; then
        git push origin main
        if [ $? -eq 0 ]; then
            log "Successfully pushed to origin/main"
        else
            log "Failed to push to origin/main"
        fi
    fi
else
    log "Failed to commit changes"
    exit 1
fi
