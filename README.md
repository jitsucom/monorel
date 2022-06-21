# Monorel

`monorel` is an opinionated publishing tool for pnpm-based monorepos. Unlike peer projects — [changesets](https://github.com/changesets/changesets) or [auto](https://github.com/intuit/auto) `monorel` is designed to be as simple as possible. 

`monorel`:

 - Works only for `pnpm` based monorepos
 - Non-intrusive. The only change it makes is git tags. **Monorel never changes version in your code**
 - Do not requires configuration file. All options are exposed as cli parameters
 - Stable releases are manual, canary releases are automatic

## Installation

```
pnpm add -Dw monorel
```

Run this command in the workspace root

## Usage

Add following scripts to your root `package.json`:

```json
{
  "scripts": {
    "release:publish": "monorel --tag latest --filter './packages/a'  --filter './packages/b'",
    "canary:publish": "monorel --filter './packages/a'  --filter './packages/b' --version '2.0.0.alpha.${rev}' --tag canary --publish"
  }
}
```

Run `pnpm release:publish --release X.Y.Z` to dry run publishing of release version `X.Y.Z`. If it looks good run `pnpm release:publish --release X.Y.Z --publish` to make a push to an `npm`

Run `pnpm release:canary` to publish a canary release. The release version will be `2.0.0.alpha.${sequentialNumber}`. The version will be tagged with `canary` tag

## Parameters reference

### `--version VERSION_PATTERN`

Version pattern. The end version will be a result of replacements of placeholders in VERSION_PATTERN. Placeholder expressions:

* `${rev}` — sequiential revision numver

Those placeholders aren't suported yet, but will be in the future:

* `${workspaceNpmVersion}` — version of workspace package
* `${gitRev}` — current git revision id
* `${time}` — time as `20220601234501`
* `${any javascript expression}` - any javascript expressions

### --tag TAG

NPM registry tag. Usually either `canary` or `latest`

### `--publish`

Unless specified, monorel will do a dry run (meaning no actual publishing is done)

### `--filter`

Specify a list of packages to apply publishing. Should follow [pnpm filtering syntax](https://pnpm.io/filtering)




