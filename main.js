"use strict";

var obsidian = require("obsidian");

const DEFAULT_SETTINGS = {
  template: "xml",
  ignoredTags: [],
  customPrefix: "<context>\n{{TREE}}\n",
  customSuffix: "\n</context>",
  customItemPrefix: '<item loc="{{PATH}}" created="{{CTIME}}" modified="{{MTIME}}">\n',
  customItemSuffix: "\n</item>\n",
};

class NoteExporterForLLM extends obsidian.Plugin {
  async onload() {
    console.log("Loading Simple exporter for LLM");
    await this.loadSettings();

    this.addSettingTab(new NoteExporterSettingTab(this.app, this));

    // Register context menu for folders and files (standard Obsidian)
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof obsidian.TFolder) {
          menu.addItem((item) => {
            item.setTitle("Copy folder contents for LLM").setIcon("documents").onClick(async () => { await this.copyFolderToClipboard(file); });
          });
          menu.addItem((item) => {
            item.setTitle("Open folder in Context Builder").setIcon("layout-list").onClick(() => {
                const files = [];
                this.collectFiles(file, files);
                new ContextBuilderModal(this.app, this, files).open();
            });
          });
        } else if (file instanceof obsidian.TFile && (file.extension === "md" || file.extension === "canvas")) {
          menu.addItem((item) => {
            item.setTitle("Copy file for LLM").setIcon("document").onClick(async () => { await this.exportFilesToClipboard([file]); });
          });
          menu.addItem((item) => {
            item.setTitle("Add file to Context Builder").setIcon("layout-list").onClick(() => {
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
            item.setTitle(`Copy ${validFiles.length} files for LLM`).setIcon("documents").onClick(async () => { await this.exportFilesToClipboard(validFiles); });
          });
          menu.addItem((item) => {
            item.setTitle("Add selection to Context Builder").setIcon("layout-list").onClick(() => {
                new ContextBuilderModal(this.app, this, validFiles).open();
            });
          });
        }
      })
    );

    this.addCommand({
      id: "open-context-builder",
      name: "Open Context Builder",
      callback: () => { new ContextBuilderModal(this.app, this, [], []).open(); },
    });

    this.app.workspace.onLayoutReady(() => {
      const nn = this.app.plugins.plugins['notebook-navigator']?.api;
      if (nn && nn.menus) { this.registerNotebookNavigatorIntegration(nn); }
      this.registerNativeTagMenu();
    });
  }

  registerNativeTagMenu() {
      this.registerDomEvent(document, 'contextmenu', (evt) => {
          const target = evt.target;
          const tagEl = target.closest('.tag-pane-tag, .nn-tag, .nav-tag, [data-tag]');
          if (!tagEl) return;

          let tagText = tagEl.getAttribute('data-tag') || tagEl.getAttribute('data-path');
          if (!tagText) {
              const countEl = tagEl.querySelector('.tag-pane-tag-count, .nn-navitem-count, .tree-item-flair');
              tagText = tagEl.innerText;
              if (countEl) { tagText = tagText.replace(countEl.innerText, ""); }
          }

          tagText = tagText ? tagText.trim() : "";
          if (tagText) {
              if (!tagText.startsWith('#') && (tagEl.classList.contains('nn-tag') || tagEl.closest('.tag-pane'))) {
                  tagText = '#' + tagText;
              }
              if (tagText.startsWith('#')) {
                  evt.preventDefault();
                  const menu = new obsidian.Menu();
                  menu.addItem((item) => {
                      item.setTitle("Copy tag contents for LLM").setIcon("documents").onClick(async () => { await this.copyTagToClipboard(tagText); });
                  });
                  menu.addItem((item) => {
                      item.setTitle("Open tag in Context Builder").setIcon("layout-list").onClick(() => { new ContextBuilderModal(this.app, this, [], [tagText]).open(); });
                  });
                  menu.showAtMouseEvent(evt);
              }
          }
      });
  }

  registerNotebookNavigatorIntegration(nn) {
    this.nnDisposers = this.nnDisposers || [];
    if (typeof nn.menus.registerFolderMenu === 'function') {
      this.nnDisposers.push(nn.menus.registerFolderMenu((context) => {
        const { folder, addItem } = context;
        if (folder instanceof obsidian.TFolder) {
          addItem((item) => { item.setTitle("Copy folder contents for LLM").setIcon("documents").onClick(async () => { await this.copyFolderToClipboard(folder); }); });
          addItem((item) => { item.setTitle("Open folder in Context Builder").setIcon("layout-list").onClick(() => {
                const files = []; this.collectFiles(folder, files); new ContextBuilderModal(this.app, this, files).open();
          }); });
        }
      }));
    }
    if (typeof nn.menus.registerFileMenu === 'function') {
      this.nnDisposers.push(nn.menus.registerFileMenu((context) => {
        const { file, addItem, selection } = context;
        const selectedFiles = selection?.files || [];
        let targets = selectedFiles.length > 0 ? selectedFiles : (file ? [file] : []);
        const validFiles = targets.filter(f => f instanceof obsidian.TFile && (f.extension === "md" || f.extension === "canvas"));
        if (validFiles.length > 0) {
             addItem((item) => {
                 item.setTitle(validFiles.length === 1 ? "Copy file for LLM" : `Copy ${validFiles.length} files for LLM`)
                     .setIcon(validFiles.length === 1 ? "document" : "documents")
                     .onClick(async () => { await this.exportFilesToClipboard(validFiles); });
             });
             addItem((item) => {
                 item.setTitle(validFiles.length === 1 ? "Add file to Context Builder" : "Add selection to Context Builder")
                     .setIcon("layout-list")
                     .onClick(() => { new ContextBuilderModal(this.app, this, validFiles).open(); });
             });
        }
      }));
    }
    if (typeof nn.menus.registerTagMenu === 'function') {
        this.nnDisposers.push(nn.menus.registerTagMenu((context) => {
            const { tagPath, addItem } = context;
            if (tagPath) {
                addItem((item) => { item.setTitle("Copy tag contents for LLM").setIcon("documents").onClick(async () => { await this.copyTagToClipboard(tagPath); }); });
                addItem((item) => { item.setTitle("Open tag in Context Builder").setIcon("layout-list").onClick(() => { new ContextBuilderModal(this.app, this, [], [tagPath]).open(); }); });
            }
        }));
    }
  }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }

  isIgnored(file) {
    if (!this.settings.ignoredTags || this.settings.ignoredTags.length === 0) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return false;
    const fileTags = obsidian.getAllTags(cache) || [];
    return fileTags.some((fileTag) => {
      const normalizedFileTag = fileTag.startsWith("#") ? fileTag.slice(1) : fileTag;
      return this.settings.ignoredTags.some((ignoredTag) => {
        const normalizedIgnored = ignoredTag.startsWith("#") ? ignoredTag.slice(1) : ignoredTag;
        return normalizedFileTag === normalizedIgnored || normalizedFileTag.startsWith(normalizedIgnored + "/");
      });
    });
  }

  async copyFolderToClipboard(folder) {
    const files = []; this.collectFiles(folder, files); await this.exportFilesToClipboard(files);
  }

  getFilesWithTag(tag) {
    const files = [];
    const normalizedTag = tag.startsWith("#") ? tag : "#" + tag;
    const lowerTag = normalizedTag.toLowerCase();
    const allFiles = this.app.vault.getMarkdownFiles();
    for (const file of allFiles) {
      if (this.isIgnored(file)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = obsidian.getAllTags(cache);
      if (tags) {
        for (const fileTag of tags) {
           if (fileTag.toLowerCase() === lowerTag || fileTag.toLowerCase().startsWith(lowerTag + "/")) {
             files.push(file); break;
           }
        }
      }
    }
    return files;
  }

  async copyTagToClipboard(tag) {
    const files = this.getFilesWithTag(tag);
    await this.exportFilesToClipboard(files, [tag]);
  }

  async exportFilesToClipboard(files, rootTags = []) {
    const validFilesMap = new Map();
    files.forEach(file => { if (!this.isIgnored(file)) { validFilesMap.set(file.path, file); } });
    const validFiles = Array.from(validFilesMap.values());
    if (validFiles.length === 0) { new obsidian.Notice("No files to export."); return; }

    new obsidian.Notice(`Exporting ${validFiles.length} files...`);
    try {
      let finalTree = "";
      if (rootTags.length > 0) {
          finalTree += "Tag Structure:\n" + this.generateTagTree(validFiles, rootTags) + "\n";
          finalTree += "Folder Structure:\n" + this.generateFileTree(validFiles);
      } else {
          finalTree = this.generateFileTree(validFiles);
      }

      let output = this.settings.customPrefix.split("{{TREE}}").join(finalTree);
      let totalChars = 0;
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
      new obsidian.Notice("Failed to copy context.");
    }
  }

  collectFiles(folder, files) {
    for (const child of folder.children) {
      if (child instanceof obsidian.TFile) {
        if ((child.extension === "md" || child.extension === "canvas") && !this.isIgnored(child)) { files.push(child); }
      } else if (child instanceof obsidian.TFolder) { this.collectFiles(child, files); }
    }
  }

  generateFileTree(files) {
    const tree = {};
    for (const file of files) {
      const parts = file.path.split('/');
      let current = tree;
      for (const part of parts) { if (!current[part]) current[part] = {}; current = current[part]; }
    }
    const printTree = (node, prefix = '') => {
      let result = '';
      const keys = Object.keys(node).sort();
      keys.forEach((key, index) => {
        const isLast = index === keys.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const isFolder = Object.keys(node[key]).length > 0;
        result += prefix + connector + key + (isFolder ? '/' : '') + '\n';
        result += printTree(node[key], prefix + (isLast ? '    ' : '│   '));
      });
      return result;
    };
    return printTree(tree);
  }

  generateTagTree(files, rootTags) {
      const tree = {};
      const insert = (root, pathParts, file) => {
          let current = root;
          for (const part of pathParts) {
              if (!current[part]) {
                  const curPath = current._tagPath ? `${current._tagPath}/${part}` : part;
                  current[part] = { _tagPath: curPath };
              }
              current = current[part];
          }
          if (file) { current[file.path] = { _isLeaf: true, file: file }; }
      };
      for (const rootTag of rootTags) {
          const norm = rootTag.startsWith("#") ? rootTag : "#" + rootTag;
          if (!tree[norm]) tree[norm] = { _tagPath: norm };
          for (const file of files) {
              if (this.excludedPaths.has(file.path)) continue;
              const fileTags = obsidian.getAllTags(this.plugin.app.metadataCache.getFileCache(file)) || [];
              for (const tag of fileTags) {
                  if (tag.toLowerCase() === norm.toLowerCase() || tag.toLowerCase().startsWith(norm.toLowerCase() + "/")) {
                      let rel = tag.length > norm.length ? tag.slice(norm.length + 1).split("/") : [];
                      insert(tree[norm], rel, file);
                  }
              }
          }
      }
      const printTree = (node, prefix = '') => {
        let result = '';
        const keys = Object.keys(node).filter(k => k !== '_isLeaf' && k !== 'file' && k !== '_tagPath').sort();
        keys.forEach((key) => {
          const child = node[key];
          const nodePath = child._isLeaf ? child.file.path : child._tagPath;
          if (!child._isLeaf && this.excludedPaths.has(nodePath)) return;
          const row = parentEl.createDiv({ cls: "tree-row" });
          row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.paddingLeft = "10px";
          const label = row.createSpan(); label.style.display = "flex"; label.style.alignItems = "center"; label.style.gap = "5px";
          if (child._isLeaf) { obsidian.setIcon(label.createSpan(), "document"); label.createSpan({ text: child.file.basename }); }
          else { obsidian.setIcon(label.createSpan(), "hash"); label.createSpan({ text: key }); }
          const removeBtn = row.createEl("button", { text: "×", cls: "clickable-icon" });
          removeBtn.onclick = (e) => { e.stopPropagation(); this.excludedPaths.add(nodePath); this.refreshUI(); };
          if (Object.keys(node[key]).length > (child._isLeaf ? 2 : 1)) {
              const childrenContainer = parentEl.createDiv();
              childrenContainer.style.marginLeft = "10px"; childrenContainer.style.borderLeft = "1px solid var(--background-modifier-border)";
              renderNode(node[key], childrenContainer);
          }
        });
      };
      return printTree(tree);
  }

  onunload() {
    console.log("Unloading Simple exporter for LLM");
    if (this.nnDisposers) { this.nnDisposers.forEach(d => d()); this.nnDisposers = []; }
  }
}

class ContextBuilderModal extends obsidian.Modal {
  constructor(app, plugin, initialFiles, initialTags = []) {
    super(app);
    this.plugin = plugin;
    this.selectedFiles = new Set(initialFiles);
    this.selectedTags = new Set(initialTags);
    this.excludedPaths = new Set();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Context Builder" });
    this.selectedFilesCountEl = contentEl.createEl("p", { text: this.getSummaryText(), cls: "selected-count" });
    this.treeContainer = contentEl.createDiv({ cls: "selected-files-tree" });
    this.treeContainer.style.height = "300px";
    this.treeContainer.style.overflowY = "auto";
    this.treeContainer.style.border = "1px solid var(--background-modifier-border)";
    this.treeContainer.style.padding = "10px";
    this.treeContainer.style.marginBottom = "20px";
    this.treeContainer.style.fontFamily = "var(--font-monospace)";

    contentEl.createEl("h3", { text: "Add More Items" });
    const searchContainer = contentEl.createDiv({ cls: "search-container" });
    this.searchComponent = new obsidian.TextComponent(searchContainer)
      .setPlaceholder("Search for files or tags (#)...")
      .onChange((value) => { this.renderSearchResults(value); });
    this.searchComponent.inputEl.style.width = "100%";
    this.searchComponent.inputEl.style.marginBottom = "10px";

    this.searchResultsEl = contentEl.createDiv({ cls: "search-results" });
    this.searchResultsEl.style.height = "150px";
    this.searchResultsEl.style.overflowY = "auto";

    const actionsEl = contentEl.createDiv({ cls: "actions" });
    actionsEl.style.display = "flex"; actionsEl.style.justifyContent = "flex-end"; actionsEl.style.gap = "10px"; actionsEl.style.marginTop = "20px";

    const clearBtn = actionsEl.createEl("button", { text: "Clear All" });
    clearBtn.onclick = () => { this.selectedFiles.clear(); this.selectedTags.clear(); this.excludedPaths.clear(); this.refreshUI(); };

    const copyBtn = actionsEl.createEl("button", { text: "Copy to Clipboard", cls: "mod-cta" });
    copyBtn.onclick = async () => {
        const finalFilesMap = new Map();
        for (const tag of this.selectedTags) {
            if (this.excludedPaths.has(tag)) continue;
            const files = this.plugin.getFilesWithTag(tag);
            files.forEach(f => {
                if (this.excludedPaths.has(f.path)) return;
                const fileTags = obsidian.getAllTags(this.app.metadataCache.getFileCache(f)) || [];
                const isStillVisible = fileTags.some(ft => {
                    return Array.from(this.selectedTags).some(root => {
                        if (ft.toLowerCase() === root.toLowerCase() || ft.toLowerCase().startsWith(root.toLowerCase() + "/")) {
                            const parts = ft.split("/");
                            let cur = "";
                            for (const p of parts) { cur = cur ? `${cur}/${p}` : p; if (this.excludedPaths.has(cur)) return false; }
                            return true;
                        }
                        return false;
                    });
                });
                if (isStillVisible) finalFilesMap.set(f.path, f);
            });
        }
        for (const f of this.selectedFiles) { if (!this.excludedPaths.has(f.path)) finalFilesMap.set(f.path, f); }
        await this.plugin.exportFilesToClipboard(Array.from(finalFilesMap.values()), Array.from(this.selectedTags));
        this.close();
    };
    this.refreshUI();
  }

  getSummaryText() {
      return `Selected: ${this.selectedFiles.size} files, ${this.selectedTags.size} tags` + (this.excludedPaths.size > 0 ? ` (${this.excludedPaths.size} excluded)` : "");
  }

  refreshUI() {
    this.selectedFilesCountEl.setText(this.getSummaryText());
    this.renderTreeUI();
    const query = this.searchComponent.getValue();
    if (query) this.renderSearchResults(query);
  }

  renderTreeUI() {
    const containerEl = this.treeContainer;
    containerEl.empty();
    if (this.selectedFiles.size === 0 && this.selectedTags.size === 0) {
      const msg = containerEl.createDiv();
      msg.style.height = "100%"; msg.style.display = "flex"; msg.style.alignItems = "center"; msg.style.justifyContent = "center"; msg.style.color = "var(--text-muted)";
      msg.createEl("p", { text: "No items selected." });
      return;
    }

    if (this.selectedTags.size > 0) {
        containerEl.createEl("strong", { text: "Tags:" });
        const tagContainer = containerEl.createDiv({ cls: "tag-tree-container" });
        const filesFromTags = [];
        const tagArray = Array.from(this.selectedTags).sort();
        for (const tag of tagArray) { filesFromTags.push(...this.plugin.getFilesWithTag(tag)); }
        const uniqueFiles = [...new Set(filesFromTags)];
        
        const buildTagTreeObj = (tags, files) => {
             const tree = {};
             const insert = (root, pathParts, file) => {
                let current = root;
                for (const part of pathParts) {
                    if (!current[part]) {
                        const curPath = current._tagPath ? `${current._tagPath}/${part}` : part;
                        current[part] = { _tagPath: curPath };
                    }
                    current = current[part];
                }
                if (file) { current[file.path] = { _isLeaf: true, file: file }; }
            };
            for (const rootTag of tags) {
                const norm = rootTag.startsWith("#") ? rootTag : "#" + rootTag;
                if (!tree[norm]) tree[norm] = { _tagPath: norm };
                for (const file of files) {
                    if (this.excludedPaths.has(file.path)) continue;
                    const fileTags = obsidian.getAllTags(this.plugin.app.metadataCache.getFileCache(file)) || [];
                    for (const tag of fileTags) {
                        if (tag.toLowerCase() === norm.toLowerCase() || tag.toLowerCase().startsWith(norm.toLowerCase() + "/")) {
                            let rel = tag.length > norm.length ? tag.slice(norm.length + 1).split("/") : [];
                            insert(tree[norm], rel, file);
                        }
                    }
                }
            }
            return tree;
        };

        const tagTreeObj = buildTagTreeObj(tagArray, uniqueFiles);
        const renderNode = (node, parentEl) => {
            const keys = Object.keys(node).filter(k => k !== '_isLeaf' && k !== 'file' && k !== '_tagPath').sort();
            keys.forEach((key) => {
                const child = node[key];
                const nodePath = child._isLeaf ? child.file.path : child._tagPath;
                if (!child._isLeaf && this.excludedPaths.has(nodePath)) return;
                const row = parentEl.createDiv({ cls: "tree-row" });
                row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.paddingLeft = "10px";
                const label = row.createSpan(); label.style.display = "flex"; label.style.alignItems = "center"; label.style.gap = "5px";
                if (child._isLeaf) { obsidian.setIcon(label.createSpan(), "document"); label.createSpan({ text: child.file.basename }); }
                else { obsidian.setIcon(label.createSpan(), "hash"); label.createSpan({ text: key }); }
                const removeBtn = row.createEl("button", { text: "×", cls: "clickable-icon" });
                removeBtn.onclick = (e) => { e.stopPropagation(); this.excludedPaths.add(nodePath); this.refreshUI(); };
                if (Object.keys(node[key]).length > (child._isLeaf ? 2 : 1)) {
                    const childrenContainer = parentEl.createDiv();
                    childrenContainer.style.marginLeft = "10px"; childrenContainer.style.borderLeft = "1px solid var(--background-modifier-border)";
                    renderNode(node[key], childrenContainer);
                }
            });
        };
        Object.keys(tagTreeObj).sort().forEach(rootTag => {
             const row = tagContainer.createDiv({ cls: "tree-row" });
             row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.background = "var(--background-secondary)"; row.style.padding = "4px"; row.style.marginBottom = "2px";
             const label = row.createSpan(); obsidian.setIcon(label.createSpan(), "hash"); label.createSpan({ text: rootTag });
             const removeBtn = row.createEl("button", { text: "×", cls: "clickable-icon" });
             removeBtn.onclick = () => { this.selectedTags.delete(rootTag); this.refreshUI(); };
             renderNode(tagTreeObj[rootTag], tagContainer.createDiv());
        });
    }

    if (this.selectedFiles.size > 0) {
        if (this.selectedTags.size > 0) { containerEl.createEl("div", { style: "height: 10px;" }); containerEl.createEl("strong", { text: "Individual Files:" }); }
        const fileMap = new Map(); const treeData = {};
        for (const file of this.selectedFiles) {
            if (this.excludedPaths.has(file.path)) continue;
            const parts = file.path.split("/"); let current = treeData;
            for (const part of parts) { if (!current[part]) current[part] = {}; current = current[part]; }
            fileMap.set(file.path, file);
        }
        const buildFileUI = (node, parentEl, fullPath = "") => {
            const keys = Object.keys(node).sort();
            keys.forEach((key) => {
                const currentPath = fullPath ? `${fullPath}/${key}` : key; const isFile = fileMap.has(currentPath);
                const row = parentEl.createDiv({ cls: "tree-row" });
                row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.alignItems = "center"; row.style.padding = "2px 4px";
                const labelContainer = row.createDiv(); labelContainer.style.display = "flex"; labelContainer.style.alignItems = "center"; labelContainer.style.gap = "4px";
                if (!isFile) { obsidian.setIcon(labelContainer.createSpan(), "folder"); } else { obsidian.setIcon(labelContainer.createSpan(), "document"); }
                labelContainer.createEl("span", { text: key + (isFile ? "" : "/") });
                const removeBtn = row.createEl("button", { text: "×", cls: "clickable-icon" });
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (isFile) { this.selectedFiles.delete(fileMap.get(currentPath)); } 
                    else { const toDelete = []; for (const f of this.selectedFiles) { if (f.path === currentPath || f.path.startsWith(currentPath + "/")) { toDelete.push(f); } } toDelete.forEach(f => this.selectedFiles.delete(f)); }
                    this.refreshUI();
                };
                if (Object.keys(node[key]).length > 0) {
                    const childrenContainer = parentEl.createDiv();
                    childrenContainer.style.marginLeft = "20px"; childrenContainer.style.borderLeft = "1px solid var(--background-modifier-border)";
                    buildFileUI(node[key], childrenContainer, currentPath);
                }
            });
        };
        buildFileUI(treeData, containerEl);
    }
  }

  renderSearchResults(query) {
    const containerEl = this.searchResultsEl;
    containerEl.empty();
    if (!query) return;
    const lowerQuery = query.toLowerCase();
    const allTags = this.app.metadataCache.getTags();
    if (allTags) {
        const matches = Object.keys(allTags).filter(tag => tag.toLowerCase().includes(lowerQuery) && !this.selectedTags.has(tag));
        matches.slice(0, 10).forEach(tag => {
            const resultRow = containerEl.createDiv({ cls: "search-result-row tree-row" });
            resultRow.style.cursor = "pointer"; resultRow.style.display = "flex"; resultRow.style.gap = "5px";
            obsidian.setIcon(resultRow.createSpan(), "hash");
            resultRow.createEl("span", { text: tag });
            resultRow.onclick = (e) => { e.preventDefault(); this.selectedTags.add(tag); this.excludedPaths.delete(tag); this.searchComponent.setValue(""); this.refreshUI(); };
        });
    }
    const allFiles = this.app.vault.getFiles().filter(f => (f.extension === "md" || f.extension === "canvas") && f.path.toLowerCase().includes(lowerQuery) && !this.selectedFiles.has(f));
    allFiles.slice(0, 10).forEach((file) => {
      const resultRow = containerEl.createDiv({ cls: "search-result-row tree-row" });
      resultRow.style.cursor = "pointer"; resultRow.createEl("span", { text: file.path });
      resultRow.onclick = (e) => { e.preventDefault(); this.selectedFiles.add(file); this.excludedPaths.delete(file.path); this.searchComponent.setValue(""); this.refreshUI(); };
    });
  }

  onClose() { this.contentEl.empty(); }
}

class NoteExporterSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Simple exporter for LLM Settings" });
    new obsidian.Setting(containerEl)
      .setName("Base Template")
      .setDesc("Choose a starting template.")
      .addDropdown((dropdown) => {
        this.templateDropdown = dropdown;
        dropdown.addOption("xml", "XML Structured").addOption("json", "JSON Structured").addOption("custom", "Custom")
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
              this.plugin.settings.customItemPrefix = '    {\n      \"path\": \"{{PATH}}\",\n      \"created\": \"{{CTIME}}\",\n      \"modified\": \"{{MTIME}}\",\n      \"content\": \"';
              this.plugin.settings.customItemSuffix = '"\n    },\n';
            }
            await this.plugin.saveSettings(); this.display();
          });
      });
    new obsidian.Setting(containerEl).setName("Ignored Tags").addText((text) =>
        text.setPlaceholder("e.g. #private").setValue(this.plugin.settings.ignoredTags.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.ignoredTags = value.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
            await this.plugin.saveSettings();
          })
      );
    containerEl.createEl("h3", { text: "Template Configuration" });
    new obsidian.Setting(containerEl).setName("Context Prefix").addTextArea((text) =>
        text.setValue(this.plugin.settings.customPrefix).onChange(async (value) => {
            this.plugin.settings.customPrefix = value; this.plugin.settings.template = "custom"; this.templateDropdown.setValue("custom"); await this.plugin.saveSettings();
          })
      );
    new obsidian.Setting(containerEl).setName("Context Suffix").addTextArea((text) =>
        text.setValue(this.plugin.settings.customSuffix).onChange(async (value) => {
            this.plugin.settings.customSuffix = value; this.plugin.settings.template = "custom"; this.templateDropdown.setValue("custom"); await this.plugin.saveSettings();
          })
      );
    new obsidian.Setting(containerEl).setName("Item Prefix").addTextArea((text) =>
        text.setValue(this.plugin.settings.customItemPrefix).onChange(async (value) => {
            this.plugin.settings.customItemPrefix = value; this.plugin.settings.template = "custom"; this.templateDropdown.setValue("custom"); await this.plugin.saveSettings();
          })
      );
    new obsidian.Setting(containerEl).setName("Item Suffix").addTextArea((text) =>
        text.setValue(this.plugin.settings.customItemSuffix).onChange(async (value) => {
            this.plugin.settings.customItemSuffix = value; this.plugin.settings.template = "custom"; this.templateDropdown.setValue("custom"); await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = NoteExporterForLLM;