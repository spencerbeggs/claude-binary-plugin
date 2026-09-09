import type { Effect } from "effect";
import { Context } from "effect";

export interface PluginInfoData {
	name: string;
	version: string;
	marketplace?: string | undefined;
	marketplaceVersion?: string | undefined;
}

export const PLUGIN_INFO_ATTRS = {
	NAME: "plugin.name",
	VERSION: "plugin.version",
	MARKETPLACE: "plugin.marketplace",
	MARKETPLACE_VERSION: "plugin.marketplace.version",
	HOOK_HANDLER: "plugin.hook.handler",
	COMMAND: "plugin.command",
} as const;

export class PluginInfoService extends Context.Tag("PluginInfoService")<
	PluginInfoService,
	{
		readonly get: Effect.Effect<PluginInfoData>;
		readonly set: (data: PluginInfoData) => Effect.Effect<void>;
	}
>() {}
