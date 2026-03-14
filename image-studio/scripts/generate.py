#!/usr/bin/env python3
"""
E-commerce product image generation via Nano Banana API.

Supports:
- Product hero shots (white/studio background)
- Detail page grid images (4-panel narratives)
- Marketing banners (custom aspect ratios)
- Product mockups (scene placement)
- Promotional graphics (text overlay ready)
"""

import argparse
import os
import sys

# Allow running as script or module
sys.path.insert(0, os.path.dirname(__file__))
from nanobanana_api import (
    generate_image, MODELS, MODEL_ALIASES, VALID_ASPECT_RATIOS, VALID_IMAGE_SIZES,
    DEFAULT_MODEL,
)


# ---------------------------------------------------------------------------
# Prompt Templates — High-quality defaults for common e-commerce scenarios
# ---------------------------------------------------------------------------

ECOMMERCE_TEMPLATES = {
    "hero": {
        "prefix": "Professional product photography, studio lighting, clean white background, "
                  "high-end commercial quality, sharp focus, 8K detail, ",
        "suffix": ", centered composition, soft shadows, product catalog style",
        "aspect_ratio": "1:1",
        "image_size": "2K",
    },
    "banner": {
        "prefix": "E-commerce promotional banner, modern design, vibrant colors, "
                  "premium look, marketing material, ",
        "suffix": ", clean typography space, professional advertising layout",
        "aspect_ratio": "16:9",
        "image_size": "2K",
    },
    "detail": {
        "prefix": "Product detail close-up, macro photography, studio lighting, "
                  "showing texture and material quality, ",
        "suffix": ", high resolution detail shot, commercial product photography",
        "aspect_ratio": "3:4",
        "image_size": "2K",
    },
    "lifestyle": {
        "prefix": "Lifestyle product photography, natural setting, warm ambient lighting, "
                  "aspirational scene, ",
        "suffix": ", editorial style, premium brand imagery, depth of field",
        "aspect_ratio": "4:3",
        "image_size": "2K",
    },
    "grid": {
        "prefix": "Four-panel product showcase, e-commerce detail page layout, "
                  "consistent lighting across panels, ",
        "suffix": ", product features highlight, clean professional grid composition",
        "aspect_ratio": "1:1",
        "image_size": "2K",
    },
    "social": {
        "prefix": "Social media product post, eye-catching design, Instagram-ready, "
                  "modern minimal aesthetic, ",
        "suffix": ", engaging visual, scroll-stopping composition, trendy design",
        "aspect_ratio": "4:5",
        "image_size": "1K",
    },
}


# ---------------------------------------------------------------------------
# Icon Templates — Prompt wrapping optimized for downstream extraction
# ---------------------------------------------------------------------------
# Why "surrounding prompt" pattern:
#   The model generates whatever it wants unless we structurally constrain it.
#   These templates force specific layout behavior to make extraction reliable.

ICON_TEMPLATES = {
    "icon": {
        # Single icon: centered, maximum canvas utilization, extraction-trivial
        "prefix": (
            "A single flat design icon on a pure solid white (#FFFFFF) background. "
            "The icon occupies 80% of the canvas, perfectly centered horizontally "
            "and vertically. Clean vector style, sharp edges, no shadows, no "
            "gradients on background. The icon depicts: "
        ),
        "suffix": (
            ". Flat design, modern UI icon style, consistent stroke weight, "
            "minimal detail, suitable for app UI at any size."
        ),
        "aspect_ratio": "1:1",
        "image_size": "1K",
        # Metadata for extraction pipeline
        "_layout": "single",
        "_grid": "1x1",
    },
    "icon-set": {
        # 3×3 grid: nine icons with equal spacing, grid-splittable
        "prefix": (
            "A sprite sheet of exactly 9 icons in a perfectly aligned 3×3 grid "
            "layout on a pure solid white (#FFFFFF) background. Each icon is the "
            "same size, evenly spaced with equal gutters between them. Each cell "
            "has equal width and height. No overlap between icons. No borders or "
            "dividers, just white space separating them. The 9 icons depict "
            "different variations of: "
        ),
        "suffix": (
            ". Flat design, modern UI icon style, consistent visual weight across "
            "all 9 icons, same stroke width, same level of detail. Each icon is "
            "distinct but belongs to the same visual family."
        ),
        "aspect_ratio": "1:1",
        "image_size": "2K",
        "_layout": "grid",
        "_grid": "3x3",
    },
    "icon-set-6": {
        # 3×2 grid: six icons, landscape orientation
        "prefix": (
            "A sprite sheet of exactly 6 icons in a perfectly aligned 3×2 grid "
            "(3 columns, 2 rows) on a pure solid white (#FFFFFF) background. "
            "Each icon is the same size, evenly spaced with equal gutters. "
            "No overlap, no borders, just white space separating them. "
            "The 6 icons depict different variations of: "
        ),
        "suffix": (
            ". Flat design, modern UI icon style, consistent visual weight, "
            "same stroke width, same level of detail across all 6 icons."
        ),
        "aspect_ratio": "3:2",
        "image_size": "2K",
        "_layout": "grid",
        "_grid": "3x2",
    },
    "icon-set-4": {
        # 2×2 grid: four icons
        "prefix": (
            "A sprite sheet of exactly 4 icons in a perfectly aligned 2×2 grid "
            "on a pure solid white (#FFFFFF) background. Each icon is the same "
            "size, evenly spaced with generous gutters between them. No overlap, "
            "no borders. The 4 icons depict different variations of: "
        ),
        "suffix": (
            ". Flat design, modern UI icon style, consistent visual weight, belonging "
            "to the same icon family."
        ),
        "aspect_ratio": "1:1",
        "image_size": "2K",
        "_layout": "grid",
        "_grid": "2x2",
    },
    "icon-variants": {
        # 2×2 grid: same icon in 4 visual styles
        "prefix": (
            "A 2×2 grid comparison sheet showing exactly 4 versions of the SAME icon "
            "in 4 different visual styles, on a pure solid white (#FFFFFF) background. "
            "Each quadrant shows the same subject but in a different rendering style: "
            "(top-left) flat/minimal, (top-right) outlined/line-art, "
            "(bottom-left) filled/solid, (bottom-right) 3D/skeuomorphic. "
            "The icon subject is: "
        ),
        "suffix": (
            ". Equal spacing between quadrants, no overlapping, each icon centered "
            "within its quadrant. Same canvas proportion for each."
        ),
        "aspect_ratio": "1:1",
        "image_size": "2K",
        "_layout": "grid",
        "_grid": "2x2",
    },
}

# Unified template registry
ALL_TEMPLATES = {**ECOMMERCE_TEMPLATES, **ICON_TEMPLATES}


def build_prompt(user_prompt: str, template: str) -> str:
    """Build enhanced prompt by combining user description with template prefix/suffix."""
    if template not in ALL_TEMPLATES:
        return user_prompt

    tpl = ALL_TEMPLATES[template]
    return f"{tpl['prefix']}{user_prompt}{tpl['suffix']}"


def main():
    parser = argparse.ArgumentParser(
        description="Generate product images and icon sets via Nano Banana API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
E-commerce Templates:
  hero         — Product hero shot (1:1, white background, studio lighting)
  banner       — Promotional banner (16:9, vibrant marketing layout)
  detail       — Close-up detail shot (3:4, macro product photography)
  lifestyle    — Lifestyle scene (4:3, aspirational natural setting)
  grid         — Four-panel showcase (1:1, detail page grid visual)
  social       — Social media post (4:5, Instagram-ready visual)

Icon Templates (extraction-optimized):
  icon         — Single icon, centered, 80% canvas fill (1:1, 1K)
  icon-set     — 3×3 grid of 9 related icons (1:1, 2K)
  icon-set-6   — 3×2 grid of 6 related icons (3:2, 2K)
  icon-set-4   — 2×2 grid of 4 related icons (1:1, 2K)
  icon-variants— 2×2 grid of same icon in 4 visual styles (1:1, 2K)

Examples:
  %(prog)s "luxury leather handbag" --template hero
  %(prog)s "settings gear" --template icon
  %(prog)s "e-commerce actions: cart, heart, share, search, filter, sort" --template icon-set-6
  %(prog)s "cloud computing" --template icon-variants
  %(prog)s "organic skincare set" --template banner --size 4K --model nano-banana-pro
        """,
    )

    parser.add_argument("prompt", help="Product description or generation prompt")
    parser.add_argument(
        "-t", "--template",
        choices=list(ALL_TEMPLATES.keys()),
        default=None,
        help="Template (auto-sets ratio/size/prompt). See full list above.",
    )
    parser.add_argument(
        "-m", "--model",
        choices=list(MODELS.keys()) + list(MODEL_ALIASES.keys()),
        default="nano-banana-2",
        help="Model to use (default: nano-banana-2 = Gemini 3.1 Flash Image)",
    )
    parser.add_argument(
        "-r", "--ratio",
        choices=VALID_ASPECT_RATIOS,
        default=None,
        help="Aspect ratio (overrides template default)",
    )
    parser.add_argument(
        "-s", "--size",
        choices=VALID_IMAGE_SIZES,
        default=None,
        help="Image resolution (overrides template default)",
    )
    parser.add_argument(
        "-f", "--format",
        choices=["png", "jpeg", "webp"],
        default="png",
        help="Output format (default: png)",
    )
    parser.add_argument(
        "-o", "--output",
        default=".",
        help="Output directory (default: current directory)",
    )
    parser.add_argument(
        "-n", "--name",
        default=None,
        help="Output filename (without extension)",
    )
    parser.add_argument(
        "--ref-image",
        action="append",
        default=None,
        help="Reference image file path (can specify multiple times, max 8)",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Use prompt as-is without template enhancement",
    )

    args = parser.parse_args()

    # Resolve template defaults
    template = args.template
    if template and template in ALL_TEMPLATES:
        tpl = ALL_TEMPLATES[template]
        aspect_ratio = args.ratio or tpl["aspect_ratio"]
        image_size = args.size or tpl["image_size"]
        prompt = args.prompt if args.raw else build_prompt(args.prompt, template)
    else:
        aspect_ratio = args.ratio or "1:1"
        image_size = args.size or "1K"
        prompt = args.prompt

    # Print grid hint for icon templates (helps Agent chain to icon-extract)
    grid_hint = ALL_TEMPLATES.get(template, {}).get("_grid") if template else None

    print(f"Model: {args.model}")
    print(f"Template: {template or 'none'}")
    if grid_hint:
        print(f"Layout: {grid_hint} grid (use icon-extract --layout grid-{grid_hint} to split)")
    print(f"Aspect ratio: {aspect_ratio}")
    print(f"Resolution: {image_size}")
    print(f"Prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print()

    saved = generate_image(
        prompt=prompt,
        model=args.model,
        aspect_ratio=aspect_ratio,
        image_size=image_size,
        output_format=args.format,
        image_files=args.ref_image,
        output_dir=args.output,
        output_name=args.name,
    )

    if saved:
        print(f"\n✓ Generated {len(saved)} image(s)")
        for path in saved:
            print(f"  → {path}")
    else:
        print("\n✗ No images were saved.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
