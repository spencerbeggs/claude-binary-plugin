/**
 * Function to generate hooks.json manifest files for Claude Code.
 *
 * @remarks
 * Generates the hooks.json content that maps hook event types to their
 * command handlers, including both compiled hooks and passthrough entries.
 *
 * @internal
 */
import type {
	ExtractedPassthroughHooks,
	GenerateHooksJsonOptions,
	HookEntry,
	HooksJsonEntry,
	HooksJsonFile,
} from "./builder.js";

/**
 * Generates the hooks.json content from hook entries.
 *
 * This function creates the Claude Code hooks.json format that maps
 * hook event types to their command handlers. All hooks use `${CLAUDE_PLUGIN_ROOT}`
 * which Claude Code provides for every hook invocation.
 *
 * @param options - Generation options
 * @returns The hooks.json object structure
 */
export function generateHooksJson(options: GenerateHooksJsonOptions): HooksJsonFile {
	const { pluginBinaryName, hooks, passthroughHooks = {}, proxyScript } = options;

	// Group hooks by type
	const hooksByType = new Map<string, HookEntry[]>();
	for (const hook of hooks) {
		const list = hooksByType.get(hook.hookType) || [];
		list.push(hook);
		hooksByType.set(hook.hookType, list);
	}

	// Build the hooks object
	const result: HooksJsonFile = { hooks: {} };

	// Collect all hook types (from both compiled and passthrough)
	const allHookTypes = new Set([...hooksByType.keys(), ...Object.keys(passthroughHooks)]);

	for (const hookType of allHookTypes) {
		const entries: HooksJsonEntry[] = [];

		// Add compiled hooks
		const typeHooks = hooksByType.get(hookType) || [];
		for (const hook of typeHooks) {
			const hookId = `${hookType}/${hook.name}`;
			const useProxy = proxyScript && hookType === "SessionStart";
			const target = useProxy ? proxyScript : pluginBinaryName;
			const command = `\${CLAUDE_PLUGIN_ROOT}/${target} --hook=${hookId}`;

			const entry: HooksJsonEntry = {
				hooks: [{ type: "command", command }],
			};

			// Add matcher for tool-specific hooks
			if (hook.tools && hook.tools.length > 0) {
				entry.matcher = hook.tools.join("|");
			}

			entries.push(entry);
		}

		// Add passthrough hooks
		const passthroughEntries = passthroughHooks[hookType] || [];
		for (const passthrough of passthroughEntries) {
			entries.push({
				matcher: passthrough.matcher,
				hooks: passthrough.hooks,
			});
		}

		if (entries.length > 0) {
			result.hooks[hookType] = entries;
		}
	}

	return result;
}
