const { spawn } = require("node:child_process");

const electronBinary = require("electron");
const args = process.argv.slice(2);
const launchArgs = args.length > 0 ? args : ["."];

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_FORCE_IS_PACKAGED;

const child = spawn(electronBinary, launchArgs, {
  cwd: process.cwd(),
  stdio: "inherit",
  env,
  windowsHide: false
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
