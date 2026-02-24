/**
 * Init command — scaffolds a new Claude Code plugin project.
 *
 * Supports interactive mode (React Ink wizard), programmatic mode (CLI flags),
 * and quick mode (--yes with git-detected defaults).
 */

import { basename, resolve } from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { detectDefaults } from "./detect-defaults.js";
import type { ScaffoldConfig } from "./scaffold.js";
import { scaffold } from "./scaffold.js";
import { toScreamingSnake } from "./templates/shared.js";

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

// Boolean options — @effect/cli Options.boolean defaults to false when not passed.
// For features that default to ON, we use --skip-* flags so "not passed" (false) means "include".
// For features that default to OFF, we use positive flags so "not passed" (false) means "exclude".
const skipCommands = Options.boolean("skip-commands").pipe(Options.withDescription("Skip example command generation"));

const otel = Options.boolean("otel").pipe(Options.withDescription("Include OTEL telemetry setup"));

const skipLintStaged = Options.boolean("skip-lint-staged").pipe(Options.withDescription("Skip @savvy-web/lint-staged"));

const skipCommitlint = Options.boolean("skip-commitlint").pipe(Options.withDescription("Skip @savvy-web/commitlint"));

const skipChangesets = Options.boolean("skip-changesets").pipe(Options.withDescription("Skip @savvy-web/changesets"));

const skipGit = Options.boolean("skip-git").pipe(Options.withDescription("Skip git repository initialization"));

const skipInstall = Options.boolean("skip-install").pipe(Options.withDescription("Skip bun install after scaffolding"));

const yes = Options.boolean("yes").pipe(
	Options.withAlias("y"),
	Options.withDefault(false),
	Options.withDescription("Accept all defaults (skip wizard)"),
);

const dir = Options.text("dir").pipe(Options.optional, Options.withDescription("Output directory for the project"));

const author = Options.text("author").pipe(Options.optional, Options.withDescription("Author name"));

const email = Options.text("email").pipe(Options.optional, Options.withDescription("Author email"));

const githubOwner = Options.text("github-owner").pipe(
	Options.optional,
	Options.withDescription("GitHub user or organization"),
);

const license = Options.text("license").pipe(
	Options.optional,
	Options.withDescription("SPDX license identifier (e.g., MIT, Apache-2.0)"),
);

/** Unwrap an @effect/cli Option, returning the value or a fallback. */
function optionOr<T>(opt: { _tag: string; value?: T }, fallback: T): T {
	return opt._tag === "Some" ? (opt.value as T) : fallback;
}

/** Build a ScaffoldConfig from CLI flags, filling in git defaults for --yes mode. */
async function buildConfigFromFlags(
	opts: {
		name: { _tag: string; value?: string };
		type: { _tag: string; value?: string };
		prefix: { _tag: string; value?: string };
		description: { _tag: string; value?: string };
		hooks: { _tag: string; value?: string };
		skipCommands: boolean;
		otel: boolean;
		skipLintStaged: boolean;
		skipCommitlint: boolean;
		skipChangesets: boolean;
		skipGit: boolean;
		skipInstall: boolean;
	},
	explicitDir: string | null,
	overrides?: { author?: string; email?: string; githubOwner?: string; license?: string },
): Promise<ScaffoldConfig> {
	const derivedName = explicitDir ? basename(explicitDir) : "my-plugin";
	const projectName = optionOr(opts.name, derivedName);
	const projectType = optionOr(opts.type, "plugin") as "plugin" | "marketplace";
	const projectPrefix = optionOr(opts.prefix, toScreamingSnake(projectName));
	const projectDesc = optionOr(opts.description, "");
	const hookList =
		opts.hooks._tag === "Some"
			? (opts.hooks.value as string).split(",").map((h) => h.trim())
			: ["SessionStart", "PreToolUse"];

	if (!hookList.includes("SessionStart")) {
		hookList.unshift("SessionStart");
	}

	const dirName = explicitDir ?? projectName;
	const resolvedDir = resolve(process.cwd(), dirName);

	// Detect git defaults for author/owner if not explicitly provided
	const detected = await detectDefaults();

	return {
		directory: resolvedDir,
		name: projectName,
		type: projectType,
		prefix: projectPrefix,
		description: projectDesc,
		hooks: hookList,
		includeCommands: !opts.skipCommands,
		includeOtel: opts.otel,
		includeLintStaged: !opts.skipLintStaged,
		includeCommitlint: !opts.skipCommitlint,
		includeChangesets: !opts.skipChangesets,
		initGit: !opts.skipGit,
		runInstall: !opts.skipInstall,
		author: {
			name: overrides?.author ?? detected.name,
			email: overrides?.email ?? detected.email,
		},
		githubOwner: overrides?.githubOwner ?? detected.githubOwner,
		license: overrides?.license ?? "MIT",
	};
}

export const initCommand = Command.make(
	"init",
	{
		directory,
		name,
		type,
		prefix,
		description,
		hooks,
		skipCommands,
		otel,
		skipLintStaged,
		skipCommitlint,
		skipChangesets,
		skipGit,
		skipInstall,
		yes,
		dir,
		author,
		email,
		githubOwner,
		license,
	},
	(opts) =>
		Effect.gen(function* () {
			// Determine explicit directory: --dir flag > positional arg > null (prompt in wizard)
			const dirFromFlag = opts.dir._tag === "Some" ? opts.dir.value : null;
			const dirFromArg = opts.directory !== "." ? opts.directory : null;
			const explicitDir = dirFromFlag ?? dirFromArg;

			const flagOverrides = {
				author: opts.author._tag === "Some" ? opts.author.value : undefined,
				email: opts.email._tag === "Some" ? opts.email.value : undefined,
				githubOwner: opts.githubOwner._tag === "Some" ? opts.githubOwner.value : undefined,
				license: opts.license._tag === "Some" ? opts.license.value : undefined,
			};

			if (opts.yes) {
				// Quick mode: accept all defaults, detect git info
				const config = yield* Effect.promise(() => buildConfigFromFlags(opts, explicitDir, flagOverrides));

				const result = yield* Effect.promise(() => scaffold(config));
				const dirName = explicitDir ?? config.name;
				for (const warning of result.warnings) {
					yield* Console.log(`\n\u26A0  ${warning}`);
				}
				yield* Console.log(`\nScaffolded ${config.type} project: ${config.name}`);
				yield* Console.log(`\nNext steps:\n  cd ${dirName}\n  claude-binary-plugin build`);
				return;
			}

			// Programmatic mode: enough flags provided to skip wizard
			if (opts.name._tag === "Some" && opts.type._tag === "Some") {
				const config = yield* Effect.promise(() => buildConfigFromFlags(opts, explicitDir, flagOverrides));

				const result = yield* Effect.promise(() => scaffold(config));
				const dirName = explicitDir ?? config.name;
				for (const warning of result.warnings) {
					yield* Console.log(`\n\u26A0  ${warning}`);
				}
				yield* Console.log(`\nScaffolded ${config.type} project: ${config.name}`);
				yield* Console.log(`\nNext steps:\n  cd ${dirName}\n  claude-binary-plugin build`);
				return;
			}

			// Interactive mode: launch React Ink wizard
			const defaults: Partial<ScaffoldConfig> = {
				initGit: !opts.skipGit,
				runInstall: !opts.skipInstall,
				includeCommands: !opts.skipCommands,
				includeOtel: opts.otel,
				includeLintStaged: !opts.skipLintStaged,
				includeCommitlint: !opts.skipCommitlint,
				includeChangesets: !opts.skipChangesets,
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
			if (opts.author._tag === "Some") defaults.author = { name: opts.author.value, email: "" };
			if (opts.email._tag === "Some") {
				defaults.author = { name: defaults.author?.name ?? "", email: opts.email.value };
			}
			if (opts.githubOwner._tag === "Some") defaults.githubOwner = opts.githubOwner.value;
			if (opts.license._tag === "Some") defaults.license = opts.license.value;

			// Dynamic import to keep ink out of non-interactive paths
			yield* Effect.promise(async () => {
				const { runInkWizard } = await import("./ink/run.js");
				await runInkWizard(defaults);
			});
		}),
);
