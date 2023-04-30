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

function getReleaseTime(): string {
  const twoDigit = (val: string | number) => (val.toString().length == 1 ? `0${val.toString()}` : val.toString())
  const now = new Date()
  return `${now.getUTCFullYear()}${twoDigit(now.getUTCMonth() + 1)}${twoDigit(now.getUTCDate())}${twoDigit(
    now.getUTCHours()
  )}${twoDigit(now.getUTCMinutes())}${twoDigit(now.getUTCSeconds())}`
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

function placeholder(text: string, params: Record<string, (() => any) | any>) {
  for (const [param, val] of Object.entries(params)) {
    const replaceValue = typeof val == "function" ? val()?.toString() : val?.toString()
    const variable = "{" + param + "}"
    text = text.split(variable).join(replaceValue)
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

type FileUpdater = {
  updateFile(path: string, newContent: string | ((oldContent: string) => string))
  rollback()
}

function updateDependencies(
  packageJson,
  version: string,
  depType: "dependencies" | "devDependencies" = "dependencies"
) {
  for (const [depName, depVersion] of Object.entries((packageJson[depType] || {}) as Record<string, string>)) {
    if (depVersion.toLowerCase().trim() === "workspace:*") {
      packageJson[depType][depName] = version
    }
  }
}

function createFileUpdater(): FileUpdater {
  const rollbacks: Record<string, string> = {}
  return {
    rollback() {
      for (const [path, content] of Object.entries(rollbacks)) {
        debug(`Rolling back ${path}. Content: ${content}`)
        fs.writeFileSync(path, content)
      }
    },
    updateFile(path: string, newContent: string | ((oldContent: string) => string)) {
      if (rollbacks[path]) {
        throw new Error(`File ${path} is already updated`)
      }
      debug(`Updating file ${path}. The file will be rolled back after the release`)
      const currentContent = fs.readFileSync(path).toString()
      debug(`Current content of ${path} is ${currentContent}`)
      rollbacks[path] = currentContent
      const newContentStr = typeof newContent === "string" ? newContent : newContent(currentContent)
      fs.writeFileSync(path, newContentStr)
    },
  }
}

async function run(args: any) {
  const workingDir = path.resolve(args["dir"] || process.cwd() || ".")
  const rootPackageJsonFile = path.resolve(workingDir, "package.json")
  if (!fs.existsSync(rootPackageJsonFile)) {
    throw new Error(`Can't find package.json in ${workingDir}`)
  }
  const packageJson = JSON.parse(fs.readFileSync(rootPackageJsonFile).toString())
  const fileUpdater: FileUpdater = createFileUpdater()

  if (!args.filter) {
    log("No filter specified, running release for all packages")
  }

  if (!args.version) {
    throw new Error(`--version command line argument is required`)
  }

  if (!args["npm-tag"]) {
    throw new Error(`--npm-tag command line argument is required`)
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

  const version = placeholder(args.version, { rev: getRevision, time: getReleaseTime })
  const gitTag = placeholder(args["git-tag"] || `v{version}`, { version })
  const originalVersion = packageJson.version
  if (!originalVersion) {
    throw new Error(`Can't find original version of the package. All env variables: ${JSON.stringify(process.env)}`)
  }
  log(`Releasing version ${version} (current version ${originalVersion}). Git tag: ${gitTag}`)
  if (getFromCli(`git tag -l ${gitTag}`).trim() !== "") {
    throw new Error(
      `Tag ${gitTag} already exists. Seems like version ${version} has already been released. If you believe this is an error, please run \`git tag -d ${gitTag}\``
    )
  }

  try {
    const pnpmWorkspacesJsonString = runProjectCommand(`pnpm m ls --json`, { print: "error" }).stdout.toString()
    let subpackages: any
    try {
      subpackages = JSON.parse(pnpmWorkspacesJsonString)
    } catch (e: any) {
      throw new Error(`Can't parse output of \`pnpm m ls --json\` as JSON: \`${e?.message}\``)
    }
    for (const subpackage of subpackages) {
      const subpackagePath = subpackage.path
      const subpackagePackageJsonFile = path.resolve(subpackagePath, "package.json")
      if (!fs.existsSync(subpackagePackageJsonFile)) {
        throw new Error(`Can't find package.json in ${subpackagePath}`)
      }
      fileUpdater.updateFile(subpackagePackageJsonFile, (oldContent: string) => {
        const packageJson = JSON.parse(oldContent)
        packageJson.version = version
        updateDependencies(packageJson, version)
        return JSON.stringify(packageJson, null, 2)
      })
    }

    if (!args.publish) {
      log("Skipping publish, making a dry run. Add --publish to make a real release.")
    }
    runProjectCommand(
      `pnpm publish --tag ${args["npm-tag"]} ${buildFilterArgs(args.filter)} --access public --force --no-git-checks ${
        args.publish ? "" : "--dry-run"
      }`
    )
    const tagCommand = `git tag -a ${gitTag} -m "Release ${version}"`
    const pushCommand = args["push-tag"] ? `git push origin ${gitTag}` : ""
    if (args.publish) {
      runProjectCommand(tagCommand)
      if (pushCommand) {
        runProjectCommand(pushCommand)
      }
    } else {
      log(
        `Because of dry run, not tagging the release. Here is the command that would tag it: \`${tagCommand}${
          pushCommand ? ` && ${pushCommand}` : ""
        }\``
      )
    }
  } finally {
    log(`Rolling back version in package.json(s) ${version} → ${originalVersion}`)
    fileUpdater.rollback()
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
