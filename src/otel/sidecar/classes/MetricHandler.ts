/**
 * Metric message handler for OTEL sidecar.
 *
 * Records OTEL metrics from MetricData messages received from hooks.
 * Caches metric instruments for efficient reuse.
 *
 * @module
 */

import type { Counter, Histogram, UpDownCounter } from "@opentelemetry/api";
import type { MetricData } from "../../protocol.js";
import { SidecarProviders } from "./SidecarProviders.js";

/**
 * Static class for handling metric messages from hooks.
 *
 * Converts MetricData from the IPC protocol into OTEL metrics.
 * Instruments are cached by name for efficient reuse across messages.
 *
 * @example
 * ```typescript
 * // Record a counter
 * MetricHandler.handle({
 *   name: "hook.count",
 *   type: { kind: "counter", value: 1 },
 *   timeNs: BigInt(Date.now() * 1_000_000),
 * });
 *
 * // Record a histogram
 * MetricHandler.handle({
 *   name: "hook.duration",
 *   unit: "ms",
 *   type: { kind: "histogram", value: 42.5 },
 *   timeNs: BigInt(Date.now() * 1_000_000),
 * });
 * ```
 *
 * @public
 */
export class MetricHandler {
	/**
	 * Cache for counter instruments.
	 */
	private static counters = new Map<string, Counter>();

	/**
	 * Cache for up-down counters (non-monotonic).
	 */
	private static upDownCounters = new Map<string, UpDownCounter>();

	/**
	 * Cache for histogram instruments.
	 */
	private static histograms = new Map<string, Histogram>();

	/**
	 * Handle a metric message from a hook.
	 *
	 * Records the metric value using the appropriate instrument type.
	 * Instruments are cached by name for efficient reuse.
	 *
	 * @param data - Metric data from the hook
	 */
	static handle(data: MetricData): void {
		const meter = SidecarProviders.getMeter();

		switch (data.type.kind) {
			case "counter": {
				const isMonotonic = data.type.monotonic !== false;
				if (isMonotonic) {
					// Monotonic counter - can only increase
					let counter = MetricHandler.counters.get(data.name);
					if (!counter) {
						counter = meter.createCounter(data.name, {
							description: data.description,
							unit: data.unit,
						});
						MetricHandler.counters.set(data.name, counter);
					}
					counter.add(data.type.value, data.attributes);
				} else {
					// Non-monotonic counter - can increase or decrease
					let upDownCounter = MetricHandler.upDownCounters.get(data.name);
					if (!upDownCounter) {
						upDownCounter = meter.createUpDownCounter(data.name, {
							description: data.description,
							unit: data.unit,
						});
						MetricHandler.upDownCounters.set(data.name, upDownCounter);
					}
					upDownCounter.add(data.type.value, data.attributes);
				}
				break;
			}

			case "gauge": {
				// Gauges in OTEL JS are implemented as observable gauges
				// For simplicity, we use an UpDownCounter which can represent gauge semantics
				let gauge = MetricHandler.upDownCounters.get(data.name);
				if (!gauge) {
					gauge = meter.createUpDownCounter(data.name, {
						description: data.description,
						unit: data.unit,
					});
					MetricHandler.upDownCounters.set(data.name, gauge);
				}
				gauge.add(data.type.value, data.attributes);
				break;
			}

			case "histogram": {
				let histogram = MetricHandler.histograms.get(data.name);
				if (!histogram) {
					histogram = meter.createHistogram(data.name, {
						description: data.description,
						unit: data.unit,
					});
					MetricHandler.histograms.set(data.name, histogram);
				}
				histogram.record(data.type.value, data.attributes);
				break;
			}
		}
	}

	/**
	 * Clear metric instrument caches.
	 * Primarily for testing purposes.
	 * @internal
	 */
	static clearCaches(): void {
		MetricHandler.counters.clear();
		MetricHandler.upDownCounters.clear();
		MetricHandler.histograms.clear();
	}
}
