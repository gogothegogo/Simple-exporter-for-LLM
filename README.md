# Simple Exporter for LLM (Obsidian Plugin)

A lightweight Obsidian plugin designed to streamline the process of providing context to Large Language Models (LLMs) like ChatGPT, Claude, or Gemini. Quickly export your notes and canvas files in a structured format optimized for LLM comprehension.

## Features

- **Folder Export:** Right-click any folder to copy all its Markdown (`.md`) and Canvas (`.canvas`) files to your clipboard.
- **Tag Export:** Right-click any tag in the Tag Pane or Notebook Navigator to export all associated notes. Supports nested tags and maintains tag hierarchy in the exported tree.
- **Context Builder:** A dedicated UI to hand-pick specific files, folders, and tags. 
    - **Granular Control:** Remove individual notes or sub-branches directly from the tag or folder tree.
    - **Hybrid Search:** Search for both notes and tags to add to your context selection.
- **Notebook Navigator Integration:** Fully integrated with the [Notebook Navigator](https://github.com/johansan/notebook-navigator) plugin context menus.
- **Structured Formats:** Choose between **XML**, **JSON**, or a fully **Custom Template** to suit different LLM requirements.
- **Visual File Tree:** Automatically includes directory and tag structures to help the LLM understand your project's organization. If both tags and folders are selected, both structures are included.
- **Deduplication:** Automatically ensures each note is exported only once, even if it appears in multiple selected tags.
- **Multi-File Selection:** Select multiple files in the file explorer and export them all at once.
- **Tag Filtering:** Define tags (including nested tags like `#private/sensitive`) in settings to automatically exclude specific notes from all exports and the Context Builder.

## Installation

### From GitHub (Manual)
1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the releases.
2. Create a folder named `simple-exporter-for-llm` in your vault's plugin directory: `<vault>/.obsidian/plugins/simple-exporter-for-llm`.
3. Move the downloaded files into that folder.
4. Reload Obsidian and enable the plugin in **Settings > Community plugins**.

## How to Use

### 1. Quick Copy
- Right-click a folder in the File Explorer and select **"Copy folder contents for LLM"**.
- Right-click a tag in the Tag Pane or Notebook Navigator and select **"Copy tag contents for LLM"**.
- Right-click a single file or a selection of files and select **"Copy file(s) for LLM"**.

### 2. Context Builder
- Open the **Context Builder** from any folder/file/tag context menu or via the Command Palette (`Ctrl/Cmd + P` -> "Open Context Builder").
- Search for and add specific notes or tags.
- Review the combined tree and remove specific files or sub-tags using the **"×"** button.
- Click **"Copy to Clipboard"** when ready.

### 3. Settings & Customization
Go to **Settings > Simple exporter for LLM** to:
- **Base Template:** Choose a starting template (**XML** or **JSON**).
- **Template Configuration:** Fully customize how the context is built.
    - `Context Prefix`: Text at the very beginning. Use `{{TREE}}` to insert the visual structures.
    - `Context Suffix`: Text at the very end.
    - `Item Prefix`: Text before each file. Placeholders: `{{PATH}}`, `{{CTIME}}`, `{{MTIME}}`.
    - `Item Suffix`: Text after each file.
- **Ignored Tags:** Enter a comma-separated list of tags you want to exclude. 
    - Example: `#private, archive`
    - Nested tags are supported: ignoring `#work` will also ignore `#work/projectA`.

## Example Output (XML)

```xml
<context>
Tag Structure:
└── #project
    └── #project/active
        └── Task.md

Folder Structure:
└── Project/
    └── Task.md

<item loc="Project/Task.md" created="2024-01-20T10:00:00Z" modified="2024-01-21T15:30:00Z">
Note content goes here...
</item>
</context>
```