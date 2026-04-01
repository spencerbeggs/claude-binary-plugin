import { Effect, Layer, Ref } from "effect";
import type { PluginInfoData } from "../services/PluginInfoService.js";
import { PluginInfoService } from "../services/PluginInfoService.js";

const defaultData: PluginInfoData = {
	name: "unknown",
	version: "0.0.0",
};

export const PluginInfoServiceLive = Layer.effect(
	PluginInfoService,
	Effect.gen(function* () {
		const ref = yield* Ref.make<PluginInfoData>(defaultData);

		return {
			get: Ref.get(ref),
			set: (data: PluginInfoData) => Ref.set(ref, data),
		};
	}),
);
