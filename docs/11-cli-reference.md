# CLI Reference

The `claude-binary-plugin` package ships a CLI binary for building plugins and scaffolding new projects.

## build

Compile a plugin configuration into a single-file Bun executable.

### Synopsis

```text
claude-binary-plugin build [config-path] [options]
```

When run without a positional argument the CLI looks for `plugin.config.ts` in the current directory. A custom path can be passed as the first argument:

```bash
claude-binary-plugin build ./src/my-plugin.config.ts
```

### Options

| Flag | Description |
| --- | --- |
| `--no-persist` | Do not copy the built binary to the local Claude Code plugins cache |
| `--no-bytecode` | Skip bytecode compilation (produces a larger but faster-to-build binary) |
| `--bundle` | Output bundled JavaScript instead of a compiled Bun executable |
| `--quiet` | Suppress all non-error output and skip proxy script / hooks.json generation |
| `--help` | Show help information |
| `--version` | Show CLI version |

### Post-Compilation Steps

Unless `--quiet` is set, the build command performs two additional steps after compiling the binary:

1. **Proxy script** -- Generates `scripts/setup-proxy.sh`, a bash wrapper that enables cross-platform distribution by building the binary on the target machine at first use.
2. **hooks.json** -- Generates the hook manifest with SessionStart hooks routed through the proxy and all other hooks pointing directly at the binary.

If no SessionStart hooks are defined in the plugin configuration the build emits a warning because the proxy script will never trigger.

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Build completed successfully |
| 1 | Build failed (config error, missing file, compilation error) |

### Troubleshooting

#### Plugin file not found

```text
Error: Plugin file not found: /path/to/plugin.config.ts
```

The CLI resolves the config path relative to `process.cwd()`. Make sure you are running the command from the correct directory or provide an explicit path.

#### Invalid plugin definition

```text
Plugin file must export a default ClaudeBinaryPlugin.create() result
```

The config file must have a default export created by `ClaudeBinaryPlugin.create()`. Verify that:

- The file uses `export default` (not a named export).
- The export is the return value of `ClaudeBinaryPlugin.create()`, not the raw config object.

#### Compilation errors

Compilation errors from `Bun.build()` are printed to stderr. Common causes include missing dependencies (run `bun install`), TypeScript errors in hook handler files, and circular imports.

---

## init

Scaffold a new plugin or marketplace project with all files, configuration, and boilerplate needed to build and distribute a Claude Code plugin.

### Synopsis

```text
claude-binary-plugin init [directory] [options]
```

### Modes

The command operates in three modes:

1. **Interactive** (default) -- When invoked without enough flags to determine the full configuration, the command launches a React Ink wizard that walks through each option step by step.
2. **Programmatic** -- When both `--name` and `--type` are provided, the wizard is bypassed and the scaffold runs immediately with the supplied flags.
3. **Quick** (`--yes`) -- Accepts all defaults, detects author and GitHub owner from git config and the `gh` CLI, and scaffolds without prompting.

### Arguments

| Argument | Description | Default |
| --- | --- | --- |
| `directory` | Target directory for the new project | Current directory name |

### Options

| Flag | Type | Description | Default |
| --- | --- | --- | --- |
| `--name` | string | Project name (kebab-case) | Derived from directory |
| `--type` | string | `plugin` or `marketplace` | `plugin` |
| `--prefix` | string | Environment variable prefix (SCREAMING_SNAKE_CASE) | Derived from name |
| `--description` | string | Short plugin description | Empty |
| `--hooks` | string | Comma-separated hook types to include | `SessionStart,PreToolUse` |
| `--skip-commands` | boolean | Skip example command generation | false (commands included) |
| `--otel` | boolean | Include OpenTelemetry telemetry setup | false |
| `--skip-lint-staged` | boolean | Skip lint-staged configuration | false (lint-staged included) |
| `--skip-commitlint` | boolean | Skip commitlint configuration | false (commitlint included) |
| `--skip-changesets` | boolean | Skip changesets configuration | false (changesets included) |
| `--skip-git` | boolean | Skip git repository initialization | false (git init runs) |
| `--skip-install` | boolean | Skip `bun install` after scaffolding | false (install runs) |
| `--yes` / `-y` | boolean | Accept all defaults and skip the wizard | false |
| `--dir` | string | Explicit output directory (overrides positional argument) | -- |
| `--author` | string | Author name | Detected from git config |
| `--email` | string | Author email | Detected from git config |
| `--github-owner` | string | GitHub user or organization | Detected from git remote |
| `--license` | string | SPDX license identifier | `MIT` |

> **Note on skip flags.** Features that are included by default use `--skip-*` flags to exclude them. Features that are excluded by default use positive flags to include them. For example, commands are included unless `--skip-commands` is passed, while OTEL is excluded unless `--otel` is passed.

### Valid Hook Types

The `--hooks` flag accepts a comma-separated list. Valid values are:

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `SubagentStop`
- `UserPromptSubmit`
- `Notification`
- `PermissionRequest`
- `SessionEnd`
- `PreCompact`

`SessionStart` is always included regardless of your selection because the proxy-based distribution system requires at least one SessionStart hook to trigger on-demand builds.

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Scaffold completed successfully |
| 1 | Scaffold failed (invalid options, write error) |

### Examples

Interactive wizard:

```bash
claude-binary-plugin init my-plugin
```

Quick scaffold with all defaults:

```bash
claude-binary-plugin init my-plugin --yes
```

Full programmatic scaffold:

```bash
claude-binary-plugin init my-plugin \
  --name=my-plugin \
  --type=plugin \
  --prefix=MY_PLUGIN \
  --description="Security and workflow hooks" \
  --hooks=SessionStart,PreToolUse,PostToolUse \
  --otel \
  --license=Apache-2.0
```

Marketplace scaffold:

```bash
claude-binary-plugin init my-marketplace --type=marketplace --yes
```

Skip optional tooling:

```bash
claude-binary-plugin init my-plugin --yes \
  --skip-lint-staged \
  --skip-commitlint \
  --skip-changesets
```
