/**
 * Init command — scaffolds a new Claude Code plugin project.
 *
 * Supports interactive mode (wizard) and programmatic mode (CLI flags).
 */

import { basename, resolve } from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import type { ScaffoldConfig } from "./scaffold.js";
import { scaffold } from "./scaffold.js";
import { runWizard, toScreamingSnake } from "./wizard.js";

// Arguments
const directory = Args.text({ name: "directory" }).pipe(Args.withDefault("."));

// Options
const name = Options.text("name").pipe(Options.optional, Options.withDescription("Project name (kebab-case)"));

const type = Options.choice("type", ["plugin", "marketplace"]).pipe(
	Options.optional,
	Options.withDescription("Project type: plugin or marketplace"),
);

const prefix = Options.text("prefix").pipe(
	Options.optional,
	Options.withDescription("Environment variable prefix (SCREAMING_SNAKE_CASE)"),
);

const description = Options.text("description").pipe(Options.optional, Options.withDescription("Plugin description"));

const hooks = Options.text("hooks").pipe(
	Options.optional,
	Options.withDescription("Comma-separated hook types to include"),
);

const commands = Options.boolean("commands").pipe(
	Options.withDefault(true),
	Options.withDescription("Include example command"),
);

const otel = Options.boolean("otel").pipe(
	Options.withDefault(false),
	Options.withDescription("Include OTEL telemetry setup"),
);

const git = Options.boolean("git").pipe(
	Options.withDefault(true),
	Options.withDescription("Initialize git repository"),
);

const install = Options.boolean("install").pipe(
	Options.withDefault(true),
	Options.withDescription("Run bun install after scaffolding"),
);

const yes = Options.boolean("yes").pipe(
	Options.withAlias("y"),
	Options.withDefault(false),
	Options.withDescription("Accept all defaults (skip wizard)"),
);

const dir = Options.text("dir").pipe(Options.optional, Options.withDescription("Output directory for the project"));

export const initCommand = Command.make(
	"init",
	{ directory, name, type, prefix, description, hooks, commands, otel, git, install, yes, dir },
	(opts) =>
		Effect.gen(function* () {
			// Determine explicit directory: --dir flag > positional arg > null (prompt in wizard)
			const dirFromFlag = opts.dir._tag === "Some" ? opts.dir.value : null;
			const dirFromArg = opts.directory !== "." ? opts.directory : null;
			const explicitDir = dirFromFlag ?? dirFromArg;

			if (opts.yes) {
				// Quick mode: accept all defaults
				const derivedName = explicitDir ? basename(explicitDir) : "my-plugin";
				const projectName = opts.name._tag === "Some" ? opts.name.value : derivedName;
				const projectType = opts.type._tag === "Some" ? (opts.type.value as "plugin" | "marketplace") : "plugin";
				const projectPrefix = opts.prefix._tag === "Some" ? opts.prefix.value : toScreamingSnake(projectName);
				const projectDesc = opts.description._tag === "Some" ? opts.description.value : "";
				const hookList =
					opts.hooks._tag === "Some"
						? opts.hooks.value.split(",").map((h) => h.trim())
						: ["SessionStart", "PreToolUse"];

				// Enforce SessionStart
				if (!hookList.includes("SessionStart")) {
					hookList.unshift("SessionStart");
				}

				const dirName = explicitDir ?? projectName;
				const resolvedDir = resolve(process.cwd(), dirName);

				const config: ScaffoldConfig = {
					directory: resolvedDir,
					name: projectName,
					type: projectType,
					prefix: projectPrefix,
					description: projectDesc,
					hooks: hookList,
					includeCommands: opts.commands,
					includeOtel: opts.otel,
					initGit: opts.git,
					runInstall: opts.install,
				};

				yield* Effect.promise(() => scaffold(config));
				yield* Console.log(`\nScaffolded ${projectType} project: ${projectName}`);
				yield* Console.log(`\nNext steps:\n  cd ${dirName}\n  claude-binary-plugin build`);
				return;
			}

			// Check if enough flags for programmatic mode
			if (opts.name._tag === "Some" && opts.type._tag === "Some") {
				const projectName = opts.name.value;
				const projectType = opts.type.value as "plugin" | "marketplace";
				const projectPrefix = opts.prefix._tag === "Some" ? opts.prefix.value : toScreamingSnake(projectName);
				const projectDesc = opts.description._tag === "Some" ? opts.description.value : "";
				const hookList =
					opts.hooks._tag === "Some"
						? opts.hooks.value.split(",").map((h) => h.trim())
						: ["SessionStart", "PreToolUse"];

				// Enforce SessionStart
				if (!hookList.includes("SessionStart")) {
					hookList.unshift("SessionStart");
				}

				const dirName = explicitDir ?? projectName;
				const resolvedDir = resolve(process.cwd(), dirName);

				const config: ScaffoldConfig = {
					directory: resolvedDir,
					name: projectName,
					type: projectType,
					prefix: projectPrefix,
					description: projectDesc,
					hooks: hookList,
					includeCommands: opts.commands,
					includeOtel: opts.otel,
					initGit: opts.git,
					runInstall: opts.install,
				};

				yield* Effect.promise(() => scaffold(config));
				yield* Console.log(`\nScaffolded ${projectType} project: ${projectName}`);
				yield* Console.log(`\nNext steps:\n  cd ${dirName}\n  claude-binary-plugin build`);
				return;
			}

			// Interactive mode: run wizard with any provided flags as defaults
			const defaults: Partial<ScaffoldConfig> = {
				initGit: opts.git,
				runInstall: opts.install,
				includeCommands: opts.commands,
				includeOtel: opts.otel,
			};

			// Only set directory when explicitly provided; omit to trigger wizard prompt
			if (explicitDir) defaults.directory = resolve(process.cwd(), explicitDir);

			if (opts.name._tag === "Some") defaults.name = opts.name.value;
			if (opts.type._tag === "Some") defaults.type = opts.type.value as "plugin" | "marketplace";
			if (opts.prefix._tag === "Some") defaults.prefix = opts.prefix.value;
			if (opts.description._tag === "Some") defaults.description = opts.description.value;
			if (opts.hooks._tag === "Some") {
				defaults.hooks = opts.hooks.value.split(",").map((h) => h.trim());
			}

			const config = yield* Effect.promise(() => runWizard(defaults));
			yield* Effect.promise(() => scaffold(config));

			yield* Console.log(`\nNext steps:\n  cd ${config.directory}\n  claude-binary-plugin build`);
		}),
);
