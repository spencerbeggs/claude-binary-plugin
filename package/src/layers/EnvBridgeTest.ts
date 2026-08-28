import { Effect, Layer, Ref } from "effect";
import { EnvBridge } from "../services/EnvBridge.js";

export const makeEnvBridgeTest = (initial: Record<string, string> = {}) => {
	const ref = Ref.unsafeMake<Record<string, string>>({ ...initial });

	const layer = Layer.succeed(EnvBridge, {
		write: (vars: Record<string, string>) => Ref.update(ref, (current) => ({ ...current, ...vars })),

		read: (keys: string[]) =>
			Ref.get(ref).pipe(
				Effect.map((store) => {
					const result: Record<string, string | undefined> = {};
					for (const key of keys) {
						result[key] = store[key];
					}
					return result;
				}),
			),

		readAll: () => Ref.get(ref).pipe(Effect.map((store) => ({ ...store }) as Record<string, string | undefined>)),
	});

	return { layer, ref };
};
