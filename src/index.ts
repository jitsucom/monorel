// @ts-ignore
import * as child_process from "child_process"
import * as path from "path"
import * as process from "process"
import * as console from "console"
import * as fs from "fs"

const minimist = require("minimist")

function getFromCli(command: string): string {
  const { stdout } = runProjectCommand(command, { print: "error" })
  return stdout.toString().trim()
}

function runProjectCommand(
  command: string,
  opts: {
    print?: "error" | "all" | "nothing"
    error?: (cmd: string, status: number) => string
  } = {}
) {
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

function getRevision() {
  return getFromCli("git rev-list --abbrev-commit HEAD").split("\n").length
}

function buildFilterArgs(filter: string | string[] | undefined | null): string {
  if (!filter) {
    return ""
  }
  return (typeof filter === "string" ? [filter] : filter).map(f => `--filter '${f}'`).join(" ")
}

type Logger = (arg: any, ...args: any[]) => void

function createLogger(level: "log" | "error" | "debug" | "warn"): Logger {
  const logFunction = console[level]
  return (arg: any, ...args: any[]) => {
    const msg = "[monorel] " + (arg ? arg.toString() : "")
    logFunction(...[msg, ...args])
  }
}

const log = createLogger("log"),
  debug = createLogger("debug"),
  warn = createLogger("warn"),
  error = createLogger("error")

function placeholder(text: string, params: Record<string, () => any>) {
  for (const [param, val] of Object.entries(params)) {
    const replaceValue = val()?.toString()
    const variable = "{" + param + "}"
    text = text.replaceAll(variable, replaceValue)
  }
  return text
}

function npmWhoami(): string | null {
  const { status, stdout } = child_process.spawnSync(`pnpm whoami`, {
    shell: true,
  })
  if (status !== 0) {
    return null
  } else {
    return stdout.toString().trim()
  }
}

function isWorkspace() {
  const workspaceFile = path.resolve(".", "pnpm-workspace.yaml")
  if (fs.existsSync(workspaceFile)) {
    log(`Found ${workspaceFile}. Treating project as pnpm workspace`)
    return true
  } else {
    log(`${workspaceFile} not found. Treating project as an individual pnpm project`)
    return false
  }
}

async function run(args: any) {
  if (!args.filter) {
    log("No filter specified, running release for all packages")
  }

  if (!args.version) {
    throw new Error(`--version command line argument is required`)
  }

  if (!args.tag) {
    throw new Error(`--version command line argument is required`)
  }

  const whoami = npmWhoami()
  if (!whoami) {
    if (!args.publish) {
      warn(
        `⚠️⚠️⚠️ Not authorized. Will continue because of dry run. Before running with --publish make sure you're authorized with \`pnpm login\`. Read more about npm auth: https://github.com/jitsucom/monorel#authorization-best-practices `
      )
    } else {
      throw new Error(
        `Can't find npm auth - make sure you're authorized with \`pnpm login\`.\n\t Read more about npm auth: https://github.com/jitsucom/monorel#authorization-best-practices`
      )
    }
  } else {
    log(`NPM Registry - authorized as ${whoami}`)
  }

  const version = placeholder(args.version, { rev: getRevision })
  const gitTag = `v${version}`
  const originalVersion = process.env.npm_package_version
  log(`Releasing version ${version}. Git tag: ${gitTag}`)
  if (getFromCli(`git tag -l ${gitTag}`).trim() !== "") {
    throw new Error(
      `Tag ${gitTag} already exists. Seems like version ${version} has already been released. If you believe this is an error, please run \`git tag -d ${gitTag}\``
    )
  }
  runProjectCommand(`pnpm version ${isWorkspace() ? "--ws " : " "}--no-git-tag-version ${version}`)
  try {
    if (!args.publish) {
      log("Skipping publish, making a dry run. Add --publish to make a real release.")
    }
    runProjectCommand(
      `pnpm publish --tag ${args.tag} ${buildFilterArgs(args.filter)} --access public --force --no-git-checks ${
        args.publish ? "" : "--dry-run"
      }`
    )
    const tagCommand = `git tag -a ${gitTag} -m "Release ${version}"`
    if (args.publish) {
      runProjectCommand(tagCommand)
    } else {
      log(`Because of dry run, not tagging the release. Here is the command that would tag it: ${tagCommand}`)
    }
  } finally {
    try {
      runProjectCommand(`pnpm version ${isWorkspace() ? "--ws " : " "}--no-git-tag-version ${originalVersion}`)
    } catch (e) {
      error("Failed to rollback to 0.0.0", e)
    }
  }
}

async function main() {
  const args = minimist(process.argv.slice(2))
  try {
    await run(args)
  } catch (e: any) {
    error(args.verbose ? e : `ERROR: ${e?.message || "Unknown error"}`)
    process.exit(1)
  }
}

main()
