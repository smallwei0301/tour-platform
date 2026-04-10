#!/usr/bin/env bash
#
# task-monitor.sh - Robust monitoring utility for background task completion
#
# Usage: ./task-monitor.sh <commit-message-pattern>
#
# Returns:
#   0 - Commit matching pattern exists in git log
#   1 - No matching commit found or error
#
# Examples:
#   ./task-monitor.sh "TP-BP-007"
#   ./task-monitor.sh "feat(admin): implement"
#   ./task-monitor.sh "chore: add task-monitor"
#
# This script is designed to be used with cron jobs to monitor
# whether background development tasks have completed successfully.
#

set -euo pipefail

# Colors for output (only when attached to terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Validate arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <commit-message-pattern>"
    log_error "Example: $0 'TP-BP-007'"
    exit 1
fi

COMMIT_PATTERN="$1"
SEARCH_DEPTH="${2:-100}"  # Optional: how many commits to search (default: 100)

# Ensure we're in a git repository
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    log_error "Not inside a git repository"
    exit 1
fi

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Search for the commit pattern
log_info "Searching for commit pattern: '$COMMIT_PATTERN'"
log_info "Search depth: $SEARCH_DEPTH commits"

# Use git log with grep to find matching commits
MATCHING_COMMITS=$(git log --oneline -n "$SEARCH_DEPTH" --grep="$COMMIT_PATTERN" 2>/dev/null || true)

if [ -z "$MATCHING_COMMITS" ]; then
    log_warn "No commits found matching pattern: '$COMMIT_PATTERN'"
    log_info "Recent commits:"
    git log --oneline -5 | while read -r line; do
        echo "  $line"
    done
    exit 1
fi

# Count matching commits
MATCH_COUNT=$(echo "$MATCHING_COMMITS" | wc -l | tr -d ' ')

log_info "Found $MATCH_COUNT commit(s) matching pattern:"
echo "$MATCHING_COMMITS" | while read -r line; do
    echo "  $line"
done

# Get the latest matching commit details
LATEST_COMMIT_HASH=$(echo "$MATCHING_COMMITS" | head -1 | cut -d' ' -f1)
LATEST_COMMIT_DATE=$(git log -1 --format="%ci" "$LATEST_COMMIT_HASH")
LATEST_COMMIT_AUTHOR=$(git log -1 --format="%an" "$LATEST_COMMIT_HASH")

log_info "Latest matching commit:"
log_info "  Hash: $LATEST_COMMIT_HASH"
log_info "  Date: $LATEST_COMMIT_DATE"
log_info "  Author: $LATEST_COMMIT_AUTHOR"

# Success - commit exists
exit 0
