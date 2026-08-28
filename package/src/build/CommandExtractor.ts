/**
 * Functions for extracting command entries from plugin configurations.
 *
 * @remarks
 * Extracts pipeline command entries from ClaudeBinaryPlugin configurations
 * for use in code generation and entrypoint generation.
 *
 * @internal
 */
import type { CommandEntry, ExtractableCommand } from "./builder.js";

/**
 * Extracts pipeline command entries from a plugin configuration.
 *
 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
 * @returns Array of pipeline command entries
 */
export function extractPipelineCommandEntries(config: {
	commands?: Record<string, ExtractableCommand>;
}): CommandEntry[] {
	if (!config.commands) return [];

	const entries: CommandEntry[] = [];

	for (const [name, cmd] of Object.entries(config.commands)) {
		entries.push({
			name,
			description: cmd.description,
			hasArgsSchema: cmd.args !== undefined,
		});
	}

	return entries;
}
