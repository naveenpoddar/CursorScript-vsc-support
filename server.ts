import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Hover,
  MarkupKind,
  Location,
  Range,
  Definition,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  DocumentSymbol,
  SymbolInformation,
  SymbolKind,
  DocumentFormattingParams,
  TextEdit,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import Parser from "../CursorPP/src/frontend/parser";
import {
  Program,
  Stmt,
  VarDeclaration,
  FunctionDeclaration,
  ImportDeclaration,
  ObjectLiteral,
  LambdaExpr,
  Identifier,
} from "../CursorPP/src/frontend/ast";

// Import the auto-generated symbols
import {
  GLOBAL_SYMBOLS as AUTO_GLOBAL_SYMBOLS,
  SymbolMember as AutoSymbolMember,
} from "./globalSymbols";

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  connection.console.log("CursorScript LSP Initializing...");
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ["."],
      },
      hoverProvider: true,
      definitionProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
      },
      documentSymbolProvider: true,
      documentFormattingProvider: true,
    },
  };
  return result;
});

// Cache for the last successfully parsed AST per document
const astCache = new Map<string, Program>();

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    const parser = new Parser();
    const program = parser.produceAST(text, textDocument.uri);
    astCache.set(textDocument.uri, program);
    connection.console.log(`Successfully parsed ${textDocument.uri}`);
  } catch (err: any) {
    connection.console.log(`Parser Error in ${textDocument.uri}: ${err}`);
    const match = err.toString().match(/:(\d+):(\d+)/);
    if (match) {
      const line = parseInt(match[1]) - 1;
      const column = parseInt(match[2]) - 1;

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: column },
          end: { line, character: column + 1 },
        },
        message: err.toString(),
        source: "CursorScript",
      });
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

interface SymbolMember {
  name: string;
  kind: CompletionItemKind;
  detail: string;
  documentation?: string;
  insertText?: string;
}

interface SymbolInfo {
  name: string;
  kind: CompletionItemKind;
  detail: string;
  documentation?: string;
  insertText?: string;
  line: number;
  column: number;
  members?: SymbolMember[];
}

function getSymbolsInProgram(program: Program): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  function traverse(stmts: Stmt[]) {
    for (const stmt of stmts) {
      if (stmt.kind === "VarDeclaration") {
        const varDecl = stmt as VarDeclaration;
        const members: SymbolMember[] = [];
        let typeHint = varDecl.constant ? "constant" : "variable";

        if (varDecl.value) {
          switch (varDecl.value.kind) {
            case "NumericLiteral":
              typeHint += ": number";
              break;
            case "StringLiteral":
              typeHint += ": string";
              break;
            case "ArrayLiteral":
              typeHint += ": array";
              break;
            case "ObjectLiteral":
              typeHint += ": object";
              const obj = varDecl.value as ObjectLiteral;
              for (const prop of obj.properties) {
                members.push({
                  name: prop.key,
                  kind: CompletionItemKind.Property,
                  detail: `(property of ${varDecl.identifier})`,
                });
              }
              break;
            case "LambdaExpr":
              const lambda = varDecl.value as LambdaExpr;
              typeHint += `: fn(${lambda.parameters.join(", ")})`;
              break;
            case "Identifier":
              const id = (varDecl.value as Identifier).symbol;
              if (id === "true" || id === "false") typeHint += ": boolean";
              else if (id === "null") typeHint += ": null";
              break;
            case "CallExpr":
              typeHint += ": (result of call)";
              break;
          }
        }

        symbols.push({
          name: varDecl.identifier,
          kind: varDecl.constant
            ? CompletionItemKind.Constant
            : CompletionItemKind.Variable,
          detail: `(${typeHint})`,
          line: varDecl.line,
          column: varDecl.column,
          members: members.length > 0 ? members : undefined,
        });
      } else if (stmt.kind === "FunctionDeclaration") {
        const fnDecl = stmt as FunctionDeclaration;
        symbols.push({
          name: fnDecl.name,
          kind: CompletionItemKind.Function,
          detail: `fn ${fnDecl.name}(${fnDecl.parameters.join(", ")})`,
          line: fnDecl.line,
          column: fnDecl.column,
        });

        // Add parameters as local variables
        for (const param of fnDecl.parameters) {
          symbols.push({
            name: param,
            kind: CompletionItemKind.Variable,
            detail: `(parameter of ${fnDecl.name})`,
            line: fnDecl.line,
            column: fnDecl.column,
          });
        }

        // IMPORTANT: Recurse into function body to find local variables
        if (fnDecl.body) {
          traverse(fnDecl.body);
        }
      } else if (stmt.kind === "ImportDeclaration") {
        const importDecl = stmt as ImportDeclaration;
        for (const spec of importDecl.specifiers) {
          symbols.push({
            name: spec,
            kind: CompletionItemKind.Module,
            detail: `(imported from "${importDecl.source}")`,
            line: importDecl.line,
            column: importDecl.column,
          });
        }
      }

      // Handle nested blocks in If/While/etc
      if (
        "body" in stmt &&
        Array.isArray((stmt as any).body) &&
        stmt.kind !== "FunctionDeclaration"
      ) {
        traverse((stmt as any).body);
      }
      if ("thenBranch" in stmt && Array.isArray((stmt as any).thenBranch)) {
        traverse((stmt as any).thenBranch);
      }
      if ("elseBranch" in stmt && Array.isArray((stmt as any).elseBranch)) {
        traverse((stmt as any).elseBranch);
      }
    }
  }

  traverse(program.body);
  return symbols;
}

// Convert Auto Symbols to internal SymbolInfo
const GLOBAL_SYMBOLS: SymbolInfo[] = AUTO_GLOBAL_SYMBOLS.map((as) => ({
  ...as,
  line: 0,
  column: 0,
  members: as.members as SymbolMember[] | undefined,
}));

function getSymbolAtPosition(
  uri: string,
  word: string,
): SymbolInfo | undefined {
  const program = astCache.get(uri);
  if (!program) return undefined;
  const localSymbols = getSymbolsInProgram(program);
  return (
    localSymbols.find((s) => s.name === word) ||
    GLOBAL_SYMBOLS.find((s) => s.name === word)
  );
}

connection.onCompletion(
  (params: TextDocumentPositionParams): CompletionItem[] => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) return [];

      const text = document.getText();
      const offset = document.offsetAt(params.position);

      // Check if we are inside a comment //
      const lineStartOffset = document.offsetAt({
        line: params.position.line,
        character: 0,
      });
      const lineTextBeforeCursor = text.slice(lineStartOffset, offset);
      if (lineTextBeforeCursor.includes("//")) {
        return [];
      }

      const program = astCache.get(params.textDocument.uri);
      const localSymbols = program ? getSymbolsInProgram(program) : [];

      // Check if we just typed a dot
      const textBefore = text.slice(0, offset);
      const dotMatch = textBefore.match(/([a-zA-Z0-9_$]+)\.$/);

      if (dotMatch) {
        const objectName = dotMatch[1];
        const symbol =
          localSymbols.find((s) => s.name === objectName) ||
          GLOBAL_SYMBOLS.find((s) => s.name === objectName);

        if (symbol && symbol.members) {
          return symbol.members.map((m) => ({
            label: m.name,
            kind: m.kind,
            detail: m.detail,
            documentation: m.documentation,
            insertText: m.insertText,
            insertTextFormat: m.insertText ? 2 : 1,
          }));
        }
      }

      const currentLine = params.position.line + 1;
      const availableSymbols = localSymbols.filter((s) => s.line < currentLine);

      const allSymbols = [...GLOBAL_SYMBOLS, ...availableSymbols];
      const uniqueSymbols = new Map<string, SymbolInfo>();
      allSymbols.forEach((s) => uniqueSymbols.set(s.name, s));

      return Array.from(uniqueSymbols.values()).map((s) => ({
        label: s.name,
        kind: s.kind,
        detail: s.detail,
        documentation: s.documentation,
        data: s,
        insertText: s.insertText,
        insertTextFormat: s.insertText ? 2 : 1,
      }));
    } catch (e) {
      connection.console.log(`Completion Error: ${e}`);
      return [];
    }
  },
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const program = astCache.get(params.textDocument.uri);
    if (!program) return null;

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    const wordRegex = /[a-zA-Z0-9_$]+/g;
    let match;
    while ((match = wordRegex.exec(text)) !== null) {
      if (offset >= match.index && offset <= match.index + match[0].length) {
        const word = match[0];
        const localSymbols = getSymbolsInProgram(program);
        const symbol =
          localSymbols.find((s) => s.name === word) ||
          GLOBAL_SYMBOLS.find((s) => s.name === word);

        if (symbol) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `**${word}**\n\n${symbol.detail}${symbol.documentation ? `\n\n${symbol.documentation}` : ""}`,
            },
          };
        }
      }
    }
  } catch (e) {
    connection.console.log(`Hover Error: ${e}`);
  }
  return null;
});

connection.onDefinition(
  (params: TextDocumentPositionParams): Definition | null => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) return null;

      const text = document.getText();
      const offset = document.offsetAt(params.position);
      const wordRegex = /[a-zA-Z0-9_$]+/g;
      let match;
      while ((match = wordRegex.exec(text)) !== null) {
        if (offset >= match.index && offset <= match.index + match[0].length) {
          const word = match[0];
          const symbol = getSymbolAtPosition(params.textDocument.uri, word);

          if (
            symbol &&
            symbol.line !== undefined &&
            symbol.column !== undefined &&
            symbol.line > 0
          ) {
            const line = Math.max(0, symbol.line - 1);
            const col = Math.max(0, symbol.column - 1);
            return {
              uri: params.textDocument.uri,
              range: {
                start: { line: line, character: col },
                end: {
                  line: line,
                  character: col + word.length,
                },
              },
            };
          }
        }
      }
    } catch (e) {
      connection.console.log(`Definition Error: ${e}`);
    }
    return null;
  },
);

connection.onSignatureHelp(
  (params: TextDocumentPositionParams): SignatureHelp | null => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) return null;

      const text = document.getText();
      const offset = document.offsetAt(params.position);

      // Find the function being called by looking backwards for '('
      const textBefore = text.slice(0, offset);
      const openParenIndex = textBefore.lastIndexOf("(");
      if (openParenIndex === -1) return null;

      const funcMatch = textBefore
        .slice(0, openParenIndex)
        .match(/([a-zA-Z0-9_$]+(\.[a-zA-Z0-9_$]+)?)\s*$/);
      if (!funcMatch) return null;

      const fullName = funcMatch[1];
      let symbol: SymbolInfo | SymbolMember | undefined;

      if (fullName.includes(".")) {
        const [objName, propName] = fullName.split(".");
        const obj = getSymbolAtPosition(params.textDocument.uri, objName);
        if (obj && obj.members) {
          symbol = obj.members.find((m) => m.name === propName);
        }
      } else {
        symbol = getSymbolAtPosition(params.textDocument.uri, fullName);
      }

      if (symbol && symbol.detail.includes("(")) {
        const signature: SignatureInformation = {
          label: symbol.detail,
          documentation: symbol.documentation,
          parameters: [],
        };

        // Extract parameters from detail string e.g. "fn name(a, b)" or "Math.abs(n)"
        const paramMatch = symbol.detail.match(/\(([^)]*)\)/);
        if (paramMatch && paramMatch[1]) {
          const paramsList = paramMatch[1].split(",").map((p) => p.trim());
          signature.parameters = paramsList.map((p) => ({ label: p }));
        }

        // Determine current parameter index by counting commas
        const commas = textBefore.slice(openParenIndex).split(",").length - 1;

        return {
          signatures: [signature],
          activeSignature: 0,
          activeParameter: commas,
        };
      }
    } catch (e) {
      connection.console.log(`SignatureHelp Error: ${e}`);
    }

    return null;
  },
);

connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const program = astCache.get(params.textDocument.uri);
  if (!program) return [];

  const symbols = getSymbolsInProgram(program);
  return symbols
    .filter((s) => s.line !== undefined && s.column !== undefined)
    .map((s) => {
      // Map CompletionItemKind to SymbolKind
      let kind: SymbolKind = SymbolKind.Variable;
      if (s.kind === CompletionItemKind.Function) kind = SymbolKind.Function;
      else if (s.kind === CompletionItemKind.Constant)
        kind = SymbolKind.Constant;
      else if (s.kind === CompletionItemKind.Module) kind = SymbolKind.Module;
      else if (s.kind === CompletionItemKind.Class) kind = SymbolKind.Class;

      const line = Math.max(0, s.line - 1);
      const column = Math.max(0, s.column - 1);

      const range: Range = {
        start: { line: line, character: column },
        end: { line: line, character: column + s.name.length },
      };

      return {
        name: s.name,
        kind: kind,
        range: range,
        selectionRange: range,
        detail: s.detail,
      };
    });
});

connection.onDocumentFormatting(
  (params: DocumentFormattingParams): TextEdit[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    let text = document.getText();

    // 1. Expansion: Force braces onto new lines for multi-line professional look
    // Add newline after '{' if followed by non-whitespace (excluding '}')
    text = text.replace(/\{\s*([^\s}])/g, "{\n$1");
    // Add newline before '}' if preceded by non-whitespace (excluding '{')
    text = text.replace(/([^\s{])\s*\}/g, "$1\n}");

    const lines = text.split(/\r?\n/);
    const formattedLines: string[] = [];
    let indentLevel = 0;
    const indentSize = params.options.tabSize || 4;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      if (line.length === 0) {
        if (
          formattedLines.length > 0 &&
          formattedLines[formattedLines.length - 1] !== ""
        ) {
          formattedLines.push("");
        }
        continue;
      }

      // De-indent before constructing the line if it starts with a closing brace
      if (line.startsWith("}") || line.startsWith("]")) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      // Enforce Semicolons on statements that aren't blocks
      const isBlockStart = line.endsWith("{") || line.endsWith("[");
      const isBlockEnd =
        line.startsWith("}") || line.startsWith("]") || line.endsWith("}");
      const isControlFlow =
        line.startsWith("if") ||
        line.startsWith("while") ||
        line.startsWith("else");
      const isFunction = line.startsWith("fn ");
      const isComment = line.startsWith("//");
      const isProperty = line.includes(":") && !line.startsWith("import");
      const endsWithComma = line.endsWith(",");

      if (
        !isBlockStart &&
        !isBlockEnd &&
        !isControlFlow &&
        !isFunction &&
        !isComment &&
        !isProperty &&
        !endsWithComma &&
        !line.endsWith(";")
      ) {
        line += ";";
      }

      // Polish
      line = line
        .replace(/\s*(==|!=|<=|>=|=)\s*/g, " $1 ")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s*:\s*/g, ": ")
        .replace(/\)\s*\{/g, ") {")
        .replace(/\b(if|while|fn|import)\s?\(/g, "$1 (")
        .trim();

      // Indentation
      const formattedLine = " ".repeat(indentLevel * indentSize) + line;
      formattedLines.push(formattedLine);

      // Increase indent for next line if this line opens a block
      if (line.endsWith("{") || line.endsWith("[")) {
        indentLevel++;
      }
    }

    const fullRange: Range = {
      start: { line: 0, character: 0 },
      end: { line: lines.length + 10, character: 0 }, // Extra range to ensure we cover any added newlines
    };

    return [TextEdit.replace(fullRange, formattedLines.join("\n"))];
  },
);

documents.listen(connection);
connection.listen();
