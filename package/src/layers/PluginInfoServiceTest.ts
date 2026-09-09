import { Effect, Layer } from "effect";
import type { PluginInfoData } from "../services/PluginInfoService.js";
import { PluginInfoService } from "../services/PluginInfoService.js";

const testDefaults: PluginInfoData = {
	name: "test-plugin",
	version: "1.0.0",
};

export const makePluginInfoServiceTest = (data?: Partial<PluginInfoData>): Layer.Layer<PluginInfoService> => {
	const resolved: PluginInfoData = { ...testDefaults, ...data };

	return Layer.succeed(PluginInfoService, {
		get: Effect.succeed(resolved),
		set: (_data: PluginInfoData) => Effect.void,
	});
};
