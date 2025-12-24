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
import { getMeter } from "../providers.js";

/**
 * Cache for counter instruments.
 */
const counters = new Map<string, Counter>();

/**
 * Cache for up-down counters (non-monotonic).
 */
const upDownCounters = new Map<string, UpDownCounter>();

/**
 * Cache for histogram instruments.
 */
const histograms = new Map<string, Histogram>();

/**
 * Handle a metric message from a hook.
 *
 * Records the metric value using the appropriate instrument type.
 * Instruments are cached by name for efficient reuse.
 *
 * @param data - Metric data from the hook
 */
export function handleMetric(data: MetricData): void {
	const meter = getMeter();

	switch (data.type.kind) {
		case "counter": {
			const isMonotonic = data.type.monotonic !== false;
			if (isMonotonic) {
				// Monotonic counter - can only increase
				let counter = counters.get(data.name);
				if (!counter) {
					counter = meter.createCounter(data.name, {
						description: data.description,
						unit: data.unit,
					});
					counters.set(data.name, counter);
				}
				counter.add(data.type.value, data.attributes);
			} else {
				// Non-monotonic counter - can increase or decrease
				let upDownCounter = upDownCounters.get(data.name);
				if (!upDownCounter) {
					upDownCounter = meter.createUpDownCounter(data.name, {
						description: data.description,
						unit: data.unit,
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
					description: data.description,
					unit: data.unit,
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
					description: data.description,
					unit: data.unit,
				});
				histograms.set(data.name, histogram);
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
export function clearMetricCaches(): void {
	counters.clear();
	upDownCounters.clear();
	histograms.clear();
}
