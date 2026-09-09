import { Layer } from "effect";
import { OtelConfig, OtelConfigData } from "../services/OtelConfig.js";

export const makeOtelConfigTest = (overrides?: Partial<typeof OtelConfigData.Type>) => {
	const config = new OtelConfigData({
		enabled: false,
		...overrides,
	});
	return {
		config,
		layer: Layer.succeed(OtelConfig, config),
	};
};
