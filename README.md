# CursorScript VS Code Support

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.0.5-green.svg)

Official Visual Studio Code support for **CursorScript** (`.cursor`). This extension provides syntax highlighting, code snippets, and language configuration to enhance your development experience with CursorScript.

## Features

- **Syntax Highlighting**: Comprehensive coloring for keywords, variables, functions, and data structures.
- **Code Snippets**: Quickly generate common code blocks like functions (`fn`), log statements (`print`), and control flow structures.
- **Bracket Matching**: Automatic matching of braces `{}`, parentheses `()`, and brackets `[]`.
- **Comment Toggling**: Support for line comments.

## Supported Syntax

CursorScript supports modern programming constructs including:

- **Variables**: `let` and `const` declarations.
- **Functions**: First-class functions with `fn` keyword, supporting closures and nested definitions.
- **Objects**: JSON-like object literals with nested structures.
- **Built-ins**: Native support for functions like `print()` and `time()`.

## Usage Example

Create a file ending in `.cursor` and start coding! Here is a sample of what you can do:

```cursor
// Variable declarations
let foo = 50 / 2;

// Object literals
let person = {
    age: 30,
    isMonster: true,
    address: {
        pincode: 123456,
        countryCode: 12
    }
};

// Built-in functions
print(foo, 45, time())

// Functions and Closures
fn makeAdder(offset) {
    fn add(x, y) {
        x + y + offset
    }
}

const adder = makeAdder(10);
const result = adder(10, 4);

print(result)
```

## Installation

1. Open **Visual Studio Code**.
2. Go to the **Extensions** view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Search for **CursorScript**.
4. Click **Install**.

## Contributing

We welcome contributions! If you find a bug or want to request a feature, please visit our [GitHub Repository](https://github.com/naveenpoddar/cursorscript).

## License

This project is licensed under the MIT License.
