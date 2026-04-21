from flask import Flask, render_template, request
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import io
import base64

app = Flask(__name__)

def safe_eval(expression, x_values):
    """
    Very simple evaluator for beginner-friendly graphing.
    Allowed:
    - x
    - +, -, *, /, **, parentheses
    - np.sin(x), np.cos(x), np.tan(x)
    - np.sqrt(x), np.abs(x), np.log(x), np.exp(x)
    """
    allowed_names = {
        "x": x_values,
        "np": np
    }
    return eval(expression, {"__builtins__": {}}, allowed_names)

@app.route("/", methods=["GET", "POST"])
def index():
    graph_url = None
    error = ""
    expression = "x**2"

    if request.method == "POST":
        expression = request.form.get("expression", "x**2")

        try:
            x = np.linspace(-10, 10, 400)
            y = safe_eval(expression, x)

            plt.figure(figsize=(7, 5))
            plt.plot(x, y, label=f"y = {expression}")
            plt.axhline(0)
            plt.axvline(0)
            plt.xlim(-10, 10)
            plt.ylim(-10, 10)
            plt.grid(True)
            plt.legend()

            buffer = io.BytesIO()
            plt.savefig(buffer, format="png", bbox_inches="tight")
            buffer.seek(0)
            graph_url = base64.b64encode(buffer.getvalue()).decode("utf-8")
            buffer.close()
            plt.close()

        except Exception:
            error = "Invalid function. Try something like x**2, np.sin(x), or x**3 - 2*x."

    return render_template("index.html", graph_url=graph_url, error=error, expression=expression)

if __name__ == "__main__":
    app.run(debug=True)
