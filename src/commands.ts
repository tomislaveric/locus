import { spawn } from "node:child_process";
import { UserInputError } from "./errors.js";

export const runCommand = (
  command: string,
  args: string[],
  timeoutMs: number
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Could not start ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new UserInputError(`${command} exceeded the processing time limit.`));
      } else if (code !== 0) {
        reject(new UserInputError(`${command} rejected the media: ${stderr.trim()}`));
      } else {
        resolve(stdout);
      }
    });
  });
