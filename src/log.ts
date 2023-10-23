export type Logger = (arg: any, ...args: any[]) => void

function createLogger(level: "log" | "error" | "debug" | "warn"): Logger {
  const logFunction = console[level]
  return (arg: any, ...args: any[]) => {
    const msg = "[monorel] " + (arg ? arg.toString() : "")
    logFunction(...[msg, ...args])
  }
}

export const log = createLogger("log"),
  debug = createLogger("debug"),
  warn = createLogger("warn"),
  error = createLogger("error")
