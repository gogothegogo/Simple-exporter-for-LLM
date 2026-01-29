# Note Exporter for LLM (Obsidian Plugin)

A lightweight Obsidian plugin designed to streamline the process of providing context to Large Language Models (LLMs) like ChatGPT, Claude, or Gemini. Quickly export your notes and canvas files in a structured format optimized for LLM comprehension.

## Features

- **Folder Export:** Right-click any folder to copy all its Markdown (`.md`) and Canvas (`.canvas`) files to your clipboard.
- **Context Builder:** A dedicated UI to hand-pick specific files and folders, allowing you to build the perfect context for your prompt.
- **Structured Formats:** Choose between **XML**, **JSON**, or a fully **Custom Template** to suit different LLM requirements.
- **Visual File Tree:** Automatically includes a directory tree structure to help the LLM understand your project's organization.
- **Multi-File Selection:** Select multiple files in the file explorer and export them all at once.
- **Active Folder Shortcut:** Quickly export the entire folder containing your currently open note via a command.
- **Tag Filtering:** Define tags (including nested tags like `#private/sensitive`) in settings to automatically exclude specific notes from all exports and the Context Builder.

## Installation

### From GitHub (Manual)
1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the releases.
2. Create a folder named `note-exporter-for-llm` in your vault's plugin directory: `<vault>/.obsidian/plugins/note-exporter-for-llm`.
3. Move the downloaded files into that folder.
4. Reload Obsidian and enable the plugin in **Settings > Community plugins**.

## How to Use

### 1. Quick Copy
- Right-click a folder in the File Explorer and select **"Copy folder contents for LLM"**.
- Right-click a single file or a selection of files and select **"Copy file(s) for LLM"**.

### 2. Context Builder
- Open the **Context Builder** from the folder/file context menu or via the Command Palette (`Ctrl/Cmd + P` -> "Open Context Builder").
- Search for and add specific notes.
- Review and remove files or sub-folders from your selection.
- Click **"Copy to Clipboard"** when ready.

### 3. Settings & Customization
Go to **Settings > Note exporter for LLM** to:
- **Base Template:** Choose a starting template (**XML** or **JSON**).
- **Template Configuration:** Fully customize how the context is built.
    - `Context Prefix`: Text at the very beginning. Use `{{TREE}}` to insert the visual file structure.
    - `Context Suffix`: Text at the very end.
    - `Item Prefix`: Text before each file. Placeholders: `{{PATH}}`, `{{CTIME}}`, `{{MTIME}}`.
    - `Item Suffix`: Text after each file.
- **Ignored Tags:** Enter a comma-separated list of tags you want to exclude. 
    - Example: `#private, archive`
    - Nested tags are supported: ignoring `#work` will also ignore `#work/projectA`.
    - These files will be hidden from the Context Builder and skipped during any clipboard export.

## Example Output (XML)

```xml
<context>
<tree>
├── Project/
│   ├── Notes/
│   │   └── Research.md
│   └── Todo.md
</tree>
<item loc="Project/Todo.md" created="2024-01-20T10:00:00Z" modified="2024-01-21T15:30:00Z">
Note content goes here...
</item>
</context>
```
