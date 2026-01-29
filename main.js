"use strict";

var obsidian = require("obsidian");

const DEFAULT_SETTINGS = {
  template: "xml", // 'xml', 'json', or 'custom'
  ignoredTags: [],
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

  isIgnored(file) {
    if (!this.settings.ignoredTags || this.settings.ignoredTags.length === 0) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return false;

    const fileTags = obsidian.getAllTags(cache) || [];
    return fileTags.some((fileTag) => {
      const normalizedFileTag = fileTag.startsWith("#") ? fileTag.slice(1) : fileTag;
      return this.settings.ignoredTags.some((ignoredTag) => {
        const normalizedIgnored = ignoredTag.startsWith("#") ? ignoredTag.slice(1) : ignoredTag;
        return (
          normalizedFileTag === normalizedIgnored ||
          normalizedFileTag.startsWith(normalizedIgnored + "/")
        );
      });
    });
  }

  async copyFolderToClipboard(folder) {
    const files = [];
    this.collectFiles(folder, files);
    await this.exportFilesToClipboard(files);
  }

  async exportFilesToClipboard(files) {
    const validFiles = files.filter(file => !this.isIgnored(file));
    
    if (validFiles.length === 0) {
      new obsidian.Notice("No files to export (all filtered by tags or empty selection).");
      return;
    }

    new obsidian.Notice(`Exporting ${validFiles.length} files...`);

    try {
      let output = "";
      let totalChars = 0;
      const fileTree = this.generateFileTree(validFiles);

      // Template-based export
      output = this.settings.customPrefix.split("{{TREE}}").join(fileTree);
      for (const file of validFiles) {
        const content = await this.app.vault.read(file);
        const stats = file.stat;
        let item = this.settings.customItemPrefix
          .split("{{PATH}}").join(file.path)
          .split("{{CTIME}}").join(new Date(stats.ctime).toISOString())
          .split("{{MTIME}}").join(new Date(stats.mtime).toISOString());
        item += content;
        item += this.settings.customItemSuffix;
        output += item;
        totalChars += content.length;
      }
      output += this.settings.customSuffix;

      await navigator.clipboard.writeText(output);
      new obsidian.Notice(`Copied ${validFiles.length} files (${totalChars.toLocaleString()} chars) to clipboard.`);
    } catch (err) {
      console.error("Failed to copy context:", err);
      new obsidian.Notice("Failed to copy context. See console for details.");
    }
  }

  collectFiles(folder, files) {
    for (const child of folder.children) {
      if (child instanceof obsidian.TFile) {
        if ((child.extension === "md" || child.extension === "canvas") && !this.isIgnored(child)) {
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
        const isFolder = Object.keys(node[key]).length > 0;
        result += prefix + connector + key + (isFolder ? '/' : '') + '\n';
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
      .setName("Base Template")
      .setDesc("Choose a starting template. Customizing fields below will set this to 'Custom'.")
      .addDropdown((dropdown) => {
        this.templateDropdown = dropdown;
        dropdown
          .addOption("xml", "XML Structured")
          .addOption("json", "JSON Structured")
          .addOption("custom", "Custom")
          .setValue(this.plugin.settings.template)
          .onChange(async (value) => {
            this.plugin.settings.template = value;
            if (value === "xml") {
              this.plugin.settings.customPrefix = "<context>\n<tree>\n{{TREE}}</tree>\n";
              this.plugin.settings.customSuffix = "\n</context>";
              this.plugin.settings.customItemPrefix = '<item loc="{{PATH}}" created="{{CTIME}}" modified="{{MTIME}}">\n';
              this.plugin.settings.customItemSuffix = "\n</item>\n";
            } else if (value === "json") {
              this.plugin.settings.customPrefix = "{\n  \"tree\": \"{{TREE}}\",\n  \"files\": [\n";
              this.plugin.settings.customSuffix = "\n  ]\n}";
              this.plugin.settings.customItemPrefix = '    {\n      "path": "{{PATH}}",\n      "created": "{{CTIME}}",\n      "modified": "{{MTIME}}",\n      "content": "';
              this.plugin.settings.customItemSuffix = '"\n    },\n';
            }
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new obsidian.Setting(containerEl)
      .setName("Ignored Tags")
      .setDesc("Comma-separated list of tags to ignore. Files with these tags (or their sub-tags) will be skipped. Example: #private, archive")
      .addText((text) =>
        text
          .setPlaceholder("e.g. #private, archive")
          .setValue(this.plugin.settings.ignoredTags.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.ignoredTags = value
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0);
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Template Configuration" });
      
    new obsidian.Setting(containerEl)
      .setName("Context Prefix")
      .setDesc("Text at the beginning. Use {{TREE}} for the file tree.")
      .addTextArea((text) =>
        text
          .setPlaceholder("<context>\n<tree>\n{{TREE}}</tree>\n")
          .setValue(this.plugin.settings.customPrefix)
          .onChange(async (value) => {
            this.plugin.settings.customPrefix = value;
            this.plugin.settings.template = "custom";
            this.templateDropdown.setValue("custom");
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Context Suffix")
      .setDesc("Text at the very end")
      .addTextArea((text) =>
        text
          .setPlaceholder("\n</context>")
          .setValue(this.plugin.settings.customSuffix)
          .onChange(async (value) => {
            this.plugin.settings.customSuffix = value;
            this.plugin.settings.template = "custom";
            this.templateDropdown.setValue("custom");
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Item Prefix")
      .setDesc("Before each file. Placeholders: {{PATH}}, {{CTIME}}, {{MTIME}}")
      .addTextArea((text) =>
        text
          .setPlaceholder('<item loc="{{PATH}}" created="{{CTIME}}" modified="{{MTIME}}">\n')
          .setValue(this.plugin.settings.customItemPrefix)
          .onChange(async (value) => {
            this.plugin.settings.customItemPrefix = value;
            this.plugin.settings.template = "custom";
            this.templateDropdown.setValue("custom");
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName("Item Suffix")
      .setDesc("After each file")
      .addTextArea((text) =>
        text
          .setPlaceholder("\n</item>\n")
          .setValue(this.plugin.settings.customItemSuffix)
          .onChange(async (value) => {
            this.plugin.settings.customItemSuffix = value;
            this.plugin.settings.template = "custom";
            this.templateDropdown.setValue("custom");
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = NoteExporterForLLM;