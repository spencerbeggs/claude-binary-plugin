import { Effect, Layer } from "effect";
import { MessageRouter } from "../services/MessageRouter.js";

/**
 * Test factory for the MessageRouter service.
 *
 * Returns a Layer where all handlers are no-ops (Effect.void).
 * Use this in tests that depend on MessageRouter but don't need to verify routing behavior.
 */
export const makeMessageRouterTest = () => {
	return Layer.succeed(MessageRouter, {
		handleSpan: (_data, _tracer) => Effect.void,
		handleEvent: (_data, _logger) => Effect.void,
		handleMetric: (_data, _meter) => Effect.void,
		clearCaches: Effect.void,
	});
};
