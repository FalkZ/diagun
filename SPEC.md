# Diagun

## Purpose

A small Bun CLI keeps diagrams and their editable source together in Markdown files. It renders through `diagonjs`, updates files in place, and can watch for changes. It uses the published `diagonjs` package rather than a bundled renderer.

The CLI is named `diagun`. Its implementation is in `diagun.ts`.

## Stack

- TypeScript running directly on Bun.
- Bun file APIs and `Bun.Glob` for reading, writing, and finding files.
- Built-in `node:util` argument parsing and `node:fs` watching, supported by Bun; no CLI or watcher package.
- `diagonjs` for rendering, initialized once per process with `await Diagon.init()`.
- `@lezer/markdown` for full Markdown parsing with source positions.
- No Docker, subprocess renderer, custom diagram engine, Markdown serializer, or configuration file.

Bun compatibility with the published `diagonjs` package and recursive watching must be verified when implementing. Do not claim compatibility based solely on the package's Node.js support.

## CLI

`diagun [path] [--watch]`

Run `bun install`, then `bun run apply` to register the global command through `bun link`. For local use, run `bun run start -- [path] [--watch]`. `bun run check` checks TypeScript.

- Accept one Markdown file or directory. Default to the current directory.
- For a directory, recursively process files ending in `.md`.
- Skip `.git`, `node_modules`, and `.operator` directories. Do not follow symbolic links.
- Process specification files normally; examples inside enclosing code fences must remain untouched.
- Without `--watch`, update files once and exit.
- With `--watch`, perform an initial update, then process created or changed Markdown files within the selected path.
- Report changed file paths. Report errors with the file path and block location when available.
- Exit nonzero on invalid arguments, initialization failures, or any one-shot processing failure. Continue processing other files after a file-specific failure.
- In watch mode, report file-specific errors and continue watching. Stop on termination.

## Markdown blocks

Recognize fenced code blocks whose first info-string token is exactly `diagon`. Require exactly one additional token naming a translator. Reject missing or unknown translators and extra tokens in recognized Diagon blocks.

Support these case-sensitive names, matching the `diagonjs` API:

| Fence translator | Renderer |
| --- | --- |
| `math` | `diagon.translate.math` |
| `sequence` | `diagon.translate.sequence` |
| `tree` | `diagon.translate.tree` |
| `table` | `diagon.translate.table` |
| `grammar` | `diagon.translate.grammar` |
| `frame` | `diagon.translate.frame` |
| `graphDAG` | `diagon.translate.graphDAG` |

There is no default translator. Bare `diagon` blocks are errors. Old translator names are not silently converted. `GraphPlanar` and `Flowchart` are unsupported because `diagonjs` does not expose them.

Use `{ style: "Unicode" }` for math. Use the library defaults for other translators. Translator options in Markdown or CLI flags are outside this version's scope.

## Source and output

Keep the existing format: generated output, a standalone `---` line, then editable source, all within one Diagon fence.

- Without a separator, the entire block body is source. The first update inserts generated output and the separator before it.
- With a separator, the first standalone `---` line divides generated output from source. Everything below it is source.
- The separator is reserved; source-only input containing such a line is ambiguous and is not supported.
- Preserve editable source, including whitespace. Remove Markdown container prefixes only from the text passed to the renderer.
- Replace only the generated output region, or insert output and a separator for a source-only block.
- Remove terminal line breaks from renderer output before inserting the document's line ending and separator. Preserve spaces used to align diagrams.
- Do not write a file when the resulting bytes are unchanged.

## Markdown preservation

Use the full parser to identify actual fenced code blocks, including blocks inside lists and blockquotes. Do not find blocks with a document-wide regular expression.

- Support backtick and tilde fences and valid longer fences.
- Leave apparent Diagon blocks inside other code fences untouched.
- Preserve all text outside generated regions byte-for-byte, including opening and closing fences, info strings, source, indentation, and final-newline presence.
- Preserve LF or CRLF line endings when inserting output.
- Apply the correct list indentation and blockquote prefixes to generated lines and the separator.
- Use parser source positions and localized edits; never serialize the complete Markdown tree.
- Leave unterminated fences untouched and report recognized unterminated Diagon blocks as errors rather than guessing their extent.

## Writes and failures

Render all recognized blocks in a file before writing it. If parsing, validation, or rendering fails, leave that file unchanged. Apply edits from the end of the document toward the beginning so source positions remain valid.

Serialize processing of each file. In watch mode, combine rapid duplicate events and ignore updates that produce identical contents. The CLI's own writes must not cause an endless update loop. If a file changes while being rendered, reread and process it rather than overwrite newer edits.

## Implementation acceptance

When implementation is requested, verify:

- Each of the seven translators runs under Bun using the published package.
- Source-only and previously rendered blocks update correctly; a second run changes nothing.
- Missing or unsupported translators fail without modifying the file.
- Multiple blocks, nested list and blockquote blocks, both fence types, longer enclosing example fences, LF, and CRLF preserve unrelated Markdown and source.
- One failed block prevents all writes to its file without preventing other files from being processed.
- Watch mode handles edits and new files in nested directories without self-triggered loops or overwriting intervening edits.

The root package manifest provides `start`, `check`, and `apply` scripts. The lockfile pins dependencies. No Go or C++ build is required.

## References

- [diagonjs usage and supported translators](https://github.com/elmouradiaminedev/diagonjs)
- [diagonjs translator API](https://github.com/elmouradiaminedev/diagonjs/blob/main/src/translators/index.ts)
- [Markdown parser](https://github.com/lezer-parser/markdown)
- [Bun file APIs](https://bun.sh/docs/api/file-io)
- [Bun.Glob](https://bun.sh/docs/api/glob)
- [Bun Node.js compatibility](https://bun.sh/docs/runtime/nodejs-compat)
