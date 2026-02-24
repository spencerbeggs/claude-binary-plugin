/**
 * Init command — scaffolds a new Claude Code plugin project.
 *
 * Supports interactive mode (React Ink wizard), programmatic mode (CLI flags),
 * and quick mode (--yes with git-detected defaults).
 */

import { basename, resolve } from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
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

const commands = Options.boolean("commands").pipe(
	Options.withDefault(true),
	Options.withDescription("Include example command"),
);

const otel = Options.boolean("otel").pipe(
	Options.withDefault(false),
	Options.withDescription("Include OTEL telemetry setup"),
);

const lintStaged = Options.boolean("lint-staged").pipe(
	Options.withDefault(true),
	Options.withDescription("Include @savvy-web/lint-staged (pre-commit hooks)"),
);

const commitlint = Options.boolean("commitlint").pipe(
	Options.withDefault(true),
	Options.withDescription("Include @savvy-web/commitlint (commit message validation)"),
);

const changesets = Options.boolean("changesets").pipe(
	Options.withDefault(true),
	Options.withDescription("Include @savvy-web/changesets (version management)"),
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

/** Detect git user.name, user.email, and GitHub owner from remote. */
async function detectGitDefaults(): Promise<{ name: string; email: string; owner: string }> {
	const [nameResult, emailResult, remoteResult] = await Promise.allSettled([
		Bun.$`git config user.name`.quiet().text(),
		Bun.$`git config user.email`.quiet().text(),
		Bun.$`git config --get remote.origin.url`.quiet().text(),
	]);

	const gitName = nameResult.status === "fulfilled" ? nameResult.value.trim() : "";
	const gitEmail = emailResult.status === "fulfilled" ? emailResult.value.trim() : "";

	let owner = "";
	if (remoteResult.status === "fulfilled") {
		const url = remoteResult.value.trim();
		const sshMatch = url.match(/git@github\.com:([^/]+)\//);
		const httpsMatch = url.match(/github\.com\/([^/]+)\//);
		owner = sshMatch?.[1] ?? httpsMatch?.[1] ?? "";
	}

	return { name: gitName, email: gitEmail, owner };
}

/** Build a ScaffoldConfig from CLI flags, filling in git defaults for --yes mode. */
async function buildConfigFromFlags(
	opts: {
		name: { _tag: string; value?: string };
		type: { _tag: string; value?: string };
		prefix: { _tag: string; value?: string };
		description: { _tag: string; value?: string };
		hooks: { _tag: string; value?: string };
		commands: boolean;
		otel: boolean;
		lintStaged: boolean;
		commitlint: boolean;
		changesets: boolean;
		git: boolean;
		install: boolean;
	},
	explicitDir: string | null,
	overrides?: { author?: string; email?: string; githubOwner?: string; license?: string },
): Promise<ScaffoldConfig> {
	const derivedName = explicitDir ? basename(explicitDir) : "my-plugin";
	const projectName = opts.name._tag === "Some" ? (opts.name.value as string) : derivedName;
	const projectType = opts.type._tag === "Some" ? (opts.type.value as "plugin" | "marketplace") : "plugin";
	const projectPrefix = opts.prefix._tag === "Some" ? (opts.prefix.value as string) : toScreamingSnake(projectName);
	const projectDesc = opts.description._tag === "Some" ? (opts.description.value as string) : "";
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
	const gitDefaults = await detectGitDefaults();

	return {
		directory: resolvedDir,
		name: projectName,
		type: projectType,
		prefix: projectPrefix,
		description: projectDesc,
		hooks: hookList,
		includeCommands: opts.commands,
		includeOtel: opts.otel,
		includeLintStaged: opts.lintStaged,
		includeCommitlint: opts.commitlint,
		includeChangesets: opts.changesets,
		initGit: opts.git,
		runInstall: opts.install,
		author: {
			name: overrides?.author ?? gitDefaults.name,
			email: overrides?.email ?? gitDefaults.email,
		},
		githubOwner: overrides?.githubOwner ?? gitDefaults.owner,
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
		commands,
		otel,
		lintStaged,
		commitlint,
		changesets,
		git,
		install,
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

				yield* Effect.promise(() => scaffold(config));
				const dirName = explicitDir ?? config.name;
				yield* Console.log(`\nScaffolded ${config.type} project: ${config.name}`);
				yield* Console.log(`\nNext steps:\n  cd ${dirName}\n  claude-binary-plugin build`);
				return;
			}

			// Programmatic mode: enough flags provided to skip wizard
			if (opts.name._tag === "Some" && opts.type._tag === "Some") {
				const config = yield* Effect.promise(() => buildConfigFromFlags(opts, explicitDir, flagOverrides));

				yield* Effect.promise(() => scaffold(config));
				const dirName = explicitDir ?? config.name;
				yield* Console.log(`\nScaffolded ${config.type} project: ${config.name}`);
				yield* Console.log(`\nNext steps:\n  cd ${dirName}\n  claude-binary-plugin build`);
				return;
			}

			// Interactive mode: launch React Ink wizard
			const defaults: Partial<ScaffoldConfig> = {
				initGit: opts.git,
				runInstall: opts.install,
				includeCommands: opts.commands,
				includeOtel: opts.otel,
				includeLintStaged: opts.lintStaged,
				includeCommitlint: opts.commitlint,
				includeChangesets: opts.changesets,
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
