/**
 * Plugin info module for telemetry attribution.
 *
 * @remarks
 * This module delegates to the PluginInfo class for backward compatibility.
 * New code should use the PluginInfo class directly.
 *
 * @module
 */

import { PluginInfo as PluginInfoClass, type PluginInfoData } from "./classes/PluginInfo.js";

/**
 * Plugin info for telemetry attribution.
 * @public
 */
export interface PluginInfo {
	name: string;
	version: string;
}

/**
 * Set the plugin info for telemetry attribution.
 * Called once at startup by the generated plugin entrypoint.
 *
 * @remarks
 * Delegates to PluginInfo.set() - new code should use that directly.
 *
 * @public
 */
export function setPluginInfo(info: PluginInfoData): void {
	PluginInfoClass.set(info);
}

/**
 * Get the current plugin info for telemetry attribution.
 *
 * @remarks
 * Delegates to PluginInfo.get() - new code should use that directly.
 *
 * @public
 */
export function getPluginInfo(): PluginInfo {
	return PluginInfoClass.get();
}
