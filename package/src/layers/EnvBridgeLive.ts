import { Effect, Layer } from "effect";
import { EnvBridge } from "../services/EnvBridge.js";

export const EnvBridgeLive = Layer.succeed(EnvBridge, {
	write: (vars: Record<string, string>) =>
		Effect.sync(() => {
			for (const [key, value] of Object.entries(vars)) {
				Bun.env[key] = value;
				process.env[key] = value;
			}
		}),

	read: (keys: string[]) =>
		Effect.sync(() => {
			const result: Record<string, string | undefined> = {};
			for (const key of keys) {
				result[key] = Bun.env[key];
			}
			return result;
		}),

	readAll: () => Effect.sync(() => ({ ...Bun.env }) as Record<string, string | undefined>),
});
