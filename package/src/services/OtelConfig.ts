import { Context, Schema } from "effect";

export class OtelConfigData extends Schema.Class<OtelConfigData>("OtelConfigData")({
	enabled: Schema.Boolean,
	endpoint: Schema.optional(Schema.String),
	protocol: Schema.optional(Schema.Literal("http", "grpc")),
	serviceName: Schema.optional(Schema.String),
	headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
	socketPath: Schema.optional(Schema.String),
	tracesExporter: Schema.optional(Schema.Literal("otlp", "console", "none")),
	metricsExporter: Schema.optional(Schema.Literal("otlp", "none")),
	logsExporter: Schema.optional(Schema.Literal("otlp", "none")),
	resourceAttributes: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
	deploymentEnv: Schema.optional(Schema.String),
}) {}

export class OtelConfig extends Context.Tag("OtelConfig")<OtelConfig, OtelConfigData>() {}
