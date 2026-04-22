import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { line, warn, ok, info } from "./colors.js";
import { ROOT } from "./env.js";

export const procs = { backend: null, frontend: null };
const watchers = { backend: null, frontend: null };
const procSpecs = {};
const procState = {
	backend: { pendingRestart: false, stopping: false },
	frontend: { pendingRestart: false, stopping: false },
};

function logsDir() {
	const d = path.join(ROOT, "logs");
	if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
	return d;
}

function scanWatchPath(target, snapshot) {
	let stat;
	try {
		stat = fs.statSync(target);
	} catch (_) {
		return;
	}

	if (stat.isDirectory()) {
		let entries = [];
		try {
			entries = fs.readdirSync(target, { withFileTypes: true });
		} catch (_) {
			return;
		}
		for (const entry of entries)
			scanWatchPath(path.join(target, entry.name), snapshot);
		return;
	}

	snapshot.set(target, `${stat.size}:${stat.mtimeMs}`);
}

function buildSnapshot(paths) {
	const snapshot = new Map();
	for (const target of paths) scanWatchPath(target, snapshot);
	return snapshot;
}

function snapshotsEqual(a, b) {
	if (a.size !== b.size) return false;
	for (const [key, value] of a) {
		if (b.get(key) !== value) return false;
	}
	return true;
}

function clearWatcher(key) {
	if (!watchers[key]) return;
	clearInterval(watchers[key].interval);
	watchers[key] = null;
}

function restartProc(key, reason) {
	const spec = procSpecs[key];
	const state = procState[key];
	if (!spec || !state || state.pendingRestart || state.stopping) return;

	state.pendingRestart = true;
	info(`Restarting ${key} (${reason})...`);

	if (procs[key]) {
		procs[key].kill("SIGTERM");
		return;
	}

	state.pendingRestart = false;
	spawnProc(key);
}

function startPollingWatcher(key, cwd, options) {
	if (!options.watchPaths || options.watchPaths.length === 0) return;

	const watchPaths = options.watchPaths.map((target) =>
		path.join(ROOT, cwd, target),
	);
	let lastSnapshot = buildSnapshot(watchPaths);

	const interval = setInterval(() => {
		const nextSnapshot = buildSnapshot(watchPaths);
		if (snapshotsEqual(lastSnapshot, nextSnapshot)) return;
		lastSnapshot = nextSnapshot;
		restartProc(key, options.watchLabel || "source changes");
	}, options.intervalMs || 1000);

	if (typeof interval.unref === "function") interval.unref();
	watchers[key] = { interval };
}

function spawnProc(key) {
	const spec = procSpecs[key];
	if (!spec) return;

	const { cwd, cmd, args, color } = spec;
	const logFile = path.join(logsDir(), `${key}.log`);
	const logStream = fs.createWriteStream(logFile, { flags: "a" });

	const isWin = process.platform === "win32";
	const actualCmd = isWin && cmd === "npm" ? "npm.cmd" : cmd;

	const proc = spawn(actualCmd, args, {
		cwd: path.join(ROOT, cwd),
		shell: isWin,
		env: process.env,
	});
	procs[key] = proc;

	const handleData = (d) => {
		const text = String(d);
		text.split("\n")
			.filter(Boolean)
			.forEach((l) => {
				line(key, l, color);
				logStream.write(`[${new Date().toISOString()}] ${l}\n`);
			});
	};

	proc.stdout.on("data", handleData);
	proc.stderr.on("data", handleData);
	proc.on("exit", (code) => {
		if (procs[key] === proc) procs[key] = null;
		logStream.end();

		const state = procState[key];
		const shouldRestart = state && state.pendingRestart;
		const wasStopping = state && state.stopping;

		if (state) {
			state.pendingRestart = false;
			state.stopping = false;
		}

		if (shouldRestart) {
			spawnProc(key);
			return;
		}
		if (!wasStopping && code !== null && code !== 0)
			warn(`${key} exited (code ${code})`);
	});
}

export function startProc(key, cwd, cmd, args, color, options = {}) {
	if (procs[key]) {
		warn(`${key} is already running.`);
		return;
	}

	procSpecs[key] = { cwd, cmd, args, color };
	procState[key] = procState[key] || {
		pendingRestart: false,
		stopping: false,
	};

	spawnProc(key);

	if (options.watchPaths && !watchers[key]) {
		startPollingWatcher(key, cwd, options);
	}
}

export function stopProc(key) {
	const hadWatcher = Boolean(watchers[key]);
	clearWatcher(key);
	if (procs[key]) {
		procState[key].pendingRestart = false;
		procState[key].stopping = true;
		procs[key].kill("SIGTERM");
		ok(`Stopped ${key}`);
	} else if (hadWatcher) {
		ok(`Stopped ${key} watcher`);
	}
}

export function stopAll() {
	let stopped = false;

	for (const key of Object.keys(procs)) {
		const hadWatcher = Boolean(watchers[key]);
		clearWatcher(key);
		if (hadWatcher) stopped = true;
		if (procs[key]) {
			procState[key].pendingRestart = false;
			procState[key].stopping = true;
			procs[key].kill("SIGTERM");
			ok(`Stopped ${key}`);
			stopped = true;
		}
	}

	for (const port of [8716, 8717, 8765]) {
		try {
			const pids = execSync(`lsof -ti :${port} 2>/dev/null`)
				.toString()
				.trim()
				.split(/\s+/)
				.filter(Boolean);
			for (const pid of pids) {
				try {
					process.kill(Number(pid), "SIGTERM");
					stopped = true;
				} catch (_) {}
			}
		} catch (_) {}
	}

	return stopped;
}
