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
    "release:publish": "monorel --npm-tag latest --filter './packages/a'  --filter './packages/b'",
    "canary:publish": "monorel --filter './packages/a'  --filter './packages/b' --version '2.0.0.alpha.${rev}' --npm-tag canary --publish"
  }
}
```

Run `pnpm release:publish --version X.Y.Z` to dry run publishing of release version `X.Y.Z`. 
If it looks good run `pnpm release:publish --version X.Y.Z --publish` to make a push to an `npm`

Run `pnpm release:canary` to publish a canary release. The release version will be `2.0.0.alpha.${sequentialNumber}`. The version 
will be tagged with `canary` tag

## Authorization best practices

`monorel` relies on NPM registry authorization in current shell. It will fail if authorization is absent 

You can check if you're authorized by running `pnpm whoami` in the same shell where you plan to run `monorel`.

There two ways to authorize yourself:
 - Run `pnpm login`. This method will work if you're making releases manually, but for running automatic releases throuh CI you will need a different 
method
 - Create `.npmrc`, add `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` to the beginning and get a [NPM token](https://docs.npmjs.com/creating-and-viewing-access-tokens). Later
you could supply NPM_TOKEN to your CI tool for automated releases. But if you do that, *NPM will always look for `NPM_TOKEN`*. All commands (including `pnpm whoami`) will
if NPM_TOKEN is undefined or invalid, even you successfully logger in with `pnpm login` before

If you're doing only manual releases, `pnpm login` will work just fine. But universal solution will be adding an auth instruction to `.npmrc`, and
defining NPM_TOKEN locally (example )



## Parameters reference

### `--version VERSION_PATTERN`

Version pattern. The end version will be a result of replacements of placeholders in VERSION_PATTERN. Placeholder expressions:

* `{rev}` — sequiential revision numver
* `{time}` — time as `20220601234501`

### `--npm-tag TAG`

NPM registry tag. Usually either `canary` or `latest`

### `--git-tag TAG`

Git tag pattern. By default it's `v{version}`.

### `--push-tag`

If Git tag should be pushed to origin (default is `false`)

### `--publish`

Unless specified, monorel will do a dry run (meaning no actual publishing is done)

### `--filter`

Specify a list of packages to apply publishing. Should follow [pnpm filtering syntax](https://pnpm.io/filtering)




