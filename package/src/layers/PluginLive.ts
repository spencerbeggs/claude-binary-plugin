import { BunFileSystem } from "@effect/platform-bun";
import { Layer, pipe } from "effect";
import { ClaudeAccountInfoLive } from "./ClaudeAccountInfoLive.js";
import { EnvBridgeLive } from "./EnvBridgeLive.js";
import { EnvCoordinatorLive } from "./EnvCoordinatorLive.js";
import { EnvFileParserLive } from "./EnvFileParserLive.js";
import { EnvLoaderLive } from "./EnvLoaderLive.js";
import { EnvResolverLive } from "./EnvResolverLive.js";
import { EnvValidatorLive } from "./EnvValidatorLive.js";
import { EnvWriterLive } from "./EnvWriterLive.js";
import { GitInfoLive } from "./GitInfoLive.js";
import { OtelConfigLive } from "./OtelConfigLive.js";
import { PlatformInfoLive } from "./PlatformInfoLive.js";
import { PluginInfoServiceLive } from "./PluginInfoServiceLive.js";
import { SchemaValidatorLive } from "./SchemaValidatorLive.js";
import { SessionStoreLive } from "./SessionStoreLive.js";
import { ShellExecutorLive } from "./ShellExecutorLive.js";
import { SidecarConnectionLive } from "./SidecarConnectionLive.js";
import { StdinReaderLive } from "./StdinReaderLive.js";
import { TelemetryLive } from "./TelemetryLive.js";

const PlatformInfoWithDeps = pipe(
	PlatformInfoLive,
	Layer.provide(Layer.mergeAll(ShellExecutorLive, BunFileSystem.layer)),
);

const OtelClientLive = pipe(
	TelemetryLive,
	Layer.provide(SidecarConnectionLive),
	Layer.provide(OtelConfigLive),
	Layer.provide(PlatformInfoWithDeps),
);

// Compose the env service dependency graph
const EnvInfra = Layer.mergeAll(EnvFileParserLive, EnvBridgeLive, BunFileSystem.layer);

const EnvServices = pipe(
	EnvCoordinatorLive,
	Layer.provide(
		Layer.mergeAll(
			pipe(EnvLoaderLive, Layer.provide(EnvInfra)),
			pipe(EnvValidatorLive, Layer.provide(EnvBridgeLive)),
			pipe(EnvWriterLive, Layer.provide(EnvInfra)),
			EnvResolverLive,
			EnvBridgeLive,
		),
	),
);

export const PluginLive = Layer.mergeAll(
	StdinReaderLive,
	SchemaValidatorLive,
	EnvServices,
	SessionStoreLive,
	OtelClientLive,
	ShellExecutorLive,
	PluginInfoServiceLive,
	pipe(GitInfoLive, Layer.provide(ShellExecutorLive)),
	pipe(ClaudeAccountInfoLive, Layer.provide(BunFileSystem.layer)),
);
