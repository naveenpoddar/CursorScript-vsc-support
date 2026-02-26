# CursorScript VS Code Support 💎

The ultimate IDE experience for **CursorScript** (`.cursor`). This extension transforms Visual Studio Code into a high-performance development environment with a custom Language Server, intelligent autocompletion, and professional formatting.

![Version](https://img.shields.io/badge/version-0.0.8-blue.svg)
![LSP](https://img.shields.io/badge/LSP-Enabled-green.svg)
![Formatter](https://img.shields.io/badge/Formatter-Prettier--Style-orange.svg)

---

## 🚀 Pro Features

### 🧠 Advanced IntelliSense & Autocomplete

Powered by a custom-built **Language Server Protocol (LSP)**, CursorScript provides real-time intelligent suggestions:

- **Global & Library Symbols**: Instant access to `Math`, `Window`, `Engine3D`, and more.
- **Snippet Support**: Type `fn`, `lambda`, `if`, or `main` and hit `Enter` for instant code templates with tab-indices.
- **Variable Suggestions**: Deep scan of local and global scopes, including nested function variables and parameters.

### 🔍 Scientific Diagnostics & Hovers

- **Live Syntax Checking**: Get instant red squiggles for errors with meaningful messages and precise line/column locations.
- **Hover Documentation**: Hover over any variable, function, or library member to see its signature, type, and documentation.
- **Signature Help**: Never forget arguments again! Automatic popups show parameter lists while you type function calls.

### 🎯 Navigation & Outline

- **Go to Definition (`F12`)**: Right-click any variable or function and jump straight to its declaration.
- **Document Symbols (`Ctrl+Shift+O`)**: A structured outline view of your script, including all variables, constants, and functions.

### 💎 Automatic Type Inference

The IDE intelligently detects variable types from assignments. Whether it's a `number`, `string`, `array`, `object`, or even a `fn()`, the IDE knows and shows it to you.

### 🧼 Prettier-Style Formatter

Enforce a professional codebase with one keystroke (`Shift + Alt + F`):

- **Auto-Formatting**: Aligns indentation (4 spaces) and cleans up messy code.
- **Semicolon Enforcement**: Automatically appends semicolons to statements for a clean, consistent Prettier/TypeScript look.
- **Block Expansion**: Automatically expands single-line blocks into clean, multi-line structures.
- **Optional Brackets**: Smart handling of modern semicolon-optional syntax for block declarations.

---

## 📝 Syntax Showcase

The extension is optimized for modern, high-speed scripting constructs:

### 1. Variables & Type Inference

```cursor
let score = 100;           // (variable: number)
const name = "Naveen";    // (constant: string)
let list = [1, 2, 3];     // (variable: array)
```

### 2. Lambda Functions

```cursor
let multiply = (a, b) -> {
    a * b
};
print(multiply(5, 10));
```

### 3. Native Engine Libraries

```cursor
import { Window } from "WindowLib";

fn main() {
    Window.create(1280, 720, "TradeForge");
    Window.clear("black");
}
```

### 4. Advanced Logical Flow

```cursor
if (score > 100 && player.alive) {
    print("Victory!");
} else {
    print("Game Over");
}
```

---

## 📦 Installation

1. Open **Visual Studio Code**.
2. Go to the **Extensions** view (`Ctrl+Shift+X`).
3. Search for **CursorScript** or install from our official VSIX package.
4. Open any `.cursor` file to activate the **CursorScript Language Server**.

## 🤝 Community & Support

Developed with ❤️ by the **CursorScript Core Team**.
Building the future of rapid application and game development.

[GitHub Repository](https://github.com/naveenpoddar/cursorscript) | [Documentation](https://cursorscript.dev)

## License

MIT
