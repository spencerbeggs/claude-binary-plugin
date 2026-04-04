import { BunFileSystem } from "@effect/platform-bun";
import { Layer, pipe } from "effect";
import { ClaudeAccountInfoLive } from "./ClaudeAccountInfoLive.js";
import { CommandRunnerLive } from "./CommandRunnerLive.js";
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

// SessionStore needs FileSystem
const SessionStoreWithFs = pipe(SessionStoreLive, Layer.provide(BunFileSystem.layer));

// Compose the env service dependency graph
const EnvInfra = Layer.mergeAll(EnvFileParserLive, EnvBridgeLive, BunFileSystem.layer);

const EnvResolverWithDeps = pipe(EnvResolverLive, Layer.provide(SessionStoreWithFs));

const EnvServices = pipe(
	EnvCoordinatorLive,
	Layer.provide(
		Layer.mergeAll(
			pipe(EnvLoaderLive, Layer.provide(EnvInfra)),
			pipe(EnvValidatorLive, Layer.provide(EnvBridgeLive)),
			pipe(EnvWriterLive, Layer.provide(EnvInfra)),
			EnvResolverWithDeps,
			EnvBridgeLive,
		),
	),
);

// CommandRunner needs EnvBridge, EnvResolver, and FileSystem
const CommandRunnerWithDeps = pipe(
	CommandRunnerLive,
	Layer.provide(Layer.mergeAll(EnvBridgeLive, EnvResolverWithDeps, BunFileSystem.layer)),
);

export const PluginLive = Layer.mergeAll(
	StdinReaderLive,
	SchemaValidatorLive,
	EnvServices,
	SessionStoreWithFs,
	OtelClientLive,
	ShellExecutorLive,
	PluginInfoServiceLive,
	CommandRunnerWithDeps,
	pipe(GitInfoLive, Layer.provide(ShellExecutorLive)),
	pipe(ClaudeAccountInfoLive, Layer.provide(BunFileSystem.layer)),
);
