# diagun

A small Bun CLI that renders Diagon diagrams in Markdown files in place, keeping the editable source alongside the output.

## Install

Requires [Bun](https://bun.sh).

```bash
bun install --global github:FalkZ/diagun
```

## Use

```bash
diagun README.md
diagun ./docs --watch
```

Without a path, diagun scans the current directory recursively for `.md` files. `--watch` updates diagrams as files change.

Add a block like this:

````markdown
```diagon math
x / 2
```
````

Diagun inserts the rendered diagram above a `---` separator in the same block. Edit the source below `---` and rerun the command, or use watch mode. Other Markdown is preserved; a block error leaves its file unchanged.

Supported translators: `math`, `sequence`, `tree`, `table`, `grammar`, `frame`, and `graphDAG`. Run `diagun --help` for details.

## Thanks

Thanks to Arthur Sonzogni and the contributors of [Diagon](https://github.com/ArthurSonzogni/Diagon) for this nice ascii diagram renderer.
