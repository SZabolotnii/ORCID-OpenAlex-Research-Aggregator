#!/usr/bin/env python3
"""
Generate the threshold-justification figure from the sensitivity analysis.

Reads  paper/benchmark/sensitivity_summary.json
Writes paper/figures/f4_threshold_sensitivity.pdf (+ .png)

Answers reviewer 2, item 3: empirical justification of theta_match / theta_review.
Left panel  — Precision / Recall / F1 as a function of theta_match.
Right panel — HITL review-band load as a function of theta_review at theta_match = 0.90.

Run:  python3 scripts/plot_sensitivity.py
"""
import json
import os
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUMMARY = os.path.join(ROOT, "paper", "benchmark", "sensitivity_summary.json")
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

theta_default = S["config"]["defaults"]["thetaMatch"]
review_default = S["config"]["defaults"]["thetaReview"]

fig, (axL, axR) = plt.subplots(1, 2, figsize=(10.4, 3.8))

# --- left: quality vs theta_match ---
sw = S["s1_thetaMatchSweep"]
x = [r["thetaMatch"] for r in sw]
axL.errorbar(x, [r["precision"] for r in sw], yerr=[r["precision_ci"] for r in sw],
             marker="o", capsize=3, label="Точність (Precision)", color="#2ca02c")
axL.errorbar(x, [r["recall"] for r in sw], yerr=[r["recall_ci"] for r in sw],
             marker="v", capsize=3, label="Повнота (Recall)", color="#d62728")
axL.errorbar(x, [r["f1"] for r in sw], yerr=[r["f1_ci"] for r in sw],
             marker="s", capsize=3, label="F1", color="#1f77b4")
axL.axvline(theta_default, color="grey", ls="--", lw=1.2)
axL.annotate(f"θ_match = {theta_default}", xy=(theta_default, 5), xytext=(-6, 0),
             textcoords="offset points", rotation=90, va="bottom", ha="right",
             fontsize=9, color="dimgrey")
axL.set_xlabel("Поріг автоматичного злиття θ_match")
axL.set_ylabel("Метрика, %")
axL.set_ylim(0, 105)
axL.set_title("Якість дедуплікації залежно від θ_match")
axL.legend(fontsize=9, loc="upper left", framealpha=0.9)

# --- right: HITL load vs theta_review ---
rw = S["s2_thetaReviewSweep"]
rx = [r["thetaReview"] for r in rw]
axR.plot(rx, [r["reviewPairsPerResearcher"] for r in rw],
         marker="o", color="#9467bd", label="Пари у смузі HITL")
axR.axvline(review_default, color="grey", ls="--", lw=1.2)
axR.annotate(f"θ_review = {review_default}", xy=(review_default, max(r["reviewPairsPerResearcher"] for r in rw) * 0.05),
             xytext=(-6, 0), textcoords="offset points", rotation=90, va="bottom", ha="right",
             fontsize=9, color="dimgrey")
axR.set_xlabel("Поріг ручної перевірки θ_review (за θ_match = %.2f)" % theta_default)
axR.set_ylabel("Пар на дослідника")
axR.set_title("Навантаження смуги ручної перевірки")
axR.legend(fontsize=9)

fig.tight_layout()
for ext in ("pdf", "png"):
    fig.savefig(os.path.join(FIGDIR, f"f4_threshold_sensitivity.{ext}"), bbox_inches="tight")
plt.close(fig)
print("wrote f4_threshold_sensitivity.pdf / .png to", FIGDIR)
