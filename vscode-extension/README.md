# C-Agents Language Support

Syntax highlighting and snippets for [C-Agents](https://github.com/dc-dc-dc/cagents) `.ca` files.

C-Agents is a C-like DSL for defining AI agents. Write your agent once in a `.ca` file and compile it to Claude, Kiro, Gemini, Codex, or Cursor.

---

## Features

**Syntax highlighting** for:
- `#def` directives — frontmatter keys and values
- `fn` function declarations — name and parameter types (`str`, `int`, `bool`, `float`)
- `#include` — local files and GitHub repo paths
- `#if` / `#endif` — conditionals
- `#pragma` — pragma directives
- `${var}` — variable interpolation
- `//` — comments

**Snippets** — trigger with the prefix, then `Tab`:

| Prefix | Inserts |
|--------|---------|
| `agent` | Full agent file with common frontmatter |
| `fn` | Skill function block |
| `main` | `fn main()` system prompt block |
| `#def model` | Model selector (`sonnet` / `haiku` / `opus`) |
| `#def tools` | Tools list |
| `#def effort` | Effort level selector |
| `#def permissionMode` | Permission mode selector |
| `#if` | Conditional block |
| `#include "` | Local file include |
| `#include <` | GitHub repo include |

---

## Example

```ca
#def name researcher
#def description Researches topics and produces structured reports
#def model opus
#def tools WebSearch, WebFetch, Write

fn search(str query, int max_results) {
    Search the web for query.
    Return the top max_results results with titles and URLs.
}

fn main() {
    You are a research analyst.
    Cite every fact with its source URL.
}
```

---

## Installation

From the [cagents](https://github.com/dc-dc-dc/cagents) project root:

```sh
npm run vscode:install
```

Then reload the VS Code window (`Cmd+Shift+P` → `Developer: Reload Window`).
