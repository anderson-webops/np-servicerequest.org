import process, { env, exit } from "node:process";
import { resolve } from "node:path";

import { createApp } from "./app.js";
import "dotenv/config";

async function main() {
	const app = createApp({
		staticDirectory: env.STATIC_SITE_DIR
			? resolve(env.STATIC_SITE_DIR)
			: undefined
	});
	const port = Number(env.PORT || 3006);

	const server = app.listen(port, () => {
		console.log(`Server listening on port ${port}!`);
	});

	let isShuttingDown = false;

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

	process.once("SIGINT", () => {
		void shutdown("SIGINT");
	});
	process.once("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
}

main().catch((error) => {
	console.error(error);
	exit(1);
});
