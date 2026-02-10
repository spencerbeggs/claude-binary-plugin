# Contributing to claude-binary-plugin

Thank you for your interest in contributing. This guide covers the
environment setup, development workflow, and contribution process.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.6 (package manager and runtime)
- [TypeScript](https://www.typescriptlang.org/) >= 5.9

Bun is the sole runtime and package manager for this project. Do not use
Node.js, npm, or yarn.

## Getting Started

```bash
# Clone the repository
git clone https://github.com/spencerbeggs/claude-binary-plugin.git
cd claude-binary-plugin

# Install dependencies
bun install
```

## Development Commands

| Command | Description |
| ------- | ----------- |
| `bun run build` | Compile the package (dev + npm targets) |
| `bun run test` | Run tests with `bun:test` |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:coverage` | Run tests with coverage report |
| `bun run typecheck` | Type check with `tsgo` (native TypeScript) |
| `bun run lint` | Lint and format check with Biome |
| `bun run lint:fix` | Auto-fix lint and formatting issues |

## Code Quality Standards

### Formatting and Linting

This project uses [Biome](https://biomejs.dev/) for linting and formatting:

- **Indentation**: tabs
- **Line length**: 120 characters
- **Quotes**: double quotes for strings

Run `bun run lint:fix` before committing to auto-fix issues.

### TypeScript Conventions

- Import extensions are required (use `.js` for TypeScript files)
- Type-only imports must use `import type`
- Type checking uses `tsgo` (native TypeScript compiler)
- Use `Bun.file()` for file I/O and `Bun.$` for shell commands

### Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
type(scope): description

feat:     New feature
fix:      Bug fix
docs:     Documentation changes
refactor: Code restructuring
test:     Test additions or changes
chore:    Build, tooling, or dependency updates
```

Commits are validated by commitlint via a pre-commit hook.

## Contribution Process

1. **Fork** the repository and create a feature branch from `main`
2. **Make changes** following the code quality standards above
3. **Add tests** for new functionality
4. **Run checks** before pushing:

   ```bash
   bun run lint:fix
   bun run typecheck
   bun run test
   ```

5. **Open a pull request** against `main`

### Developer Certificate of Origin (DCO)

All commits must be signed off to certify that you have the right to
submit the contribution under the project's license:

```bash
git commit -s -m "feat: add new feature"
```

This adds a `Signed-off-by` line to your commit message, indicating
agreement with the [DCO](https://developercertificate.org/).

### Changesets

This project uses [Changesets](https://github.com/changesets/changesets)
for version management. If your change affects the public API, add a
changeset:

```bash
bunx changeset
```

Do not manually edit the `version` field in `package.json`.

## Project Structure

```text
src/
  build/        # Plugin build system (PluginBuilder)
  cli/          # CLI binary entry point
  commands/     # Command runtime (Commands class)
  core/         # Zod schemas and tool input types
  events/       # Hook event classes and response builders
  otel/         # OpenTelemetry integration and sidecar
  pipeline/     # Pipeline configuration and runtime
  state/        # Environment management and session registry
  testing/      # Test utilities (PluginTester, TestFixtures)
  types/        # Branded types, JSON types, utility types
  utils/        # Debug logger
```

## Questions

If you have questions about contributing, please open a
[GitHub issue](https://github.com/spencerbeggs/claude-binary-plugin/issues).
