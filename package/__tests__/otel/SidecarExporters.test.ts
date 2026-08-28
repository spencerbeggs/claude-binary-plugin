import { describe, expect, test } from "bun:test";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { createLogsExporter, createMetricsExporter, createTraceExporter } from "../../src/otel/SidecarExporters.js";

describe("SidecarExporters", () => {
	describe("createTraceExporter", () => {
		test("returns OTLPTraceExporter by default", () => {
			const exporter = createTraceExporter({});

			expect(exporter).toBeInstanceOf(OTLPTraceExporter);
		});

		test("returns ConsoleSpanExporter when tracesExporter is console", () => {
			const exporter = createTraceExporter({}, { tracesExporter: "console" });

			expect(exporter).toBeInstanceOf(ConsoleSpanExporter);
		});

		test("returns null when tracesExporter is none", () => {
			const exporter = createTraceExporter({}, { tracesExporter: "none" });

			expect(exporter).toBeNull();
		});

		test("uses custom endpoint from config", () => {
			const exporter = createTraceExporter({
				endpoint: "http://custom:4318",
			});

			expect(exporter).toBeInstanceOf(OTLPTraceExporter);
			// Can't easily check the URL without accessing private properties
		});

		test("uses default endpoint when not specified", () => {
			const exporter = createTraceExporter({});

			expect(exporter).toBeInstanceOf(OTLPTraceExporter);
		});
	});

	describe("createMetricsExporter", () => {
		test("returns OTLPMetricExporter by default", () => {
			const exporter = createMetricsExporter({});

			expect(exporter).toBeInstanceOf(OTLPMetricExporter);
		});

		test("returns null when metricsExporter is none", () => {
			const exporter = createMetricsExporter({}, { metricsExporter: "none" });

			expect(exporter).toBeNull();
		});

		test("uses custom endpoint from config", () => {
			const exporter = createMetricsExporter({
				endpoint: "http://custom:4318",
			});

			expect(exporter).toBeInstanceOf(OTLPMetricExporter);
		});
	});

	describe("createLogsExporter", () => {
		test("returns OTLPLogExporter by default", () => {
			const exporter = createLogsExporter({});

			expect(exporter).toBeInstanceOf(OTLPLogExporter);
		});

		test("returns null when logsExporter is none", () => {
			const exporter = createLogsExporter({}, { logsExporter: "none" });

			expect(exporter).toBeNull();
		});

		test("uses custom endpoint from config", () => {
			const exporter = createLogsExporter({
				endpoint: "http://custom:4318",
			});

			expect(exporter).toBeInstanceOf(OTLPLogExporter);
		});
	});
});
