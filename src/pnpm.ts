import { runProjectCommand } from "./command"

const commandCache = new Map<string, { val: any }>()

function getCached<T>(key: string, cmd: () => T) {
  const cached = commandCache.get(key)
  if (cached) {
    return cached.val as T
  }
  const val = cmd()
  commandCache.set(key, { val })
  return val
}

export type PkgInfo = {
  name: string
  version: string
  path: string
}

/**
 * Get list of packages in workspace. If pnpm project is not using workspaces, returns main package.json.
 */
export function getSubpackages(): PkgInfo[] {
  const pkgStr = getCached<string>("getSubpackages", () =>
    runProjectCommand(`pnpm m ls --json`, { print: "error" }).stdout.toString()
  )
  try {
    return JSON.parse(pkgStr) as PkgInfo[]
  } catch (e: any) {
    throw new Error(`Can't parse output of \`pnpm m ls --json\` as JSON: \`${e?.message}\``)
  }
}
