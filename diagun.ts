#!/usr/bin/env bun
import Diagon from "diagonjs";
import { parser } from "@lezer/markdown";
import { parseArgs } from "node:util";
import { watch } from "node:fs";
import { lstat as stat } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";

const names = ["math", "sequence", "tree", "table", "grammar", "frame", "graphDAG"] as const;
const ignored = new Set([".git", "node_modules", ".operator"]);
const args = parseArgs({ options: { watch: { type: "boolean" }, help: { type: "boolean", short: "h" } }, allowPositionals: true });
if (args.values.help) {
  console.log([
    "diagun [file.md | directory] [--watch]",
    "",
    "Render Diagon blocks in Markdown files in place.",
    "Defaults to the current directory; directories are scanned recursively for .md files.",
    "",
    "OPTIONS",
    "  --watch     Render once, then update created or changed Markdown files.",
    "  -h, --help  Show this help without changing files.",
    "",
    "MARKDOWN FORMAT",
    "  In your .md file, use a fenced code block with the language 'diagon',",
    "  followed by exactly one case-sensitive translator name:",
    "  " + names.join(", "),
    "  A bare 'diagon' fence is not valid. Options after the name are not supported.",
    "",
    "  Save the document with a .md extension. Put headings, paragraphs, links,",
    "  and other normal Markdown OUTSIDE the Diagon fence. The block body is",
    "  plain translator input, not Markdown: do not add inline-code backticks",
    "  or Markdown formatting around the source.",
    "  You can include multiple Diagon blocks in one file, with a different",
    "  translator on each block. Ordinary code blocks are left untouched.",
    "",
    "  Start with just the editable source:",
    "",
    "    ```diagon math",
    "    f(x) = 1 + x / (1 + x)",
    "    ```",
    "",
    "  Run diagun on the file. It keeps the source and inserts the rendered output",
    "  above a line containing exactly three hyphens (---):",
    "",
    "    ```diagon math",
    "                  x",
    "    f(x) = 1 + ─────",
    "               1 + x",
    "    ---",
    "    f(x) = 1 + x / (1 + x)",
    "    ```",
    "",
    "  After the first run, edit only the source BELOW ---. Run diagun again or",
    "  use --watch to refresh the output. Edits above --- are overwritten.",
    "  Keep --- inside the same fence, on its own line with no extra spaces.",
    "  Do not move the source into a separate block or delete it after rendering.",
    "  Preserve spaces in generated diagrams: they align the characters.",
    "  The first standalone --- line is the separator; do not put such a line",
    "  in a source-only block. All later lines belong to the source.",
    "",
    "OTHER TRANSLATORS",
    "  Each translator uses its own Diagon source syntax. For example:",
    "",
    "    ```diagon sequence",
    "    Alice -> Bob: Hello!",
    "    ```",
    "",
    "    ```diagon graphDAG",
    "    start -> build -> finish",
    "    ```",
    "",
    "  Math uses Unicode output; other translators use their library defaults.",
    "  GraphPlanar and Flowchart are not supported; old names such as Math and",
    "  GraphDAG must be changed to the exact names listed above.",
    "",
    "FENCES AND NESTING",
    "  Backtick or tilde fences are supported. Always include a closing fence.",
    "  Use at least three matching backticks or tildes; the closing fence must",
    "  use the same character and be at least as long as the opening fence.",
    "  Put the opening fence, body, and closing fence on separate lines.",
    "  At document level, keep fences unindented (four leading spaces can make",
    "  an indented code block instead). Blank lines around blocks are recommended.",
    "",
    "    ~~~diagon math",
    "    x / 2",
    "    ~~~",
    "",
    "  Blocks can appear in lists or blockquotes; use normal Markdown indentation",
    "  and keep the container prefix on every source and closing-fence line:",
    "",
    "    > ```diagon math",
    "    > x / 2",
    "    > ```",
    "",
    "    - Example:",
    "",
    "      ```diagon math",
    "      x / 2",
    "      ```",
    "",
    "  To show a Diagon block as documentation without rendering it, wrap it in",
    "  a longer code fence (for example, four backticks around a triple-backtick",
    "  example). Blocks inside another code fence are left untouched.",
    "  Surrounding Markdown, editable source, and line endings are preserved.",
    "  If any Diagon block in a file fails, that file is left unchanged.",
    "",
    "COMMAND EXAMPLES",
    "  diagun README.md",
    "  diagun ./docs",
    "  diagun ./docs --watch",
    "",
    "Translator syntax: https://github.com/elmouradiaminedev/diagonjs",
  ].join("\n"));
  process.exit(0);
}
if (args.positionals.length > 1) throw new Error("Expected one file or directory");
const root = resolve(args.positionals[0] ?? ".");
const rootStat = await stat(root);
if (rootStat.isSymbolicLink() || (!rootStat.isDirectory() && (!rootStat.isFile() || !root.endsWith(".md")))) throw new Error("Expected a Markdown file or directory");
const diagon = await Diagon.init();

export function renderMarkdown(text: string): string {
  const edits: { from: number; to: number; value: string }[] = [];
  parser.parse(text).iterate({ enter(node) {
    if (node.name !== "FencedCode") return;
    const info = node.node.getChild("CodeInfo");
    const tokens = info ? text.slice(info.from, info.to).trim().split(/\s+/) : [];
    if (tokens[0] !== "diagon") return false;
    const line = text.slice(0, node.from).split("\n").length;
    const fail = (message: string): never => { throw new Error(`line ${line}: ${message}`); };
    if (tokens.length !== 2 || !names.includes(tokens[1] as typeof names[number])) fail("Expected an explicit translator: " + names.join(", "));
    const marks = node.node.getChildren("CodeMark");
    if (marks.length !== 2) fail("Unterminated Diagon fence");
    const open = marks[0], close = marks[1];
    const bodyStart = text.indexOf("\n", open.to) + 1;
    const closeStart = text.lastIndexOf("\n", close.from - 1) + 1;
    const prefix = text.slice(closeStart, close.from);
    const eol = text.slice(open.to, bodyStart).endsWith("\r\n") ? "\r\n" : "\n";
    const raw = text.slice(bodyStart, closeStart);
    const lines = raw ? raw.split("\n").slice(0, -1) : [];
    const contents = lines.map(value => {
      value = value.replace(/\r$/, "");
      if (value.startsWith(prefix)) return value.slice(prefix.length);
      let offset = 0;
      for (const char of prefix) {
        if (char === ">") {
          while (value[offset] === " " || value[offset] === "\t") offset++;
          if (value[offset] !== ">") fail("Cannot safely remove Markdown container prefix");
          offset++;
        } else if (value[offset] === char) offset++;
      }
      return value.slice(offset);
    });
    const separator = contents.findIndex(value => value === "---");
    const source = contents.slice(separator < 0 ? 0 : separator + 1).join("\n");
    const name = tokens[1] as typeof names[number];
    let rendered: string;
    try {
      rendered = name === "math" ? diagon.translate.math(source, { style: "Unicode" }) : diagon.translate[name](source);
    } catch (error) { return fail(String(error)); }
    rendered = rendered.replace(/(?:\r?\n)+$/, "");
    const value = rendered.split(/\r?\n/).map(value => prefix + value).join(eol) + eol;
    let end = bodyStart;
    if (separator >= 0) for (let i = 0; i < separator; i++) end += lines[i].length + 1;
    edits.push({ from: bodyStart, to: end, value: value + (separator < 0 ? prefix + "---" + eol : "") });
    return false;
  } });
  for (const edit of edits.reverse()) text = text.slice(0, edit.from) + edit.value + text.slice(edit.to);
  return text;
}

function eligible(path: string): boolean {
  return path.endsWith(".md") && !relative(rootStat.isDirectory() ? root : dirname(root), path).split(sep).some(part => ignored.has(part));
}

async function processFile(path: string) {
  try {
    if (!eligible(path)) return;
    const info = await stat(path);
    if (info.isSymbolicLink() || !info.isFile()) return;
    for (;;) {
      const file = Bun.file(path);
      const before = await file.text();
      const after = renderMarkdown(before);
      if (before === after) return;
      if (await file.text() !== before) continue;
      await Bun.write(path, after);
      console.log("updated:", path);
      return;
    }
  } catch (error) {
    console.error(`${path}: ${error instanceof Error ? error.message : error}`);
    if (!args.values.watch) process.exitCode = 1;
  }
}

async function scan() {
  if (!rootStat.isDirectory()) return processFile(root);
  const glob = new Bun.Glob("**/*.md");
  for await (const path of glob.scan({ cwd: root, absolute: true, dot: true, followSymlinks: false, onlyFiles: true })) {
    if (eligible(path)) await processFile(path);
  }
}

let running = false;
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout>;
function queue(path: string) {
  pending.add(path);
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (running) return;
    running = true;
    try {
      while (pending.size) {
        const paths = [...pending];
        pending.clear();
        for (const path of paths) {
          if (await Bun.file(path).exists()) await processFile(path);
        }
      }
    }
    catch (error) { console.error(error); }
    finally { running = false; }
  }, 80);
}

if (args.values.watch) {
  const target = rootStat.isDirectory() ? root : dirname(root);
  const watcher = watch(target, { recursive: rootStat.isDirectory() }, (_, filename) => {
    if (!filename) return;
    const path = resolve(target, filename);
    if (rootStat.isDirectory() ? eligible(path) : path === root) queue(path);
  });
  watcher.on("error", error => { console.error(error); process.exitCode = 1; watcher.close(); });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { watcher.close(); clearTimeout(timer); process.exit(); });
  running = true;
  await scan();
  running = false;
  if (pending.size) queue([...pending][0]);
} else await scan();
