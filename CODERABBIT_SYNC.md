# CodeRabbit Auto-Sync Setup

This project is configured to automatically sync commits with CodeRabbit for continuous code review.

## How it works

1. **Auto-commit monitoring**: The `scripts/autocommit.mjs` script watches for file changes and automatically creates commits
2. **CodeRabbit-friendly commits**: Each auto-commit includes:
   - Timestamp for tracking
   - Summary of changes (added/modified/deleted files)
   - `[auto-sync] Ready for CodeRabbit review` tag
3. **Automatic push**: Commits are automatically pushed to GitHub
4. **CodeRabbit workflow**: GitHub Actions trigger CodeRabbit analysis on each push/PR

## Usage

### Start auto-commit with CodeRabbit sync:
```bash
npm run autocommit:coderabbit
```

### Or use the original auto-commit:
```bash
npm run autocommit
```

## Configuration files

- `.coderabbit.yml` - CodeRabbit configuration for review settings
- `.github/workflows/coderabbit.yml` - GitHub Actions workflow for CodeRabbit

## Features

- **Debounced commits**: Waits 2 seconds after file changes before committing
- **Change tracking**: Shows count of added/modified/deleted files
- **Error handling**: Gracefully handles push failures (offline, auth issues)
- **Git ignore**: Automatically ignores `.git`, `node_modules`, and `dist` folders

## CodeRabbit settings

- Language: TypeScript
- Framework: React
- Auto-review enabled for pushes and PRs
- Focus on: code quality, performance, security, best practices, React patterns
- Auto-fix enabled for formatting and simple refactors
