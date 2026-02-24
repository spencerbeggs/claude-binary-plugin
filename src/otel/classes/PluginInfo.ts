/**
 * Plugin info data structure.
 * @public
 */
export interface PluginInfoData {
	/** Plugin name (e.g., "workflow", "security-scanner") */
	name: string;
	/** Plugin version (e.g., "1.0.0", "2.3.1") */
	version: string;
	/** Optional marketplace name */
	marketplace?: string | undefined;
	/** Optional marketplace version */
	marketplaceVersion?: string | undefined;
}

/**
 * Plugin identification for telemetry attribution.
 *
 * @remarks
 * Manages a singleton plugin info instance used across all telemetry.
 * The info is set once at plugin startup and retrieved throughout
 * the plugin lifecycle.
 *
 * @example
 * ```typescript
 * // In generated entrypoint (set once)
 * PluginInfo.set({ name: "workflow", version: "1.0.0" });
 *
 * // In telemetry code (read many times)
 * const info = PluginInfo.get();
 * attributes["plugin.name"] = info.name;
 * attributes["plugin.version"] = info.version;
 * ```
 *
 * @public
 */
export class PluginInfo {
	/**
	 * Plugin-specific OTEL attributes.
	 * @public
	 */
	static readonly ATTRS = {
		/**
		 * The plugin name (e.g., "workflow", "bun-plugin-builder").
		 */
		NAME: "plugin.name",

		/**
		 * The plugin version from package.json.
		 */
		VERSION: "plugin.version",

		/**
		 * The marketplace the plugin belongs to.
		 */
		MARKETPLACE: "plugin.marketplace",

		/**
		 * The marketplace version.
		 */
		MARKETPLACE_VERSION: "plugin.marketplace.version",

		/**
		 * The hook handler file path (relative to plugin root).
		 */
		HOOK_HANDLER: "plugin.hook.handler",

		/**
		 * The command name for command hooks.
		 */
		COMMAND: "plugin.command",
	} as const;

	/**
	 * The plugin name.
	 * @public
	 */
	readonly name: string;

	/**
	 * The plugin version.
	 * @public
	 */
	readonly version: string;

	/**
	 * Optional marketplace name.
	 * @public
	 */
	readonly marketplace?: string | undefined;

	/**
	 * Optional marketplace version.
	 * @public
	 */
	readonly marketplaceVersion?: string | undefined;

	/**
	 * Internal singleton instance.
	 * @internal
	 */
	private static _instance: PluginInfo = new PluginInfo({ name: "unknown", version: "0.0.0" });

	/**
	 * Create a PluginInfo instance.
	 *
	 * @param data - Plugin info data
	 *
	 * @remarks
	 * Typically you should use `PluginInfo.set()` and `PluginInfo.get()`
	 * rather than constructing instances directly.
	 *
	 * @public
	 */
	constructor(data: PluginInfoData) {
		this.name = data.name;
		this.version = data.version;
		this.marketplace = data.marketplace;
		this.marketplaceVersion = data.marketplaceVersion;
	}

	/**
	 * Set the plugin info for telemetry attribution.
	 *
	 * @remarks
	 * Called once at startup by the generated plugin entrypoint.
	 * Subsequent calls will overwrite the previous value.
	 *
	 * @param data - Plugin info data to set
	 *
	 * @example
	 * ```typescript
	 * // In generated entrypoint
	 * PluginInfo.set({
	 *   name: "workflow",
	 *   version: "1.0.0",
	 *   marketplace: "claude-marketplace",
	 *   marketplaceVersion: "2.0.0"
	 * });
	 * ```
	 *
	 * @public
	 */
	static set(data: PluginInfoData): void {
		PluginInfo._instance = new PluginInfo(data);
	}

	/**
	 * Get the current plugin info for telemetry attribution.
	 *
	 * @returns The current PluginInfo instance
	 *
	 * @example
	 * ```typescript
	 * const info = PluginInfo.get();
	 * console.log(`Running ${info.name}@${info.version}`);
	 * ```
	 *
	 * @public
	 */
	static get(): PluginInfo {
		return PluginInfo._instance;
	}

	/**
	 * Reset to default plugin info.
	 *
	 * @remarks
	 * Primarily used for testing to reset state between tests.
	 *
	 * @internal
	 */
	static reset(): void {
		PluginInfo._instance = new PluginInfo({ name: "unknown", version: "0.0.0" });
	}
}
