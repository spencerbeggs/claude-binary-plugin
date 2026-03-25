import { Effect, Layer } from "effect";
import type { SidecarProtocolMessage } from "../otel/protocol.js";
import { SidecarConnection } from "../services/SidecarConnection.js";

export const makeSidecarConnectionTest = () => {
	const messages: (typeof SidecarProtocolMessage.Type)[] = [];
	return {
		messages,
		layer: Layer.succeed(SidecarConnection, {
			emit: (msg) =>
				Effect.sync(() => {
					messages.push(msg);
				}),
			preconnect: Effect.void,
			flush: () => Effect.succeed(true),
		}),
	};
};
