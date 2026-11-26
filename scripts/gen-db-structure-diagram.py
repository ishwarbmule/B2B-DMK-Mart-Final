"""Inventory structure diagram for the DMK Mart database reference document."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

fig, ax = plt.subplots(figsize=(9.2, 5.0), constrained_layout=True)
ax.set_xlim(0, 100)
ax.set_ylim(0, 58)
ax.axis("off")

AMBER = "#B45309"
DARK = "#1F1A0F"
LIGHT = "#FDF6E9"
GREY = "#6B6255"


def box(x, y, w, h, title, lines, fill=LIGHT, edge=AMBER, title_color=DARK):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.8,rounding_size=2.2",
                       linewidth=1.6, edgecolor=edge, facecolor=fill)
    ax.add_patch(p)
    ax.text(x + w / 2, y + h - 4.2, title, ha="center", va="center",
            fontsize=11.5, fontweight="bold", color=title_color)
    ax.plot([x + 6, x + w - 6], [y + h - 7.4, y + h - 7.4], color=edge, lw=1.1, alpha=0.65)
    for i, ln in enumerate(lines):
        ax.text(x + w / 2, y + h - 10.6 - i * 4.3, ln, ha="center", va="center",
                fontsize=9.0, color=GREY if i else DARK)


def arrow(x1, y1, x2, y2, label):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=16,
                        linewidth=1.6, color=AMBER)
    ax.add_patch(a)
    ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 2.6, label, ha="center", va="center",
            fontsize=8.6, color=AMBER, fontweight="bold")


# Layer 1 — catalog
box(3, 33, 30, 21, "PRODUCT CATALOG", ["4,781 products (Product table)", "one row per SKU", "prices · brand · categories · media"])
# Layer 2 — godowns
box(35, 33, 30, 21, "WAREHOUSE (godown)", ["2 shown: Kolhar + DMK Mart Pune", "GST-firm godowns stay hidden", "Warehouse table"])
# Layer 3 — stock rows
box(67, 33, 30, 21, "WAREHOUSE STOCK", ["one row per godown x product", "qty = that godown's own count", "2,558 rows today"])
# Below — storefront outputs
box(13, 6, 34, 17, "PRODUCT stock", ["sum of godown qtys", "drives green dot / OOS badge", "auto Ready-to-Dispatch"])
box(53, 6, 34, 17, "BROCHURE / panel lens", ["each godown lists the full catalog", "with its own qty (0 = not here)", "inactive products included"])

arrow(33, 43.5, 35, 43.5, "")
arrow(65, 43.5, 67, 43.5, "")
arrow(50, 33, 30, 23, "adds up")
arrow(82, 33, 70, 23, "reads qty")

ax.text(50, 56.5, "DMK Mart inventory — three layers", ha="center", fontsize=13,
        fontweight="bold", color=DARK)

plt.savefig("/home/z/my-project/scripts/db-structure-diagram.png", dpi=200, facecolor="white")
print("saved")
