/**
 * Interactive wizard for scaffolding a new plugin project.
 *
 * Uses @clack/prompts for a polished CLI experience.
 */

import { basename } from "node:path";
import * as p from "@clack/prompts";
import type { ScaffoldConfig } from "./scaffold.js";

/** Convert a string to SCREAMING_SNAKE_CASE. */
export function toScreamingSnake(name: string): string {
	return name
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/([a-z])([A-Z])/g, "$1_$2")
		.toUpperCase()
		.replace(/^_|_$/g, "");
}

/** Normalize a string to kebab-case. */
export function toKebabCase(name: string): string {
	return name
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.toLowerCase()
		.replace(/^-|-$/g, "");
}

function handleCancel(value: unknown): void {
	if (p.isCancel(value)) {
		p.cancel("Scaffold cancelled.");
		process.exit(1);
	}
}

export async function runWizard(defaults: Partial<ScaffoldConfig>): Promise<ScaffoldConfig> {
	p.intro("Claude Binary Plugin \u2014 Project Scaffolder");

	const defaultName =
		defaults.name ?? (defaults.directory && defaults.directory !== "." ? basename(defaults.directory) : "");

	const name = await p.text({
		message: "What is your project name?",
		initialValue: defaultName,
		placeholder: "my-plugin",
		validate: (v) => {
			if (!v) return "Name is required";
			if (!/^[a-z][a-z0-9-]*$/.test(v)) return "Must be kebab-case (e.g., my-plugin)";
		},
	});
	handleCancel(name);

	const type = await p.select({
		message: "What type of project?",
		initialValue: defaults.type ?? "plugin",
		options: [
			{ value: "plugin" as const, label: "Single Plugin", hint: "One plugin with hooks and commands" },
			{ value: "marketplace" as const, label: "Marketplace", hint: "Multiple plugins in a monorepo" },
		],
	});
	handleCancel(type);

	const derivedPrefix = toScreamingSnake(name as string);

	const prefix = await p.text({
		message: "Environment variable prefix?",
		initialValue: defaults.prefix ?? derivedPrefix,
		placeholder: "MY_PLUGIN",
		validate: (v) => {
			if (!v) return "Prefix is required";
			if (!/^[A-Z][A-Z0-9_]*$/.test(v)) return "Must be SCREAMING_SNAKE_CASE (e.g., MY_PLUGIN)";
		},
	});
	handleCancel(prefix);

	const description = await p.text({
		message: "Short description?",
		initialValue: defaults.description ?? "",
		placeholder: "Hooks and commands for Claude Code",
	});
	handleCancel(description);

	const hooks = await p.multiselect({
		message: "Which hooks do you want to include?",
		initialValues: defaults.hooks ?? ["SessionStart", "PreToolUse"],
		options: [
			{ value: "SessionStart", label: "SessionStart", hint: "recommended \u2014 inject project context" },
			{ value: "PreToolUse", label: "PreToolUse", hint: "filter tool calls" },
			{ value: "PostToolUse", label: "PostToolUse", hint: "respond after tool execution" },
			{ value: "Stop", label: "Stop", hint: "guard against premature stops" },
			{ value: "UserPromptSubmit", label: "UserPromptSubmit", hint: "validate user prompts" },
			{ value: "Notification", label: "Notification", hint: "observe notifications" },
		],
		required: true,
	});
	handleCancel(hooks);

	// Enforce SessionStart
	const hookList = hooks as string[];
	if (!hookList.includes("SessionStart")) {
		hookList.unshift("SessionStart");
		p.log.info("SessionStart hook is required for cross-platform distribution and has been included automatically.");
	}

	const includeCommands = await p.confirm({
		message: "Include an example command?",
		initialValue: defaults.includeCommands ?? true,
	});
	handleCancel(includeCommands);

	const includeOtel = await p.confirm({
		message: "Include OTEL telemetry?",
		initialValue: defaults.includeOtel ?? false,
	});
	handleCancel(includeOtel);

	// Summary
	const typeLabel = (type as string) === "marketplace" ? "Marketplace" : "Single Plugin";
	const summaryLines = [
		`Name:     ${name as string}`,
		`Type:     ${typeLabel}`,
		`Prefix:   ${prefix as string}`,
		`Hooks:    ${hookList.join(", ")}`,
		`Commands: ${includeCommands ? "Yes" : "No"}`,
		`OTEL:     ${includeOtel ? "Yes" : "No"}`,
	];

	p.note(summaryLines.join("\n"), "Project Summary");

	const confirmed = await p.confirm({
		message: "Ready to scaffold?",
		initialValue: true,
	});
	handleCancel(confirmed);

	if (!confirmed) {
		p.cancel("Scaffold cancelled.");
		process.exit(1);
	}

	const directory = defaults.directory && defaults.directory !== "." ? defaults.directory : (name as string);

	const config: ScaffoldConfig = {
		directory,
		name: name as string,
		type: type as "plugin" | "marketplace",
		prefix: prefix as string,
		description: (description as string) || "",
		hooks: hookList,
		includeCommands: includeCommands as boolean,
		includeOtel: includeOtel as boolean,
		initGit: defaults.initGit ?? true,
		runInstall: defaults.runInstall ?? true,
	};

	return config;
}
