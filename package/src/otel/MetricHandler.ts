import type { Counter, Histogram, Meter, UpDownCounter } from "@opentelemetry/api";
import type { MetricData } from "./protocol.js";

/**
 * Cache for metric instruments, keyed by name.
 * Instruments are reused across messages for efficiency.
 */
const counters = new Map<string, Counter>();
const upDownCounters = new Map<string, UpDownCounter>();
const histograms = new Map<string, Histogram>();

/**
 * Handle a metric message from a hook.
 *
 * Converts MetricData from the IPC protocol into OTEL metrics.
 * Instruments are cached by name for efficient reuse across messages.
 *
 * @param data - Metric data from the hook
 * @param meter - OTEL Meter instance to create instruments with
 *
 * @example
 * ```typescript
 * import { metrics } from "@opentelemetry/api";
 * MetricHandler.handle({
 *   name: "hook.count",
 *   type: { kind: "counter", value: 1 },
 *   timeNs: BigInt(Date.now() * 1_000_000),
 * }, metrics.getMeter("default"));
 * ```
 *
 * @public
 */
export const MetricHandler = {
	handle(data: MetricData, meter: Meter): void {
		switch (data.type.kind) {
			case "counter": {
				const isMonotonic = data.type.monotonic !== false;
				if (isMonotonic) {
					// Monotonic counter - can only increase
					let counter = counters.get(data.name);
					if (!counter) {
						counter = meter.createCounter(data.name, {
							...(data.description !== undefined && { description: data.description }),
							...(data.unit !== undefined && { unit: data.unit }),
						});
						counters.set(data.name, counter);
					}
					counter.add(data.type.value, data.attributes);
				} else {
					// Non-monotonic counter - can increase or decrease
					let upDownCounter = upDownCounters.get(data.name);
					if (!upDownCounter) {
						upDownCounter = meter.createUpDownCounter(data.name, {
							...(data.description !== undefined && { description: data.description }),
							...(data.unit !== undefined && { unit: data.unit }),
						});
						upDownCounters.set(data.name, upDownCounter);
					}
					upDownCounter.add(data.type.value, data.attributes);
				}
				break;
			}

			case "gauge": {
				// Gauges in OTEL JS are implemented as observable gauges
				// For simplicity, we use an UpDownCounter which can represent gauge semantics
				let gauge = upDownCounters.get(data.name);
				if (!gauge) {
					gauge = meter.createUpDownCounter(data.name, {
						...(data.description !== undefined && { description: data.description }),
						...(data.unit !== undefined && { unit: data.unit }),
					});
					upDownCounters.set(data.name, gauge);
				}
				gauge.add(data.type.value, data.attributes);
				break;
			}

			case "histogram": {
				let histogram = histograms.get(data.name);
				if (!histogram) {
					histogram = meter.createHistogram(data.name, {
						...(data.description !== undefined && { description: data.description }),
						...(data.unit !== undefined && { unit: data.unit }),
					});
					histograms.set(data.name, histogram);
				}
				histogram.record(data.type.value, data.attributes);
				break;
			}
		}
	},

	/**
	 * Clear metric instrument caches.
	 * Primarily for testing purposes.
	 * @internal
	 */
	clearCaches(): void {
		counters.clear();
		upDownCounters.clear();
		histograms.clear();
	},
};
