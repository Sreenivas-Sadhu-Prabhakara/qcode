import { spawn } from 'node:child_process';

interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface ProcessInput {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
}

type ProcessRunner = (cmd: string, args: string[], opts?: ProcessInput) => Promise<ProcessResult>;

const runProcess: ProcessRunner = (cmd, args, opts = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutId: NodeJS.Timeout | undefined = undefined;

    if (opts.timeoutMs != null) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, opts.timeoutMs);
    }

    child.stdout.on('data', (data) => {
  stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (timedOut) {
        reject(new Error('timed out'));
      } else {
        resolve({
          stdout,
          stderr,
          code: code ?? 0,
        });
      }
    });
    
    if (opts.input != null) {
      const stdin = child.stdin;
      if (stdin != null) {
        stdin.write(opts.input);
        stdin.end();
      }
    }
  });
};

export { type ProcessResult, type ProcessInput, type ProcessRunner, runProcess };
