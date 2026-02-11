# CursorScript VS Code Support 💎

Official Visual Studio Code extension for **CursorScript** (`.cursor`). This extension provides high-fidelity syntax highlighting, advanced code snippets, and language configuration for the CursorScript ecosystem.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![Type](https://img.shields.io/badge/category-Syntax_Highlighting-orange.svg)

## Features ✨

- **🌈 High-Fidelity Highlighting**: Deep support for keywords, logical operators (`&&`, `||`, `!`), object properties, and numeric/string literals.
- **⚡ Supercharged Snippets**: Instant templates for `fn`, `if`, `ifelse`, `while`, and common `WindowLib` patterns.
- **📦 Data Structure Aware**: Specific highlighting for nested Objects `{}` and dynamic Arrays `[]`.
- **🛠️ Game-Dev Ready**: Pre-configured for hardware-accelerated development using the `Window` and `Math` libraries.
- **💬 Pro Commenting**: Full support for line commenting (`//`) and bracket matching.

## Syntax Showcase 📝

The extension is optimized for modern CursorScript constructs:

### 1. Variables & Semicolons

```cursor
let score = 0;          // Mutable - Requires semicolon
const VERSION = "1.0";  // Constant - Requires semicolon
```

### 2. Logical Gates & Conditionals

```cursor
if (player.alive && score > 100) {
    print("Level Up!")
}
```

### 3. Dynamic Arrays

```cursor
let items = ["Sword", "Shield"];
push(items, "Potion");
print(len(items)); // 3
```

### 4. While Loops

```cursor
let i = 0;
while (i < 5) {
    print("Iteration: " + str(i))
    i = i + 1
}
```

### 5. Native Game Loop (WindowLib)

```cursor
Window.create(800, 600, "My Game")

fn tick() {
    Window.clear("black")
    if (Window.getMouseButton()) {
        print("Clicked at: ", Window.getMouseX())
    }
}

Window.onUpdate(tick)
```

## Installation 📦

1. Open **Visual Studio Code**.
2. Go to the **Extensions** view (`Ctrl+Shift+X`).
3. Click **Install from VSIX...** or search for **CursorScript** in the marketplace.
4. Restart VS Code to activate specific highlighting for `.cursor` files.

## Contributing 🤝

Developed by the CursorScript core team. Join us on [GitHub](https://github.com/naveenpoddar/cursorscript) to help build the future of rapid game scripting!

## License

MIT
