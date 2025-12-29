/**
 * Plugin info module for telemetry attribution.
 *
 * Extracted to break import cycles between index.ts and events.ts.
 *
 * @module
 */

/**
 * Plugin info for telemetry attribution.
 * @public
 */
export interface PluginInfo {
	name: string;
	version: string;
}

let _pluginInfo: PluginInfo = { name: "unknown", version: "0.0.0" };

/**
 * Set the plugin info for telemetry attribution.
 * Called once at startup by the generated plugin entrypoint.
 * @public
 */
export function setPluginInfo(info: PluginInfo): void {
	_pluginInfo = info;
}

/**
 * Get the current plugin info for telemetry attribution.
 * @public
 */
export function getPluginInfo(): PluginInfo {
	return _pluginInfo;
}
