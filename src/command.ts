import { log } from "./log"
import child_process from "child_process"
import console from "console"

export function getResultOfCommand(command: string): string {
  const { stdout } = runProjectCommand(command, { print: "error" })
  return stdout.toString().trim()
}

export type CommandOpts = {
  print?: "error" | "all" | "nothing"
  error?: (cmd: string, status: number) => string
}

/**
 * Runs command in the project root. Throws and error if command fails (exit code != 0).
 * @param command
 * @param opts see CommandOpts above
 */
export function runProjectCommand(command: string, opts: CommandOpts = {}) {
  const print = opts?.print || "all"
  log(`Running \`${command}\``)
  const { status, stderr, stdout } = child_process.spawnSync(command, {
    shell: true,
  })
  if (status !== 0) {
    const errorMsg = opts.error ? opts.error(command, status || 0) : `Command ${command} failed with status ${status}`
    if (print === "error" || print === "all") {
      console.log(printStdout(stderr, ` > `))
      console.log(printStdout(stdout, ` > `))
    }
    throw new Error(errorMsg)
  }
  if (print === "all") {
    log(printStdout(stderr, ` > `))
    log(printStdout(stdout, ` > `))
  }
  return { stdout, stderr }
}

function printStdout(stdout: any, prefix: string) {
  return [
    "",
    ...stdout
      .toString()
      .split("\n")
      .filter((line: any) => line.toString().trim() !== ""),
  ].join(`\n${prefix}`)
}
