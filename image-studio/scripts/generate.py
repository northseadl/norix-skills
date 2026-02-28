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


def build_prompt(user_prompt: str, template: str) -> str:
    """Build enhanced prompt by combining user description with template prefix/suffix."""
    if template not in ECOMMERCE_TEMPLATES:
        return user_prompt

    tpl = ECOMMERCE_TEMPLATES[template]
    return f"{tpl['prefix']}{user_prompt}{tpl['suffix']}"


def main():
    parser = argparse.ArgumentParser(
        description="Generate e-commerce product images via Nano Banana API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Templates:
  hero      — Product hero shot (1:1, white background, studio lighting)
  banner    — Promotional banner (16:9, vibrant marketing layout)
  detail    — Close-up detail shot (3:4, macro product photography)
  lifestyle — Lifestyle scene (4:3, aspirational natural setting)
  grid      — Four-panel showcase (1:1, detail page grid visual)
  social    — Social media post (4:5, Instagram-ready visual)

Examples:
  %(prog)s "luxury leather handbag" --template hero
  %(prog)s "organic skincare set" --template banner --size 4K --model nano-banana-pro
  %(prog)s "running shoes" --template lifestyle --output ./images/shoes
  %(prog)s "custom prompt here" --ratio 16:9 --size 2K
        """,
    )

    parser.add_argument("prompt", help="Product description or generation prompt")
    parser.add_argument(
        "-t", "--template",
        choices=list(ECOMMERCE_TEMPLATES.keys()),
        default=None,
        help="E-commerce template (auto-sets ratio/size/prompt enhancement)",
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
    if template and template in ECOMMERCE_TEMPLATES:
        tpl = ECOMMERCE_TEMPLATES[template]
        aspect_ratio = args.ratio or tpl["aspect_ratio"]
        image_size = args.size or tpl["image_size"]
        prompt = args.prompt if args.raw else build_prompt(args.prompt, template)
    else:
        aspect_ratio = args.ratio or "1:1"
        image_size = args.size or "1K"
        prompt = args.prompt

    print(f"Model: {args.model}")
    print(f"Template: {template or 'none'}")
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
