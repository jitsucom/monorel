// @ts-ignore
import * as child_process from "child_process"
import * as path from "path"
import * as process from "process"
import * as fs from "fs"
import { error, log, warn } from "./log"
import { getResultOfCommand, runProjectCommand } from "./command"
import { getSubpackages } from "./pnpm"
import semver from "semver"
import inquirer from "inquirer"

const minimist = require("minimist")

function getReleaseTime(): string {
  const twoDigit = (val: string | number) => (val.toString().length == 1 ? `0${val.toString()}` : val.toString())
  const now = new Date()
  return `${now.getUTCFullYear()}${twoDigit(now.getUTCMonth() + 1)}${twoDigit(now.getUTCDate())}${twoDigit(
    now.getUTCHours()
  )}${twoDigit(now.getUTCMinutes())}${twoDigit(now.getUTCSeconds())}`
}

function getRevision() {
  return getResultOfCommand("git rev-list --abbrev-commit HEAD").split("\n").length
}

function buildFilterArgs(filter: string | string[] | undefined | null): string {
  if (!filter) {
    return ""
  }
  return (typeof filter === "string" ? [filter] : filter).map(f => `--filter '${f}'`).join(" ")
}

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
        //debug(`Rolling back ${path}. Content: ${content}`)
        fs.writeFileSync(path, content)
      }
    },
    updateFile(path: string, newContent: string | ((oldContent: string) => string)) {
      if (rollbacks[path]) {
        throw new Error(`File ${path} is already updated`)
      }
      //debug(`Updating file ${path}. The file will be rolled back after the release`)
      const currentContent = fs.readFileSync(path).toString()
      //debug(`Current content of ${path} is ${currentContent}`)
      rollbacks[path] = currentContent
      const newContentStr = typeof newContent === "string" ? newContent : newContent(currentContent)
      fs.writeFileSync(path, newContentStr)
    },
  }
}

export type Version = {
  version: string
  base: string
  marker?: string
  type: "canary" | "release"
}

async function askForVersion(pkgName: string, canary: boolean) {
  const subpackages = getSubpackages()
  const allVersions = subpackages
    .map(subpackage => {
      try {
        return JSON.parse(
          getResultOfCommand(`pnpm view ${subpackage.name} versions --json`, { print: "nothing" })
        ) as string[]
      } catch (e) {
        //ignore
        return []
      }
    })
    .flat() as string[]
  //remove duplicates
  const versions = Array.from(new Set(allVersions))
    .map(version => {
      if (semver.valid(version)) {
        const parsedVersion = semver.parse(version)!
        return {
          type: parsedVersion?.prerelease?.length > 0 ? "canary" : "release",
          base: `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`,
          marker: parsedVersion?.prerelease?.[0],
          version: version,
        } as Version
      }
    })
    .filter(v => !!v) as Version[]

  const lastVersion = versions
    .filter(v => v.type === (canary ? "canary" : "release"))
    .sort((a, b) => semver.compare(a.version, b.version))
    .pop()!

  const suggestedVersion =
    canary && lastVersion
      ? placeholder(`${lastVersion.base}-${lastVersion.marker || "canary"}.{rev}.{time}`, {
          rev: getRevision,
          time: getReleaseTime,
        })
      : lastVersion
      ? semver.inc(lastVersion.version, canary ? "prerelease" : "patch")
      : "0.0.1"
  const { version: newVersion } = await inquirer.prompt<{ version: string }>([
    {
      type: "input",
      name: "version",
      message: `Enter new version${
        lastVersion ? ` (last ${canary ? "canary" : "release"} version ${lastVersion.version})` : ``
      }`,
      default: suggestedVersion,
    },
  ])
  return newVersion
}

function getToolingVersions(): { node: string; pnpm?: string; npm?: string } {
  return {
    node: process.versions.node,
    pnpm: getResultOfCommand("pnpm --version", { onError: "" }),
    npm: getResultOfCommand("npm --version", { onError: "" }),
  }
}

async function run(args: any) {
  const toolingVersions = getToolingVersions()
  log(`Environment: pnpm v${toolingVersions.pnpm}, node v${toolingVersions.node}, npm v${toolingVersions.npm}`)
  if (!toolingVersions.npm) {
    throw new Error(`Can't find npm. Please make sure you have npm installed, check with npm --version`)
  }
  if (!toolingVersions.pnpm) {
    throw new Error(`Can't find pnpm. Please, install it with \`npm i -g pnpm\`, check with pnpm --version`)
  }

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

  if (!args["npm-tag"]) {
    throw new Error(`--npm-tag command line argument is required`)
  }

  if (!args.version) {
    args.version = await askForVersion(packageJson.name, args["npm-tag"] === "canary")
    if (args.version) {
      log(`Will release version ${args.version}`)
    } else {
      throw new Error(`Please, specify version with --version argument`)
    }
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
  if (getResultOfCommand(`git tag -l ${gitTag}`).trim() !== "") {
    throw new Error(
      `Tag ${gitTag} already exists. Seems like version ${version} has already been released. If you believe this is an error, please run \`git tag -d ${gitTag}\``
    )
  }

  try {
    const subpackages = getSubpackages()
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
