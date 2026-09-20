import "dotenv/config";

import process, { env, exit } from "node:process";
import { resolve } from "node:path";

import { createApp } from "./app.js";
import { resolveRuntimeConfiguration } from "./runtime-config.js";

async function main() {
	const runtime = resolveRuntimeConfiguration(env);
	let isShuttingDown = false;
	const app = createApp({
		isStopping: () => isShuttingDown,
		staticDirectory: runtime.staticDirectory
				? resolve(runtime.staticDirectory)
				: undefined
	});

	const server = app.listen(runtime.port, runtime.host, () => {
		console.log(`Server listening on ${runtime.host}:${runtime.port}.`);
	});
	server.headersTimeout = 10_000;
	server.keepAliveTimeout = 5_000;
	server.maxConnections = 256;
	server.maxRequestsPerSocket = 1_000;
	server.requestTimeout = 30_000;

	const shutdown = async (signal: NodeJS.Signals) => {
		if (isShuttingDown) {
			return;
		}

		isShuttingDown = true;
		console.log(`${signal} received, shutting down gracefully...`);
		const forceShutdown = setTimeout(() => {
			console.error("Graceful shutdown timed out; closing remaining connections.");
			server.closeAllConnections();
		}, 10_000);
		forceShutdown.unref();

		try {
			if (server.listening) {
				server.closeIdleConnections();
				await new Promise<void>((resolve, reject) => {
					server.close((error) => {
						clearTimeout(forceShutdown);
						if (error) {
							reject(error);
							return;
						}

						resolve();
					});
				});
			}

			clearTimeout(forceShutdown);
			console.log("Graceful shutdown complete.");
			exit(0);
		}
		catch (error) {
			clearTimeout(forceShutdown);
			console.error("Graceful shutdown failed:", error);
			exit(1);
		}
	};

	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});
	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
}

main().catch((error) => {
	console.error(error);
	exit(1);
});
