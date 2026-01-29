"use strict";

var obsidian = require("obsidian");

const DEFAULT_SETTINGS = {
  format: "xml", // 'xml', 'json', or 'custom'
  includeTree: true,
  customPrefix: "<context>\n{{TREE}}\n",
  customSuffix: "\n</context>",
  customItemPrefix: '<item loc="{{PATH}}" created="{{CTIME}}" modified="{{MTIME}}">\n',
  customItemSuffix: "\n</item>\n",
};

class NoteExporterForLLM extends obsidian.Plugin {
  async onload() {
    console.log("Loading Note exporter for LLM");
    await this.loadSettings();

    this.addSettingTab(new NoteExporterSettingTab(this.app, this));

    // Register context menu for folders and files
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof obsidian.TFolder) {
          menu.addItem((item) => {
            item
              .setTitle("Copy folder contents for LLM")
              .setIcon("documents")
              .onClick(async () => {
                await this.copyFolderToClipboard(file);
              });
          });
          menu.addItem((item) => {
            item
              .setTitle("Open folder in Context Builder")
              .setIcon("layout-list")
              .onClick(() => {
                const files = [];
                this.collectFiles(file, files);
                new ContextBuilderModal(this.app, this, files).open();
              });
          });
        } else if (file instanceof obsidian.TFile && (file.extension === "md" || file.extension === "canvas")) {
          menu.addItem((item) => {
            item
              .setTitle("Copy file for LLM")
              .setIcon("document")
              .onClick(async () => {
                await this.exportFilesToClipboard([file]);
              });
          });
          menu.addItem((item) => {
            item
              .setTitle("Add file to Context Builder")
              .setIcon("layout-list")
              .onClick(() => {
                new ContextBuilderModal(this.app, this, [file]).open();
              });
          });
        }
      })
    );

    // Register context menu for multiple files
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu, files) => {
        const validFiles = files.filter(f => f instanceof obsidian.TFile && (f.extension === "md" || f.extension === "canvas"));
        
        if (validFiles.length > 0) {
          menu.addItem((item) => {
            item
              .setTitle(`Copy ${validFiles.length} files for LLM`)
              .setIcon("documents")
              .onClick(async () => {
                await this.exportFilesToClipboard(validFiles);
              });
          });
          menu.addItem((item) => {
            item
              .setTitle("Add selection to Context Builder")
              .setIcon("layout-list")
              .onClick(() => {
                new ContextBuilderModal(this.app, this, validFiles).open();
              });
          });
        }
      })
    );

    // Register command to copy active file's folder
    this.addCommand({
      id: "copy-active-folder-contents",
      name: "Copy active folder contents for LLM",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          const folder = activeFile.parent;
          if (folder) {
            await this.copyFolderToClipboard(folder);
          }
        } else {
          new obsidian.Notice("No active file found");
        }
      },
    });

    // Register command to open Context Builder
    this.addCommand({
      id: "open-context-builder",
      name: "Open Context Builder",
      callback: () => {
        new ContextBuilderModal(this.app, this, []).open();
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async copyFolderToClipboard(folder) {
    const files = [];
    this.collectFiles(folder, files);
    await this.exportFilesToClipboard(files);
  }

  async exportFilesToClipboard(files) {
    if (files.length === 0) {
      new obsidian.Notice("No files selected for export.");
      return;
    }

    new obsidian.Notice(`Exporting ${files.length} files...`);

    try {
      let output = "";
      let totalChars = 0;
      const fileTree = this.settings.includeTree ? this.generateFileTree(files) : "";

      if (this.settings.format === "json") {
        const jsonContext = {};
        for (const file of files) {
          const content = await this.app.vault.read(file);
          jsonContext[file.path] = {
            content: content,
            created: new Date(file.stat.ctime).toISOString(),
            modified: new Date(file.stat.mtime).toISOString()
          };
          totalChars += content.length;
        }
        output = JSON.stringify({
          tree: this.settings.includeTree ? fileTree : undefined,
          context: jsonContext
        }, null, 2);
      } else if (this.settings.format === "xml") {
        output = "<context>\n";
        if (this.settings.includeTree) {
          output += "<tree>\n" + fileTree + "</tree>\n";
        }
        for (const file of files) {
          const content = await this.app.vault.read(file);
          const stats = file.stat;
          output += `<item loc="${file.path}" created="${new Date(stats.ctime).toISOString()}" modified="${new Date(stats.mtime).toISOString()}">
${content}
</item>
`;
          totalChars += content.length;
        }
        output += "</context>";
      } else {
        // Custom format
        output = this.settings.customPrefix.replace("{{TREE}}", fileTree);
        for (const file of files) {
          const content = await this.app.vault.read(file);
          const stats = file.stat;
          let item = this.settings.customItemPrefix
            .replace("{{PATH}}", file.path)
            .replace("{{CTIME}}", new Date(stats.ctime).toISOString())
            .replace("{{MTIME}}", new Date(stats.mtime).toISOString());
          item += content;
          item += this.settings.customItemSuffix;
          output += item;
          totalChars += content.length;
        }
        output += this.settings.customSuffix;
      }

      await navigator.clipboard.writeText(output);
      new obsidian.Notice(`Copied ${files.length} files (${totalChars.toLocaleString()} chars) to clipboard.`);
    } catch (err) {
      console.error("Failed to copy context:", err);
      new obsidian.Notice("Failed to copy context. See console for details.");
    }
  }

  collectFiles(folder, files) {
    for (const child of folder.children) {
      if (child instanceof obsidian.TFile) {
        if (child.extension === "md" || child.extension === "canvas") {
          files.push(child);
        }
      } else if (child instanceof obsidian.TFolder) {
        this.collectFiles(child, files);
      }
    }
  }

  generateFileTree(files) {
    const tree = {};
    for (const file of files) {
      const parts = file.path.split('/');
      let current = tree;
      for (const part of parts) {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }

    const printTree = (node, prefix = '') => {
      let result = '';
      const keys = Object.keys(node).sort();
      keys.forEach((key, index) => {
        const isLast = index === keys.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        result += prefix + connector + key + (Object.keys(node[key]).length > 0 && !key.includes('.') ? '/' : '') + '\n';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        result += printTree(node[key], newPrefix);
      });
      return result;
    };

    return printTree(tree);
  }

  onunload() {
    console.log("Unloading Note exporter for LLM");
  }
}

class ContextBuilderModal extends obsidian.Modal {
  constructor(app, plugin, initialFiles) {
    super(app);
    this.plugin = plugin;
    this.selectedFiles = new Set(initialFiles);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Context Builder" });

    // 1. Header with count
    this.selectedFilesCountEl = contentEl.createEl("p", { 
      text: `Selected: ${this.selectedFiles.size} files`,
      cls: "selected-count" 
    });

    // 2. Scrollable Tree Container
    this.treeContainer = contentEl.createDiv({ cls: "selected-files-tree" });
    this.treeContainer.style.height = "300px";
    this.treeContainer.style.overflowY = "auto";
    this.treeContainer.style.border = "1px solid var(--background-modifier-border)";
    this.treeContainer.style.padding = "10px";
    this.treeContainer.style.marginBottom = "20px";
    this.treeContainer.style.fontFamily = "var(--font-monospace)";

    // 3. Search Section
    contentEl.createEl("h3", { text: "Add More Notes" });
    const searchContainer = contentEl.createDiv({ cls: "search-container" });
    this.searchComponent = new obsidian.TextComponent(searchContainer)
      .setPlaceholder("Search for notes to add...")
      .onChange((value) => {
        this.renderSearchResults(value);
      });
    this.searchComponent.inputEl.style.width = "100%";
    this.searchComponent.inputEl.style.marginBottom = "10px";

    this.searchResultsEl = contentEl.createDiv({ cls: "search-results" });
    this.searchResultsEl.style.height = "150px";
    this.searchResultsEl.style.overflowY = "auto";

    // 4. Actions
    const actionsEl = contentEl.createDiv({ cls: "actions" });
    actionsEl.style.display = "flex";
    actionsEl.style.justifyContent = "flex-end";
    actionsEl.style.gap = "10px";
    actionsEl.style.marginTop = "20px";

    const clearBtn = actionsEl.createEl("button", { text: "Clear All" });
    clearBtn.onclick = () => {
      this.selectedFiles.clear();
      this.refreshUI();
    };

    const copyBtn = actionsEl.createEl("button", { text: "Copy to Clipboard", cls: "mod-cta" });
    copyBtn.onclick = async () => {
      await this.plugin.exportFilesToClipboard(Array.from(this.selectedFiles));
      this.close();
    };

    this.refreshUI();
  }

  refreshUI() {
    this.selectedFilesCountEl.setText(`Selected: ${this.selectedFiles.size} files`);
    this.renderTreeUI();
    const query = this.searchComponent.getValue();
    if (query) this.renderSearchResults(query);
  }

  renderTreeUI() {
    const containerEl = this.treeContainer;
    containerEl.empty();

    if (this.selectedFiles.size === 0) {
      containerEl.createEl("p", { text: "No files selected.", cls: "empty-state" });
      return;
    }

    const treeData = {};
    const fileMap = new Map();

    for (const file of this.selectedFiles) {
      const parts = file.path.split("/");
      let current = treeData;
      for (const part of parts) {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
      fileMap.set(file.path, file);
    }

    const buildUI = (node, parentEl, fullPath = "") => {
      const keys = Object.keys(node).sort();
      keys.forEach((key) => {
        const currentPath = fullPath ? `${fullPath}/${key}` : key;
        const isFile = fileMap.has(currentPath);
        
        const row = parentEl.createDiv({ cls: "tree-row" });
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "2px 4px";

        const labelContainer = row.createDiv();
        labelContainer.style.display = "flex";
        labelContainer.style.alignItems = "center";
        labelContainer.style.gap = "4px";

        if (!isFile) {
          const folderIcon = labelContainer.createSpan();
          obsidian.setIcon(folderIcon, "folder");
        }

        labelContainer.createEl("span", { text: key + (isFile ? "" : "/") });

        const removeBtn = row.createEl("button", { text: "×", cls: "clickable-icon" });
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          if (isFile) {
            this.selectedFiles.delete(fileMap.get(currentPath));
          } else {
            const toDelete = [];
            for (const file of this.selectedFiles) {
              if (file.path === currentPath || file.path.startsWith(currentPath + "/")) {
                toDelete.push(file);
              }
            }
            toDelete.forEach(f => this.selectedFiles.delete(f));
          }
          this.refreshUI();
        };

        if (Object.keys(node[key]).length > 0) {
          const childrenContainer = parentEl.createDiv();
          childrenContainer.style.marginLeft = "20px";
          childrenContainer.style.borderLeft = "1px solid var(--background-modifier-border)";
          buildUI(node[key], childrenContainer, currentPath);
        }
      });
    };

    buildUI(treeData, containerEl);
  }

  renderSearchResults(query) {
    const containerEl = this.searchResultsEl;
    containerEl.empty();
    if (!query) return;

    const allFiles = this.app.vault.getFiles().filter(f => 
      (f.extension === "md" || f.extension === "canvas") && 
      f.path.toLowerCase().includes(query.toLowerCase()) &&
      !this.selectedFiles.has(f)
    );

    const limitedResults = allFiles.slice(0, 15);
    limitedResults.forEach((file) => {
      const resultRow = containerEl.createDiv({ cls: "search-result-row tree-row" });
      resultRow.style.cursor = "pointer";
      resultRow.createEl("span", { text: file.path });
      
      resultRow.onclick = (e) => {
        e.preventDefault();
        this.selectedFiles.add(file);
        this.refreshUI();
      };
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class NoteExporterSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Note exporter for LLM Settings" });

    new obsidian.Setting(containerEl)
      .setName("Export Format")
      .setDesc("Choose the format for the clipboard output")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("xml", "XML Structured")
          .addOption("json", "JSON Structured")
          .addOption("custom", "Custom Template")
          .setValue(this.plugin.settings.format)
          .onChange(async (value) => {
            this.plugin.settings.format = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh to show/hide custom fields
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Include File Tree")
      .setDesc("Prepend a visual directory structure of the exported files (starting from vault root)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeTree)
          .onChange(async (value) => {
            this.plugin.settings.includeTree = value;
            await this.plugin.saveSettings();
          })
      );

    if (this.plugin.settings.format === "custom") {
      containerEl.createEl("h3", { text: "Custom Template Settings" });
      
      new obsidian.Setting(containerEl)
        .setName("Context Prefix")
        .setDesc("Text to add at the beginning. Use {{TREE}} for the file tree.")
        .addTextArea((text) =>
          text
            .setPlaceholder("<context>\n{{TREE}}\n")
            .setValue(this.plugin.settings.customPrefix)
            .onChange(async (value) => {
              this.plugin.settings.customPrefix = value;
              await this.plugin.saveSettings();
            })
        );

      new obsidian.Setting(containerEl)
        .setName("Context Suffix")
        .setDesc("Text to add at the very end")
        .addTextArea((text) =>
          text
            .setPlaceholder("\n</context>")
            .setValue(this.plugin.settings.customSuffix)
            .onChange(async (value) => {
              this.plugin.settings.customSuffix = value;
              await this.plugin.saveSettings();
            })
        );

      new obsidian.Setting(containerEl)
        .setName("Item Prefix")
        .setDesc("Placeholders: {{PATH}}, {{CTIME}}, {{MTIME}}")
        .addTextArea((text) =>
          text
            .setPlaceholder('<item loc="{{PATH}}" created="{{CTIME}}" modified="{{MTIME}}">\n')
            .setValue(this.plugin.settings.customItemPrefix)
            .onChange(async (value) => {
              this.plugin.settings.customItemPrefix = value;
              await this.plugin.saveSettings();
            })
        );

      new obsidian.Setting(containerEl)
        .setName("Item Suffix")
        .setDesc("Text after each file")
        .addTextArea((text) =>
          text
            .setPlaceholder("\n</item>\n")
            .setValue(this.plugin.settings.customItemSuffix)
            .onChange(async (value) => {
              this.plugin.settings.customItemSuffix = value;
              await this.plugin.saveSettings();
            })
        );
    }
  }
}

module.exports = NoteExporterForLLM;