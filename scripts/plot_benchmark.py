#!/usr/bin/env python3
"""
Generate publication figures from the synthetic-benchmark summary.

Reads  paper/benchmark/metrics_summary.json
Writes paper/figures/{f1_dup_sensitivity,f2_corruption_sensitivity,f3_method_comparison}.pdf (+ .png)

Run:  python3 scripts/plot_benchmark.py
"""
import json
import os
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUMMARY = os.path.join(ROOT, "paper", "benchmark", "metrics_summary.json")
FIGDIR = os.path.join(ROOT, "paper", "figures")
os.makedirs(FIGDIR, exist_ok=True)

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 11,
    "axes.grid": True,
    "grid.alpha": 0.3,
    "figure.dpi": 150,
})

with open(SUMMARY, encoding="utf-8") as fh:
    S = json.load(fh)


def save(fig, name):
    for ext in ("pdf", "png"):
        fig.savefig(os.path.join(FIGDIR, f"{name}.{ext}"), bbox_inches="tight")
    plt.close(fig)
    print(f"wrote {name}.pdf / .png")


# --- F1: duplication-rate sensitivity ---
dup = S["f1_dupSweep"]
x = [d["dupRate"] * 100 for d in dup]
fig, ax = plt.subplots(figsize=(5.2, 3.6))
ax.errorbar(x, [d["f1"] for d in dup], yerr=[d["f1_ci"] for d in dup],
            marker="o", capsize=3, label="Парна F1", color="#1f77b4")
ax.errorbar(x, [d["b3f1"] for d in dup], yerr=[d["b3f1_ci"] for d in dup],
            marker="s", capsize=3, label="B³ F1", color="#ff7f0e")
ax.axvspan(15, 25, color="grey", alpha=0.12, label="Заявлений діапазон (15–25%)")
ax.set_xlabel("Частка дублікатів, %")
ax.set_ylabel("Якість дедуплікації, %")
ax.set_title("Чутливість до рівня дублювання (Golden Record)")
ax.legend(fontsize=9)
save(fig, "f1_dup_sensitivity")

# --- F2: corruption-level sensitivity (precision vs recall cliff) ---
corr = S["f2_corruptionSweep"]
cx = [c["corruption"] for c in corr]
fig, ax = plt.subplots(figsize=(5.2, 3.6))
ax.errorbar(cx, [c["precision"] for c in corr], yerr=[c["precision_ci"] for c in corr],
            marker="o", capsize=3, label="Точність (Precision)", color="#2ca02c")
ax.errorbar(cx, [c["recall"] for c in corr], yerr=[c["recall_ci"] for c in corr],
            marker="v", capsize=3, label="Повнота (Recall)", color="#d62728")
ax.axvline(1.0, color="grey", ls="--", lw=1, alpha=0.6)
ax.set_xlabel("Множник спотворення метаданих")
ax.set_ylabel("Метрика, %")
ax.set_title("Чутливість до спотворення метаданих (Golden Record)")
ax.legend(fontsize=9)
save(fig, "f2_corruption_sensitivity")

# --- F3: method comparison (grouped bars P / R / F1) ---
t1 = S["t1_dedupQuality"]
labels = S["methodLabels"]
order = ["doi", "titleyear", "golden"]
methods = [labels[m] for m in order]
metrics = [("precision", "Точність"), ("recall", "Повнота"), ("f1", "F1")]
colors = ["#9ecae1", "#fdae6b", "#74c476"]
import numpy as np  # noqa: E402

xpos = np.arange(len(methods))
w = 0.26
fig, ax = plt.subplots(figsize=(5.6, 3.8))
for i, (key, lab) in enumerate(metrics):
    vals = [t1[m][key]["mean"] for m in order]
    errs = [t1[m][key]["ci"] for m in order]
    ax.bar(xpos + (i - 1) * w, vals, w, yerr=errs, capsize=3, label=lab, color=colors[i])
ax.set_xticks(xpos)
ax.set_xticklabels(methods)
ax.set_ylabel("Метрика, %")
ax.set_ylim(0, 105)
ax.set_title("Порівняння методів дедуплікації")
ax.legend(fontsize=9, ncol=3)
save(fig, "f3_method_comparison")

print("Figures written to", FIGDIR)
