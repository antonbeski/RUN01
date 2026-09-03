---
name: desmos
description: Authoritative guide for generating interactive Desmos mathematical graphs, analytical proofs, parametric curves, and dynamic sliders in RUN01 without errors.
argument-hint: "[equations] [simulation-type]"
metadata:
  author: run01
  version: "2.0.0"
---

# Desmos Mathematical Graphing & Analytical Proof Skill

This skill instructs the AI on generating error-free Desmos expressions, parametric curves, slider controls, and analytical proofs to accompany simulations and mathematical models in RUN01.

---

## 1. Invocation Interfaces

### Method A: Direct Python Pyodide in `main.py`
The IDE injects `desmos` and `show_desmos` directly into Python:
```python
# Pass LaTeX strings or expression dictionaries
show_desmos(
    r"g = 9.81",
    r"v_0 = 15",
    r"\theta = \frac{\pi}{4}",
    r"x(t) = v_0 \cdot \cos(\theta) \cdot t",
    r"y(t) = v_0 \cdot \sin(\theta) \cdot t - \frac{1}{2} g t^2",
    r"(x(t), y(t))",
    title="Projectile Kinematics Trajectory"
)
```

### Method B: Markdown Code Block in AI Chat
Output a `desmos` fenced block in chat:
````markdown
```desmos
g = 9.81
v_0 = 12
\theta = \frac{\pi}{3}
x(t) = v_0 \cos(\theta) t
y(t) = v_0 \sin(\theta) t - 0.5 g t^2
(x(t), y(t))
```
````
The chat renderer renders an interactive Desmos calculator inline and provides an **Open in Desmos Panel** button.

---

## 2. LaTeX Syntax Rules for Desmos (Strict Compliance)

To avoid syntax errors in the Desmos API:
1. **Multiplication**: Always use explicit `\cdot` or space between symbols (e.g., `m \cdot g \cdot h` or `v_0 \cos(\theta)`).
2. **Fractions**: Always use `\frac{numerator}{denominator}`.
3. **Exponents**: Always wrap powers in curly braces `x^{2}`, `e^{-k t}`.
4. **Subscripts**: Always wrap variable subscripts: `x_{1}`, `v_{initial}`.
5. **Parametric Equations**: Use the single reserved parameter `t` inside coordinate parentheses: `(x(t), y(t))`.
6. **Inequalities & Shading**: Use `y \le \sin(x)` or `y \ge x^{2} - 4`.
7. **Domain Restrictions**: Suffix curly bracket domain condition: `y = \sqrt{x} \{x \ge 0\}`.

---

## 3. Common Simulation Recipes

### Recipe 1: Damped Harmonic Oscillator
```desmos
m = 1.5
k = 25.0
c = 0.4
\omega = \sqrt{\frac{k}{m} - (\frac{c}{2m})^2}
\gamma = \frac{c}{2m}
x(t) = e^{-\gamma t} \cos(\omega t)
(t, x(t))
```

### Recipe 2: Double Pendulum Chaos Phase Plane
```desmos
L_1 = 1.0
L_2 = 0.8
\theta_1 = 0.8 \cos(2.4 t)
\theta_2 = 1.2 \cos(3.8 t + 0.5)
x_1 = L_1 \sin(\theta_1)
y_1 = -L_1 \cos(\theta_1)
x_2 = x_1 + L_2 \sin(\theta_2)
y_2 = y_1 - L_2 \cos(\theta_2)
(x_2, y_2)
```

### Recipe 3: Snell's Law & Refractive Caustic
```desmos
n_1 = 1.00
n_2 = 1.52
\theta_i = \frac{\pi}{6}
\theta_r = \arcsin(\frac{n_1}{n_2} \sin(\theta_i))
y_1(x) = \tan(\theta_i) x \{x \le 0\}
y_2(x) = \tan(\theta_r) x \{x > 0\}
```

---

## 4. Verification Check Before Emitting Code
- Never emit non-LaTeX variable operators like Python `**` (use `^`).
- Never emit raw text comments starting with `#` inside Desmos code blocks (only clean math equations per line).
- Ensure every equation is on its own line.
