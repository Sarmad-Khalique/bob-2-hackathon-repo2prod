# Repo2Prod

VS Code extension that turns an unfamiliar repository into a verified local runtime for IBM Bob IDE.

## Development prerequisites

- Node.js 20 or newer
- pnpm 9 or newer
- VS Code or IBM Bob IDE

## Scripts

```bash
pnpm install
pnpm run compile
pnpm run package
```

`pnpm run watch` recompiles on change. `package` builds a VSIX with `@vscode/vsce`. Compile before packaging.

Implementation is currently scaffold-only.
