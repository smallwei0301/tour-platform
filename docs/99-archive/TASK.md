# Build Fix Task

The codebase is currently broken due to a failed automation script.

## Issues to Fix:
1. **Syntax Errors**: Many import statements in `apps/web/app/api` have unterminated string constants (e.g., `import { ... } from '...path'";`). Remove the trailing quotes and fix the syntax.
2. **Import Paths**: Many relative imports pointing to `src/lib` are incorrect (off-by-one error in the number of `../`). Correct them based on the actual filesystem depth.
3. **Build Failure**: The command `npm run build -w @tour/web` is currently failing.

## Goal:
Modify the files until `npm run build -w @tour/web` passes successfully.
