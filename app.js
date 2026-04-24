const canvas = document.querySelector("#graph");
const ctx = canvas.getContext("2d");
const form = document.querySelector("#expression-form");
const expressionInput = document.querySelector("#expression-input");
const expressionList = document.querySelector("#expressions");
const parserHint = document.querySelector("#parser-hint");

const palette = ["#df5b35", "#188f84", "#276fbf", "#9c5c16", "#8057a3", "#557a16"];
const morphDuration = 1500;
const functions = new Map([
  ["sin", { arity: 1, fn: Math.sin }],
  ["cos", { arity: 1, fn: Math.cos }],
  ["tan", { arity: 1, fn: Math.tan }],
  ["asin", { arity: 1, fn: Math.asin }],
  ["acos", { arity: 1, fn: Math.acos }],
  ["atan", { arity: 1, fn: Math.atan }],
  ["sqrt", { arity: 1, fn: Math.sqrt }],
  ["abs", { arity: 1, fn: Math.abs }],
  ["ln", { arity: 1, fn: Math.log }],
  ["log", { arity: 1, fn: Math.log10 }],
  ["exp", { arity: 1, fn: Math.exp }],
  ["floor", { arity: 1, fn: Math.floor }],
  ["ceil", { arity: 1, fn: Math.ceil }],
  ["round", { arity: 1, fn: Math.round }],
  ["min", { arity: 2, fn: Math.min }],
  ["max", { arity: 2, fn: Math.max }],
  ["pow", { arity: 2, fn: Math.pow }]
]);

let expressions = [];
let view = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 };
let drag = null;
let animationFrame = null;

const presets = {
  waves: ["sin(x)", "cos(2*x) / 2", "sin(x) + cos(3*x) / 3"],
  orbit: ["sin(x) * x / 4", "cos(x) * x / 4", "sqrt(abs(x)) * sin(3*x)"],
  calculus: ["x^2 / 6 - 2", "x / 1.5", "2*sin(x)"]
};

function tokenize(source) {
  const tokens = [];
  const clean = normalizeMathSyntax(source)
    .toLowerCase()
    .replaceAll("π", "pi")
    .replace(/\s+/g, "");
  let index = 0;

  while (index < clean.length) {
    const char = clean[index];
    if (/[0-9.]/.test(char)) {
      let value = char;
      index += 1;
      while (index < clean.length && /[0-9.]/.test(clean[index])) {
        value += clean[index];
        index += 1;
      }
      if (!Number.isFinite(Number(value))) throw new Error(`Invalid number "${value}"`);
      tokens.push({ type: "number", value: Number(value) });
      continue;
    }

    if (/[a-z]/.test(char)) {
      let name = char;
      index += 1;
      while (index < clean.length && /[a-z0-9_]/.test(clean[index])) {
        name += clean[index];
        index += 1;
      }
      tokens.push({ type: "name", value: name });
      continue;
    }

    if ("+-*/^(),=".includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unexpected character "${char}"`);
  }

  return insertImplicitMultiplication(stripEquationPrefix(tokens));
}

function normalizeMathSyntax(source) {
  const superscripts = {
    "⁰": "0",
    "¹": "1",
    "²": "2",
    "³": "3",
    "⁴": "4",
    "⁵": "5",
    "⁶": "6",
    "⁷": "7",
    "⁸": "8",
    "⁹": "9",
    "⁻": "-",
    "⁺": "+"
  };

  return source
    .replaceAll("√", "sqrt")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (match) => `^${[...match].map((char) => superscripts[char]).join("")}`);
}

function stripEquationPrefix(tokens) {
  const equalsAt = tokens.findIndex((token) => token.type === "=");
  if (equalsAt === -1) return tokens;
  const left = tokens.slice(0, equalsAt).map((token) => token.value).join("");
  if (left === "y" || left === "f(x)") return tokens.slice(equalsAt + 1);
  throw new Error("Only y= or f(x)= equations are supported");
}

function insertImplicitMultiplication(tokens) {
  const result = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    result.push(current);
    if (!next) continue;

    const currentEndsValue =
      current.type === "number" ||
      current.type === ")" ||
      (current.type === "name" && !functions.has(current.value));
    const nextStartsValue =
      next.type === "number" ||
      next.type === "(" ||
      next.type === "name";
    const functionCall = current.type === "name" && functions.has(current.value) && next.type === "(";
    if (currentEndsValue && nextStartsValue && !functionCall) {
      result.push({ type: "*", value: "*" });
    }
  }
  return result;
}

function parseExpression(source) {
  const tokens = tokenize(source);
  let position = 0;

  function peek() {
    return tokens[position];
  }

  function consume(type) {
    if (peek()?.type !== type) throw new Error(`Expected "${type}"`);
    return tokens[position++];
  }

  function parseAdditive() {
    let node = parseMultiplicative();
    while (peek()?.type === "+" || peek()?.type === "-") {
      const op = tokens[position++].type;
      const right = parseMultiplicative();
      node = { type: "binary", op, left: node, right };
    }
    return node;
  }

  function parseMultiplicative() {
    let node = parsePower();
    while (peek()?.type === "*" || peek()?.type === "/") {
      const op = tokens[position++].type;
      const right = parsePower();
      node = { type: "binary", op, left: node, right };
    }
    return node;
  }

  function parsePower() {
    let node = parseUnary();
    if (peek()?.type === "^") {
      tokens[position++];
      node = { type: "binary", op: "^", left: node, right: parsePower() };
    }
    return node;
  }

  function parseUnary() {
    if (peek()?.type === "+") {
      tokens[position++];
      return parseUnary();
    }
    if (peek()?.type === "-") {
      tokens[position++];
      return { type: "unary", value: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = peek();
    if (!token) throw new Error("Expression ended early");

    if (token.type === "number") {
      position += 1;
      return { type: "number", value: token.value };
    }

    if (token.type === "name") {
      position += 1;
      if (token.value === "x") return { type: "variable" };
      if (token.value === "pi") return { type: "number", value: Math.PI };
      if (token.value === "e") return { type: "number", value: Math.E };
      if (!functions.has(token.value)) throw new Error(`Unknown name "${token.value}"`);
      consume("(");
      const args = [parseAdditive()];
      while (peek()?.type === ",") {
        position += 1;
        args.push(parseAdditive());
      }
      consume(")");
      const signature = functions.get(token.value);
      if (args.length !== signature.arity) {
        throw new Error(`${token.value}() expects ${signature.arity} argument${signature.arity === 1 ? "" : "s"}`);
      }
      return { type: "call", name: token.value, args };
    }

    if (token.type === "(") {
      position += 1;
      const node = parseAdditive();
      consume(")");
      return node;
    }

    throw new Error(`Unexpected token "${token.value}"`);
  }

  const tree = parseAdditive();
  if (position !== tokens.length) throw new Error(`Unexpected token "${tokens[position].value}"`);

  return (x) => evaluate(tree, x);
}

function evaluate(node, x) {
  if (node.type === "number") return node.value;
  if (node.type === "variable") return x;
  if (node.type === "unary") return -evaluate(node.value, x);
  if (node.type === "call") {
    return functions.get(node.name).fn(...node.args.map((arg) => evaluate(arg, x)));
  }

  const left = evaluate(node.left, x);
  const right = evaluate(node.right, x);
  if (node.op === "+") return left + right;
  if (node.op === "-") return left - right;
  if (node.op === "*") return left * right;
  if (node.op === "/") return left / right;
  if (node.op === "^") return Math.pow(left, right);
  return NaN;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function findClosingParen(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function readExponent(source, start) {
  if (source[start] === "(") {
    const close = findClosingParen(source, start);
    if (close !== -1) {
      return {
        raw: source.slice(start + 1, close),
        end: close + 1
      };
    }
  }

  let end = start;
  if (source[end] === "-" || source[end] === "+") end += 1;
  while (end < source.length && /[a-z0-9.π]/i.test(source[end])) {
    end += 1;
  }
  return end === start ? null : { raw: source.slice(start, end), end };
}

function formatMathSource(source) {
  const clean = source.trim();
  if (!clean) return "";

  function formatSegment(segment) {
    let html = "";
    let index = 0;

    while (index < segment.length) {
      const rest = segment.slice(index).toLowerCase();

      if (rest.startsWith("sqrt(")) {
        const open = index + 4;
        const close = findClosingParen(segment, open);
        if (close !== -1) {
          html += `<span class="radical"><span class="radical-sign">√</span><span class="radicand">${formatSegment(segment.slice(open + 1, close))}</span></span>`;
          index = close + 1;
          continue;
        }
      }

      if (segment[index] === "^") {
        const exponent = readExponent(segment, index + 1);
        if (exponent) {
          html += `<sup>${formatSegment(exponent.raw)}</sup>`;
          index = exponent.end;
          continue;
        }
      }

      if (/[a-z]/i.test(segment[index])) {
        let end = index + 1;
        while (end < segment.length && /[a-z]/i.test(segment[end])) {
          end += 1;
        }
        const word = segment.slice(index, end);
        html += word.toLowerCase() === "pi" ? "π" : escapeHtml(word);
        index = end;
        continue;
      }

      if (segment[index] === "*") {
        html += "·";
      } else {
        html += escapeHtml(segment[index]);
      }
      index += 1;
    }

    return html;
  }

  return `<span class="pretty-math">${formatSegment(clean)}</span>`;
}

function prettifySourceText(source) {
  return source
    .replace(/\bsqrt(?=\()/gi, "√")
    .replace(/\bpi\b/gi, "π")
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/\^4/g, "⁴")
    .replace(/\^5/g, "⁵")
    .replace(/\^6/g, "⁶")
    .replace(/\^7/g, "⁷")
    .replace(/\^8/g, "⁸")
    .replace(/\^9/g, "⁹");
}

function prettifyInputValue(input) {
  const before = input.value;
  const start = input.selectionStart ?? before.length;
  const pretty = prettifySourceText(before);
  if (pretty === before) return;

  const prettyPrefix = prettifySourceText(before.slice(0, start));
  input.value = pretty;
  input.setSelectionRange(prettyPrefix.length, prettyPrefix.length);
}

function detectParentSource(source) {
  const compact = normalizeMathSyntax(source)
    .toLowerCase()
    .replaceAll("π", "pi")
    .replace(/\s+/g, "");
  const rhs = compact.includes("=") ? compact.slice(compact.indexOf("=") + 1) : compact;
  const unaryParents = ["sin", "cos", "tan", "sqrt", "abs", "ln", "log", "exp"];
  const functionParent = unaryParents.find((name) => rhs.includes(`${name}(`));

  if (functionParent) return `${functionParent}(x)`;
  if (/\bx\^3\b/.test(rhs)) return "x^3";
  if (/\bx\^2\b/.test(rhs) || rhs.includes("pow(x,2)")) return "x^2";
  if (rhs.includes("x")) return "x";
  return source;
}

function normalizeSource(source) {
  return normalizeMathSyntax(source)
    .toLowerCase()
    .replaceAll("π", "pi")
    .replace(/\s+/g, "")
    .replace(/^y=/, "")
    .replace(/^f\(x\)=/, "");
}

function createExpression(source, color, animate = true) {
  const evaluator = parseExpression(source);
  const parentSource = detectParentSource(source);
  const parentEvaluator = parseExpression(parentSource);
  const shouldMorph = animate && normalizeSource(parentSource) !== normalizeSource(source);

  return {
    id: crypto.randomUUID(),
    source,
    color,
    evaluator,
    parentSource,
    parentEvaluator,
    animationStart: shouldMorph ? performance.now() : null
  };
}

function addExpression(source, animate = true) {
  const color = palette[expressions.length % palette.length];
  expressions.push(createExpression(source, color, animate));
  saveState();
  renderExpressionList();
  draw();
}

function updateExpression(id, source) {
  const item = expressions.find((expression) => expression.id === id);
  if (!item) return;
  try {
    const replacement = createExpression(source, item.color);
    Object.assign(item, replacement, { id });
    setHint("Expression updated", "success");
  } catch (error) {
    setHint(error.message, "error");
  }
  saveState();
  draw();
}

function removeExpression(id) {
  expressions = expressions.filter((expression) => expression.id !== id);
  saveState();
  renderExpressionList();
  draw();
}

function renderExpressionList() {
  expressionList.innerHTML = "";
  expressions.forEach((expression) => {
    const card = document.createElement("article");
    card.className = "expression-card";

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = expression.color;

    const body = document.createElement("div");
    body.className = "expression-body";
    const input = document.createElement("input");
    input.value = expression.source;
    input.setAttribute("aria-label", "Edit expression");
    input.addEventListener("input", () => prettifyInputValue(input));
    input.addEventListener("change", () => updateExpression(expression.id, input.value));
    const parent = document.createElement("span");
    parent.className = "parent-chip";
    parent.textContent = normalizeSource(expression.parentSource) === normalizeSource(expression.source)
      ? "parent function"
      : `from ${expression.parentSource}`;
    body.append(input, parent);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${expression.source}`);
    remove.addEventListener("click", () => removeExpression(expression.id));

    card.append(swatch, body, remove);
    expressionList.append(card);
  });
}

function draw(timestamp = performance.now()) {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  fitCanvas();
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  drawGrid();
  const hasActiveMorphs = expressions.some((expression) => morphProgress(expression, timestamp) < 1);
  expressions.forEach((expression) => drawCurve(expression, timestamp));

  if (hasActiveMorphs) {
    animationFrame = requestAnimationFrame(draw);
  }
}

function drawGrid() {
  const width = canvas.width;
  const height = canvas.height;
  const step = niceStep((view.xMax - view.xMin) / 10);
  const yStep = niceStep((view.yMax - view.yMin) / 8);

  ctx.lineWidth = 1;
  ctx.font = `${12 * devicePixelRatio}px "Times New Roman", Times, serif`;
  ctx.textBaseline = "top";

  for (let x = Math.ceil(view.xMin / step) * step; x <= view.xMax; x += step) {
    const screen = toScreen(x, 0).x;
    ctx.strokeStyle = Math.abs(x) < step / 2 ? "rgba(22,32,29,.38)" : "rgba(22,32,29,.09)";
    ctx.beginPath();
    ctx.moveTo(screen, 0);
    ctx.lineTo(screen, height);
    ctx.stroke();
    if (Math.abs(x) > step / 2) {
      ctx.fillStyle = "rgba(22,32,29,.42)";
      ctx.fillText(formatTick(x), screen + 6, toScreen(0, 0).y + 8);
    }
  }

  for (let y = Math.ceil(view.yMin / yStep) * yStep; y <= view.yMax; y += yStep) {
    const screen = toScreen(0, y).y;
    ctx.strokeStyle = Math.abs(y) < yStep / 2 ? "rgba(22,32,29,.38)" : "rgba(22,32,29,.09)";
    ctx.beginPath();
    ctx.moveTo(0, screen);
    ctx.lineTo(width, screen);
    ctx.stroke();
    if (Math.abs(y) > yStep / 2) {
      ctx.fillStyle = "rgba(22,32,29,.42)";
      ctx.fillText(formatTick(y), toScreen(0, 0).x + 8, screen + 6);
    }
  }
}

function drawCurve(expression, timestamp) {
  const width = canvas.width;
  const samples = Math.min(width, 2400);
  let drawing = false;
  const progress = morphProgress(expression, timestamp);
  const easing = easeInOutCubic(progress);

  ctx.save();
  ctx.strokeStyle = expression.color;
  ctx.lineWidth = 3.2 * devicePixelRatio;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  for (let i = 0; i <= samples; i += 1) {
    const pixel = (i / samples) * width;
    const x = view.xMin + (pixel / width) * (view.xMax - view.xMin);
    const finalY = expression.evaluator(x);
    const parentY = expression.parentEvaluator(x);
    const y = Number.isFinite(parentY) && Number.isFinite(finalY)
      ? parentY + (finalY - parentY) * easing
      : finalY;
    const point = toScreen(x, y);
    const visible = Number.isFinite(y) && Math.abs(point.y) < canvas.height * 4;

    if (!visible) {
      drawing = false;
      continue;
    }

    if (drawing) {
      ctx.lineTo(point.x, point.y);
    } else {
      ctx.moveTo(point.x, point.y);
      drawing = true;
    }
  }

  ctx.stroke();
  ctx.restore();

  if (progress < 1) drawParentGhost(expression);
}

function drawParentGhost(expression) {
  const width = canvas.width;
  const samples = Math.min(width, 1800);
  let drawing = false;

  ctx.save();
  ctx.strokeStyle = expression.color;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 1.5 * devicePixelRatio;
  ctx.setLineDash([6 * devicePixelRatio, 7 * devicePixelRatio]);
  ctx.beginPath();

  for (let i = 0; i <= samples; i += 1) {
    const pixel = (i / samples) * width;
    const x = view.xMin + (pixel / width) * (view.xMax - view.xMin);
    const y = expression.parentEvaluator(x);
    const point = toScreen(x, y);
    const visible = Number.isFinite(y) && Math.abs(point.y) < canvas.height * 4;

    if (!visible) {
      drawing = false;
      continue;
    }

    if (drawing) {
      ctx.lineTo(point.x, point.y);
    } else {
      ctx.moveTo(point.x, point.y);
      drawing = true;
    }
  }

  ctx.stroke();
  ctx.restore();
}

function morphProgress(expression, timestamp) {
  if (!expression.animationStart) return 1;
  return Math.min(1, Math.max(0, (timestamp - expression.animationStart) / morphDuration));
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function toScreen(x, y) {
  return {
    x: ((x - view.xMin) / (view.xMax - view.xMin)) * canvas.width,
    y: canvas.height - ((y - view.yMin) / (view.yMax - view.yMin)) * canvas.height
  };
}

function fromScreen(x, y) {
  return {
    x: view.xMin + (x / canvas.width) * (view.xMax - view.xMin),
    y: view.yMin + ((canvas.height - y) / canvas.height) * (view.yMax - view.yMin)
  };
}

function niceStep(raw) {
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / power;
  if (normalized < 2) return power;
  if (normalized < 5) return 2 * power;
  return 5 * power;
}

function formatTick(value) {
  return Math.abs(value) >= 100 ? value.toFixed(0) : Number(value.toFixed(2)).toString();
}

function zoom(factor, origin = { x: canvas.width / 2, y: canvas.height / 2 }) {
  const before = fromScreen(origin.x, origin.y);
  const xSpan = (view.xMax - view.xMin) * factor;
  const ySpan = (view.yMax - view.yMin) * factor;
  const xRatio = origin.x / canvas.width;
  const yRatio = 1 - origin.y / canvas.height;
  view = {
    xMin: before.x - xSpan * xRatio,
    xMax: before.x + xSpan * (1 - xRatio),
    yMin: before.y - ySpan * yRatio,
    yMax: before.y + ySpan * (1 - yRatio)
  };
  saveState();
  draw();
}

function pan(dx, dy) {
  const xShift = (dx / canvas.width) * (view.xMax - view.xMin);
  const yShift = (dy / canvas.height) * (view.yMax - view.yMin);
  view.xMin -= xShift;
  view.xMax -= xShift;
  view.yMin += yShift;
  view.yMax += yShift;
  saveState();
  draw();
}

function resetView() {
  view = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 };
  saveState();
  draw();
}

function setHint(message, type = "") {
  parserHint.textContent = message;
  parserHint.className = `hint ${type}`;
}

function saveState() {
  const state = {
    expressions: expressions.map(({ source }) => source),
    view
  };
  history.replaceState(null, "", `#${encodeURIComponent(JSON.stringify(state))}`);
}

function loadState() {
  let sources = [];
  try {
    if (location.hash.length > 1) {
      const state = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      if (Array.isArray(state.expressions) && state.expressions.length) sources = state.expressions;
      if (state.view) view = state.view;
    }
  } catch {
    sources = [];
  }

  expressions = [];
  sources.forEach((source, index) => {
    try {
      expressions.push({
        ...createExpression(source, palette[index % palette.length], false)
      });
    } catch {
      // Ignore malformed expressions from edited URLs.
    }
  });
  renderExpressionList();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = expressionInput.value.trim();
  if (!value) return;
  try {
    addExpression(value);
    expressionInput.value = "";
    setHint("Plotted successfully", "success");
  } catch (error) {
    setHint(error.message, "error");
  }
});

expressionInput.addEventListener("input", () => prettifyInputValue(expressionInput));

document.querySelector("#zoom-in").addEventListener("click", () => zoom(0.72));
document.querySelector("#zoom-out").addEventListener("click", () => zoom(1.38));
document.querySelector("#reset-view").addEventListener("click", resetView);
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  drag = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointermove", (event) => {
  const ratio = window.devicePixelRatio || 1;

  if (!drag) return;
  pan((event.clientX - drag.x) * ratio, (event.clientY - drag.y) * ratio);
  drag = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointerup", () => {
  drag = null;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  zoom(event.deltaY > 0 ? 1.12 : 0.88, {
    x: (event.clientX - rect.left) * ratio,
    y: (event.clientY - rect.top) * ratio
  });
}, { passive: false });

window.addEventListener("resize", draw);

loadState();
draw();
