import { Schema } from "effect";

/**
 * Plugin state — detected environment, persisted between hooks.
 * Methods provide convenience accessors for handlers.
 */
export class PluginState extends Schema.Class<PluginState>("PluginState")({
	git: Schema.Boolean,
	bun: Schema.Boolean,
	packageManager: Schema.Literal("npm", "bun"),
}) {
	/** Get the package exec command for running tools */
	getPmExec(): string {
		return this.packageManager === "bun" ? "bunx" : "npx";
	}

	/** Check if git operations are safe */
	canUseGit(): boolean {
		return this.git;
	}
}
