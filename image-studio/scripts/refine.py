#!/usr/bin/env python3
"""
Image refinement and editing via Nano Banana API.

Supports:
- Background replacement / removal
- Object swap (replace specific objects in scene)
- Style transfer (change artistic style while preserving content)
- Quality enhancement (upscale, sharpen, denoise)
- Color correction (adjust lighting, tone, white balance)
- Semantic editing (modify specific elements via natural language)
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from nanobanana_api import generate_image, MODELS, MODEL_ALIASES, VALID_ASPECT_RATIOS, VALID_IMAGE_SIZES


# ---------------------------------------------------------------------------
# Refinement Templates — Prompt engineering for common editing tasks
# ---------------------------------------------------------------------------

REFINE_TEMPLATES = {
    "bg-replace": {
        "prefix": "Replace the background with ",
        "suffix": ". Keep the main subject perfectly intact, maintain original lighting "
                  "direction and shadow consistency.",
        "description": "Replace background while preserving the subject",
    },
    "bg-white": {
        "prompt": "Place the product on a pure white background (#FFFFFF). "
                  "Professional studio lighting, clean shadows, e-commerce ready. "
                  "Keep the product exactly as-is, only change the background.",
        "description": "Convert to white background (e-commerce standard)",
    },
    "bg-remove": {
        "prompt": "Remove the background completely and replace with solid bright green (#00FF00) "
                  "chromakey background. Preserve the subject with clean edges, no halo artifacts. "
                  "Keep all details of the main subject intact.",
        "description": "Remove background (chromakey green for post-processing)",
    },
    "enhance": {
        "prompt": "Enhance this image: improve sharpness, clarity, and overall quality. "
                  "Correct any color cast, boost contrast slightly, reduce noise. "
                  "Maintain the original composition and content exactly as-is. "
                  "Professional retouching quality.",
        "description": "General quality enhancement (sharpness, color, noise reduction)",
    },
    "retouch": {
        "prompt": "Professional photo retouching: smooth skin naturally without losing texture, "
                  "remove blemishes and imperfections, even out skin tone, brighten eyes slightly, "
                  "enhance but keep looking natural and authentic. Do not alter facial features.",
        "description": "Portrait retouching (natural skin smoothing, blemish removal)",
    },
    "object-swap": {
        "prefix": "In this image, replace ",
        "suffix": ". Maintain the same lighting, perspective, shadows, and overall scene "
                  "composition. The replacement should look natural and seamless.",
        "description": "Replace a specific object in the scene",
    },
    "style-transfer": {
        "prefix": "Transform this image into ",
        "suffix": " style. Keep the same composition, subjects, and spatial layout "
                  "but completely change the artistic rendering.",
        "description": "Apply artistic style while keeping composition",
    },
    "color-grade": {
        "prefix": "Apply professional color grading to this image: ",
        "suffix": ". Maintain the original content and composition, only adjust colors, "
                  "tones, and mood through color grading techniques.",
        "description": "Professional color grading and tone adjustment",
    },
    "extend": {
        "prefix": "Extend this image: ",
        "suffix": ". Seamlessly generate new content that matches the existing image's "
                  "style, lighting, and perspective. The extension should be visually coherent.",
        "description": "Extend/outpaint the image canvas",
    },
}


def build_refine_prompt(user_prompt: str, template: str) -> str:
    """Build refinement prompt from template and user input."""
    if template not in REFINE_TEMPLATES:
        return user_prompt

    tpl = REFINE_TEMPLATES[template]

    # Some templates have a fixed prompt
    if "prompt" in tpl:
        if user_prompt and user_prompt.strip():
            # User adds extra instructions
            return f"{tpl['prompt']} Additional: {user_prompt}"
        return tpl["prompt"]

    # Templates with prefix/suffix wrap the user's description
    prefix = tpl.get("prefix", "")
    suffix = tpl.get("suffix", "")
    return f"{prefix}{user_prompt}{suffix}"


def main():
    parser = argparse.ArgumentParser(
        description="Refine and edit images via Nano Banana API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Templates:
  bg-replace    — Replace background (specify new background in prompt)
  bg-white      — Convert to white e-commerce background
  bg-remove     — Remove background (chromakey green)
  enhance       — General quality enhancement
  retouch       — Portrait retouching (natural skin smoothing)
  object-swap   — Replace a specific object (describe what to replace in prompt)
  style-transfer— Apply artistic style (describe target style in prompt)
  color-grade   — Professional color grading (describe mood in prompt)
  extend        — Extend/outpaint the image canvas

Examples:
  %(prog)s photo.jpg --template bg-white
  %(prog)s product.png --template bg-replace "modern kitchen counter with marble surface"
  %(prog)s portrait.jpg --template retouch
  %(prog)s scene.jpg --template object-swap "the red car with a blue sports car"
  %(prog)s photo.jpg --template style-transfer "watercolor painting"
  %(prog)s photo.jpg "make the lighting warmer and add a sunset glow"
        """,
    )

    parser.add_argument("image", help="Input image file path")
    parser.add_argument(
        "prompt",
        nargs="?",
        default="",
        help="Editing instruction or description (required for some templates)",
    )
    parser.add_argument(
        "-t", "--template",
        choices=list(REFINE_TEMPLATES.keys()),
        default=None,
        help="Refinement template (provides optimized prompt engineering)",
    )
    parser.add_argument(
        "-m", "--model",
        choices=list(MODELS.keys()) + list(MODEL_ALIASES.keys()),
        default="nano-banana-2",
        help="Model to use (default: nano-banana-2 = Gemini 3.1 Flash Image)",
    )
    parser.add_argument(
        "-r", "--ratio",
        choices=VALID_ASPECT_RATIOS + ["auto"],
        default="auto",
        help="Aspect ratio (default: auto = preserve original)",
    )
    parser.add_argument(
        "-s", "--size",
        choices=VALID_IMAGE_SIZES,
        default="2K",
        help="Output resolution (default: 2K)",
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
        "--extra-ref",
        action="append",
        default=None,
        help="Additional reference image (e.g., style reference, max 7 additional)",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Use prompt as-is without template enhancement",
    )

    args = parser.parse_args()

    # Validate input image exists
    if not os.path.exists(args.image):
        print(f"Error: Input image not found: {args.image}", file=sys.stderr)
        sys.exit(1)

    # Build prompt
    template = args.template
    if template and not args.raw:
        # Check if template requires user prompt
        tpl = REFINE_TEMPLATES.get(template, {})
        needs_prompt = "prompt" not in tpl  # Templates without fixed prompt need user input
        if needs_prompt and not args.prompt.strip():
            print(f"Error: Template '{template}' requires a description.", file=sys.stderr)
            print(f"Description: {tpl.get('description', '')}", file=sys.stderr)
            sys.exit(1)
        prompt = build_refine_prompt(args.prompt, template)
    else:
        if not args.prompt.strip():
            print("Error: Provide an editing instruction or use a template.", file=sys.stderr)
            sys.exit(1)
        prompt = args.prompt

    # Collect reference images
    ref_images = [args.image]
    if args.extra_ref:
        ref_images.extend(args.extra_ref)

    if len(ref_images) > 8:
        print("Error: Maximum 8 reference images total (input + extra refs).", file=sys.stderr)
        sys.exit(1)

    print(f"Model: {args.model}")
    print(f"Template: {template or 'none'}")
    print(f"Input: {args.image}")
    print(f"Resolution: {args.size}")
    print(f"Prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
    print()

    saved = generate_image(
        prompt=prompt,
        model=args.model,
        aspect_ratio=args.ratio,
        image_size=args.size,
        output_format=args.format,
        image_files=ref_images,
        output_dir=args.output,
        output_name=args.name,
    )

    if saved:
        print(f"\n✓ Refined {len(saved)} image(s)")
        for path in saved:
            print(f"  → {path}")
    else:
        print("\n✗ No images were saved.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
