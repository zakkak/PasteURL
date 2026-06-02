'use strict';

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { window, StatusBarAlignment, Position, Range } from 'vscode';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    let paster = new Paster();
    let disposable = vscode.commands.registerCommand('pasteURL.PasteURL', () => {
        paster.paste();
    });

    context.subscriptions.push(disposable);
}

interface ILinkFormatter {
    formatLink(text: string, url: string): string;
}

class MarkdownLinkFormatter implements ILinkFormatter {
    formatLink(text: string, url: string): string {
        return '[' + text + ']' + '(' + url + ')';
    }
}

class RestructuredTextLinkFormatter implements ILinkFormatter {
    formatLink(text: string, url: string): string {
        return '`' + text + ' <' + url + '>`_';
    }
}

class AsciidocLinkFormatter implements ILinkFormatter {
    formatLink(text: string, url: string): string {
        return url + '[' + text + ']';
    }
}

export class Paster {
    private _statusBarItem: vscode.StatusBarItem;

    public paste() {
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
        }

        vscode.env.clipboard.readText().then((content: string) => {
            if (content) {
                this.generateMarkDownStyleLink(content);
            } else {
                this.showMessage('[PasteURL]: Not a URL.');
            }
        }, () => {
            this.showMessage('[PasteURL]: Failed to read clipboard.');
        });
    }

    getLanguage() {
        var filename = vscode.window.activeTextEditor.document.fileName;
        if (filename.endsWith(".rst") ||
            filename.endsWith(".rest") ||
            filename.endsWith(".restx")) {
            return 'restructuredtext';
        }
        if (filename.endsWith(".asciidoc") ||
            filename.endsWith(".adoc") ||
            filename.endsWith(".asc")) {
            return 'asciidoc';
        }

        return vscode.window.activeTextEditor.document.languageId.toLowerCase();
    }

    getLinkFormatter() {
        var language = this.getLanguage();
        if (language === 'restructuredtext') {
            return new RestructuredTextLinkFormatter();
        } else if (language === 'asciidoc') {
            return new AsciidocLinkFormatter();
        } else {
            return new MarkdownLinkFormatter();
        }
    }

    generateMarkDownStyleLink(url: string) {
        var document = vscode.window.activeTextEditor.document;
        var selection = vscode.window.activeTextEditor.selection;
        var selectedText = document.getText(selection);
        var isSelectionEmpty = selectedText.length === 0; // || selectedText == ' '

        if (isSelectionEmpty) {
            this.composeTitleAndSelection(url);
        } else {
            this.replaceSelectionWithTitleURL(selection, url);
        }
    }

    replaceSelectionWithTitleURL(selection: vscode.Selection, url: string) {
        var text = vscode.window.activeTextEditor.document.getText(selection);
        var formattedLink = this.getLinkFormatter().formatLink(text, url);
        vscode.window.activeTextEditor.edit((editBuilder) => {
            editBuilder.replace(selection, formattedLink);
        });
    }

    composeTitleAndSelection(url: string) {
        var headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15"
        };
        if (!url.startsWith("http")) {
            url = "http://" + url;
        }
        var date = new Date();
        var seconds = date.getSeconds();
        var padding = seconds < 10 ? '0' : '';
        var timestamp = date.getMinutes() + ':' + padding + seconds;
        var fetchingTitle = 'Getting Title at ' + timestamp;
        var formattedLink = this.getLinkFormatter().formatLink(fetchingTitle, url);
        this.writeToEditor(formattedLink).then(() => {
            this.fetchTitle(url, headers).then((title) => {
                this.replaceWith(fetchingTitle, this.processTitle(title, url));
            }).catch(() => {
                this.replaceWith(fetchingTitle, 'Error Happened');
            });
        });
    }

    private fetchTitle(url: string, headers: { [key: string]: string }): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(url);
            } catch (e) {
                resolve(undefined);
                return;
            }

            const requestLib = parsedUrl.protocol === 'https:' ? https : http;
            const req = requestLib.get(url, { headers: headers }, (response) => {
                if (response.statusCode && response.statusCode >= 400) {
                    resolve(undefined);
                    response.resume();
                    return;
                }

                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => {
                    body += chunk;
                    if (body.length > 1000000 || /<\/title>/i.test(body)) {
                        response.destroy();
                    }
                });
                response.on('end', () => {
                    const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                    resolve(match ? match[1] : undefined);
                });
                response.on('close', () => {
                    if (body.length === 0) {
                        resolve(undefined);
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.setTimeout(8000, () => {
                req.destroy();
                resolve(undefined);
            });
        });
    }

    writeToEditor(content: string): Thenable<boolean> {
        let startLine = vscode.window.activeTextEditor.selection.start.line;
        var selection = vscode.window.activeTextEditor.selection;
        let position = new vscode.Position(startLine, selection.start.character);
        return vscode.window.activeTextEditor.edit((editBuilder) => {
            editBuilder.insert(position, content);
        });
    }

    replaceWith(originalContent: string, newContent: string) {
        let document = vscode.window.activeTextEditor.document;
        var range: Range;
        var line: string = '';
        for (var i = 0; i < document.lineCount; i++) {
            line = document.lineAt(i).text;

            if (line.includes(originalContent)) {
                range = document.lineAt(i).range;
                break;
            }
        }

        if (range === undefined) {
            return;
        }

        var start = new Position(range.start.line, line.indexOf(originalContent));
        var end = new Position(range.start.line, start.character + originalContent.length);
        var newRange = new Range(start, end);
        vscode.window.activeTextEditor.edit((editBuilder) => {
            editBuilder.replace(newRange, newContent);
        });
    }

    processTitle(title: string | undefined, url: string) {
        if (title === undefined) {
            return url;
        }
        return this.decodeHtmlEntities(title).trim();
    }

    private decodeHtmlEntities(title: string): string {
        const namedEntities: { [key: string]: string } = {
            amp: '&',
            lt: '<',
            gt: '>',
            quot: '"',
            apos: '\'',
            nbsp: ' '
        };

        return title.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, code) => {
            if (code[0] === '#') {
                let value: number;
                if (code[1] === 'x' || code[1] === 'X') {
                    value = parseInt(code.slice(2), 16);
                } else {
                    value = parseInt(code.slice(1), 10);
                }
                if (!isNaN(value)) {
                    return String.fromCharCode(value);
                }
                return entity;
            }

            const decoded = namedEntities[code];
            return decoded !== undefined ? decoded : entity;
        });
    }

    showMessage(content: string) {
        this._statusBarItem.text = "Paste URL: " + content;
        this._statusBarItem.show();
        setTimeout(() => {
            this._statusBarItem.hide();
        }, 3000);
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}