/**
 * Shared helpers for the PHP integration tests: spawn a `php -S` server,
 * wait for it to be ready, fetch, and check apiBase reachability.
 */

const { spawn } = require("node:child_process");
const http = require("node:http");

/**
 * Start a `php -S <host>:<port> <docroot/harness>` server. Resolves once the
 * server responds on `/`, or rejects after a timeout.
 *
 * @param {object} opts
 * @param {number} opts.port
 * @param {string} opts.harness Absolute path to the harness PHP file.
 * @param {string} [opts.docroot] Working directory for the PHP server.
 * @param {NodeJS.ProcessEnv} [opts.env] Extra env vars for the child.
 * @returns {Promise<{proc: import('child_process').ChildProcess, kill: () => void}>}
 */
function startPhpServer(opts) {
  return new Promise((resolve, reject) => {
    const args = ["-S", `127.0.0.1:${opts.port}`, opts.harness];
    const proc = spawn("php", args, {
      cwd: opts.docroot || process.cwd(),
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrBuf = "";
    proc.stderr.on("data", (d) => {
      stderrBuf += d.toString();
    });

    const kill = () => {
      try {
        proc.kill("SIGTERM");
      } catch (_) {}
    };

    const startupTimeout = setTimeout(() => {
      kill();
      reject(
        new Error(
          `php -S did not start on port ${opts.port}\nstderr:\n${stderrBuf}`,
        ),
      );
    }, 8000);

    // Poll until the server is accepting connections.
    const deadline = Date.now() + 8000;
    const poll = () => {
      if (Date.now() > deadline) {
        clearTimeout(startupTimeout);
        kill();
        reject(new Error(`php -S startup timed out. stderr:\n${stderrBuf}`));
        return;
      }
      const req = http.get(
        { host: "127.0.0.1", port: opts.port, path: "/" },
        (res) => {
          res.resume();
          res.on("end", () => {
            clearTimeout(startupTimeout);
            resolve({ proc, kill });
          });
        },
      );
      req.on("error", () => setTimeout(poll, 100));
    };
    setTimeout(poll, 200);
  });
}

/**
 * Fetch the response body as text from a URL.
 * @param {string} url
 * @returns {Promise<{status:number, text:string}>}
 */
async function fetchText(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, text };
}

module.exports = { startPhpServer, fetchText };
