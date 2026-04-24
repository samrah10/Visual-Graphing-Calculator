# Henry Graphs

## Run Locally

Use any static server from this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish On GitHub Pages

1. Create a new GitHub repository.
2. Push these files to the repository root.
3. In GitHub, open `Settings` → `Pages`.
4. Set the source to `Deploy from a branch`.
5. Choose `main` and `/root`, then save.

GitHub will publish the app at the Pages URL shown in that settings screen.

## Features

- Dependency-free static app: HTML, CSS, and JavaScript only.
- Expression plotting for functions of `x`.
- Supports `+`, `-`, `*`, `/`, `^`, parentheses, `pi`, `e`, and common functions.
- New curves animate from a detected parent function into the transformed function.
- Pan by dragging, zoom with the mouse wheel, or use the zoom buttons.
- Shareable URL state for the current expressions and viewport.
- Preset graph scenes for quick demos.

## Example Expressions

```text
sin(x)
x^2 / 6 - 2
sqrt(abs(x)) * sin(3*x)
y = cos(x) * x / 3
```
