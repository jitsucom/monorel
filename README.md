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
    "release:publish": "monorel --filter './packages/a'  --filter './packages/b'",
    "canary:publish": "monorel --filter './packages/a'  --filter './packages/b' --canary 2.0.0.alpha --publish"
  }
}
```

Run `pnpm release:publish --release X.Y.Z` to dry run publishing of release version `X.Y.Z`. If it looks good run `pnpm release:publish --release X.Y.Z --publish` to make a push to an `npm`

Run `pnpm release:publish --release X.Y.Z` to dry run publishing of release version `X.Y.Z`. If it looks good run `pnpm release:publish --release X.Y.Z --publish` to make a push to an `npm` registry. The release will be tagged with `latest` tag

Run `pnpm release:canary` to publish a canary release. The release version will be `2.0.0.alpha.${sequentialNumber}`. The version will be tagged with `canary` tag

## Parameters reference

### `--canary VERSION`

Makes a canary release. The end version will be `VERSION.REVISION` (`REVISION` is sequintial). The release will be tagged with `canary` tag

### `--release VERSION`

Makes a stable release (VERISON). The release will be tagged with `latest` tag

> **Note**
> `--canary` or `--release` should be specified (but not both)


### `--publish`

Unless specified, monorel will do a dry run

### `--filter`

Specify a list of packages to apply publishing. Should follow [pnpm filtering syntax](https://pnpm.io/filtering)




