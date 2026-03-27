#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["rembg[cpu]", "Pillow", "numpy"]
# ///
"""
Icon Extraction Pipeline — Detect, crop, and export individual icons from a composite image.

Pipeline:
  1. Background removal via rembg (BiRefNet model for SOTA edge quality)
  2. Icon detection — dual strategy:
     a. Grid mode (--layout grid-NxM): deterministic equal-cell splitting for sprite sheets
     b. Auto mode (default): alpha-channel component analysis + proximity merge
  3. Per-cell content refinement (tighten bbox to actual opaque pixels)
  4. Per-icon smart cropping with configurable padding and square normalization
  5. Individual RGBA PNG output + JSON manifest

Usage:
  # Basic — extract icons from a generated composite
  python icon_extract.py sheet.png -o ./icons/

  # Keep background removal intermediate (for debugging)
  python icon_extract.py sheet.png -o ./icons/ --keep-intermediate

  # Custom padding and minimum icon size
  python icon_extract.py sheet.png --padding 0.15 --min-size 32

  # Grid-based splitting (for template-generated sprite sheets)
  python icon_extract.py sprite.png --layout grid-3x3 -o ./icons/

  # Skip background removal (input already has transparent bg)
  python icon_extract.py transparent_sheet.png --skip-bg-removal
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# BiRefNet delivers SOTA edge quality for icons with sharp geometric boundaries
DEFAULT_REMBG_MODEL = "birefnet-general-lite"  # ~200MB, fast, high quality
FALLBACK_REMBG_MODEL = "isnet-general-use"     # ~175MB, fallback if BiRefNet unavailable

DEFAULT_PADDING_RATIO = 0.10       # 10% padding around each icon
DEFAULT_MIN_ICON_SIZE = 24         # Minimum bounding box side (px) to consider as icon
DEFAULT_MERGE_DISTANCE_RATIO = 0.05  # Merge components within 5% of image diagonal
DEFAULT_OUTPUT_SIZE = 512          # Default export size (square)


# ---------------------------------------------------------------------------
# Data Structures
# ---------------------------------------------------------------------------

@dataclass
class BBox:
    """Axis-aligned bounding box."""
    x_min: int
    y_min: int
    x_max: int
    y_max: int

    @property
    def width(self) -> int:
        return self.x_max - self.x_min

    @property
    def height(self) -> int:
        return self.y_max - self.y_min

    @property
    def center(self) -> tuple[float, float]:
        return (self.x_min + self.x_max) / 2, (self.y_min + self.y_max) / 2

    @property
    def area(self) -> int:
        return self.width * self.height

    def distance_to(self, other: "BBox") -> float:
        """Minimum distance between two bounding boxes (0 if overlapping)."""
        dx = max(0, max(self.x_min - other.x_max, other.x_min - self.x_max))
        dy = max(0, max(self.y_min - other.y_max, other.y_min - self.y_max))
        return (dx ** 2 + dy ** 2) ** 0.5

    def merge(self, other: "BBox") -> "BBox":
        """Return union bounding box."""
        return BBox(
            min(self.x_min, other.x_min),
            min(self.y_min, other.y_min),
            max(self.x_max, other.x_max),
            max(self.y_max, other.y_max),
        )


@dataclass
class DetectedIcon:
    """A detected icon with its bounding box and metadata."""
    index: int
    bbox: BBox
    pixel_count: int  # Number of non-transparent pixels

    @property
    def density(self) -> float:
        """Ratio of opaque pixels to bounding box area. Higher = more filled in."""
        return self.pixel_count / max(self.bbox.area, 1)


# ---------------------------------------------------------------------------
# Step 1: Background Removal
# ---------------------------------------------------------------------------

def remove_background(input_path: str, model: str = DEFAULT_REMBG_MODEL) -> "Image.Image":
    """Remove background using rembg, returning RGBA image with transparent bg."""
    from PIL import Image

    try:
        from rembg import remove, new_session
    except ImportError:
        print("Error: rembg not installed. Install via: pip install 'rembg[cpu]'", file=sys.stderr)
        print("  Or run with: uv run icon_extract.py <args>", file=sys.stderr)
        sys.exit(1)

    img = Image.open(input_path).convert("RGBA")

    # Try preferred model, fallback if unavailable
    try:
        session = new_session(model)
        print(f"  Model: {model}")
    except Exception:
        print(f"  Warning: Model '{model}' unavailable, falling back to '{FALLBACK_REMBG_MODEL}'", file=sys.stderr)
        session = new_session(FALLBACK_REMBG_MODEL)
        print(f"  Model: {FALLBACK_REMBG_MODEL}")

    t0 = time.monotonic()
    result = remove(img, session=session, alpha_matting=True)
    elapsed = time.monotonic() - t0
    print(f"  Background removed in {elapsed:.1f}s")
    return result


# ---------------------------------------------------------------------------
# Step 2: Connected Component Analysis (stdlib + numpy, no OpenCV)
# ---------------------------------------------------------------------------

def _flood_fill_labels(alpha: "np.ndarray", threshold: int = 10) -> "np.ndarray":
    """
    Label connected components in a binary alpha mask.

    Uses iterative BFS flood fill — no OpenCV dependency.
    Returns label matrix where 0 = background, 1..N = component IDs.
    """
    import numpy as np

    h, w = alpha.shape
    binary = (alpha > threshold).astype(np.uint8)
    labels = np.zeros((h, w), dtype=np.int32)
    current_label = 0

    # BFS flood fill with 4-connectivity; cap component size to prevent memory exhaustion
    max_component_pixels = h * w // 2  # No single icon should exceed half the image
    for y in range(h):
        for x in range(w):
            if binary[y, x] == 1 and labels[y, x] == 0:
                current_label += 1
                queue = [(y, x)]
                labels[y, x] = current_label
                head = 0
                while head < len(queue):
                    if len(queue) > max_component_pixels:
                        break  # Safety: skip pathologically large components
                    cy, cx = queue[head]
                    head += 1
                    for ny, nx in ((cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)):
                        if 0 <= ny < h and 0 <= nx < w and binary[ny, nx] == 1 and labels[ny, nx] == 0:
                            labels[ny, nx] = current_label
                            queue.append((ny, nx))

    return labels


def find_components(rgba_image: "Image.Image", min_size: int = DEFAULT_MIN_ICON_SIZE) -> list[BBox]:
    """Find bounding boxes of all non-transparent connected components."""
    import numpy as np

    alpha = np.array(rgba_image.split()[3])  # Extract alpha channel
    labels = _flood_fill_labels(alpha)

    n_labels = labels.max()
    if n_labels == 0:
        return []

    bboxes = []
    for label_id in range(1, n_labels + 1):
        ys, xs = np.where(labels == label_id)
        if len(ys) == 0:
            continue

        bbox = BBox(int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))

        # Filter out noise — too small to be an icon
        if bbox.width < min_size or bbox.height < min_size:
            continue

        bboxes.append(bbox)

    return bboxes


# ---------------------------------------------------------------------------
# Step 3a: Grid-Based Splitting (deterministic, for template-generated sheets)
# ---------------------------------------------------------------------------

def split_by_grid(
    rgba_image: "Image.Image",
    cols: int,
    rows: int,
    min_size: int = DEFAULT_MIN_ICON_SIZE,
) -> list[BBox]:
    """
    Split image into a cols × rows grid multiplied and refine each cell.

    For each cell, scan alpha channel to find the actual content bounding box
    within that cell. Discard empty cells. This is far more reliable than
    component analysis for template-generated sprite sheets.
    """
    import numpy as np

    img_w, img_h = rgba_image.size
    alpha = np.array(rgba_image.split()[3])

    cell_w = img_w / cols
    cell_h = img_h / rows

    bboxes = []
    for row in range(rows):
        for col in range(cols):
            # Cell boundaries
            cx0 = int(col * cell_w)
            cy0 = int(row * cell_h)
            cx1 = int((col + 1) * cell_w)
            cy1 = int((row + 1) * cell_h)

            # Extract alpha for this cell
            cell_alpha = alpha[cy0:cy1, cx0:cx1]

            # Find actual content within cell (refine to tight bbox)
            opaque = np.where(cell_alpha > 10)
            if len(opaque[0]) == 0:
                continue  # Empty cell

            # Tight bbox within cell, then convert to image coordinates
            local_y_min, local_y_max = int(opaque[0].min()), int(opaque[0].max())
            local_x_min, local_x_max = int(opaque[1].min()), int(opaque[1].max())

            bbox = BBox(
                cx0 + local_x_min,
                cy0 + local_y_min,
                cx0 + local_x_max,
                cy0 + local_y_max,
            )

            # Filter noise
            if bbox.width < min_size or bbox.height < min_size:
                continue

            bboxes.append(bbox)

    return bboxes


def parse_layout(layout: str) -> tuple[str, int, int]:
    """
    Parse --layout argument.

    Returns (mode, cols, rows):
      'auto' → ('auto', 0, 0)
      'grid-3x3' → ('grid', 3, 3)
      'grid-2x2' → ('grid', 2, 2)
      'grid-3x2' → ('grid', 3, 2)
    """
    if layout == "auto":
        return ("auto", 0, 0)

    if layout.startswith("grid-"):
        spec = layout[5:]  # e.g., '3x3'
        parts = spec.lower().split("x")
        if len(parts) == 2:
            try:
                cols, rows = int(parts[0]), int(parts[1])
                if cols > 0 and rows > 0:
                    if cols > 20 or rows > 20:
                        print(f"Error: Grid too large ({cols}×{rows}). Maximum 20×20.", file=sys.stderr)
                        sys.exit(1)
                    return ("grid", cols, rows)
            except ValueError:
                pass

    print(f"Error: Invalid layout '{layout}'. Use 'auto' or 'grid-CxR' (e.g., grid-3x3)", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Step 3b: Proximity-Based Merging (for auto mode)
# ---------------------------------------------------------------------------

def merge_nearby_components(
    bboxes: list[BBox],
    image_size: tuple[int, int],
    distance_ratio: float = DEFAULT_MERGE_DISTANCE_RATIO,
) -> list[BBox]:
    """
    Merge bounding boxes that are close together.

    Multi-part icons (e.g., an icon with a separate badge/text) should be
    treated as a single unit. We merge boxes whose gap is within
    `distance_ratio` of the image diagonal.
    """
    if len(bboxes) <= 1:
        return bboxes

    diagonal = (image_size[0] ** 2 + image_size[1] ** 2) ** 0.5
    merge_threshold = diagonal * distance_ratio

    # Union-Find for merging
    parent = list(range(len(bboxes)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]  # Path compression
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    # Merge boxes within threshold distance
    for i in range(len(bboxes)):
        for j in range(i + 1, len(bboxes)):
            if bboxes[i].distance_to(bboxes[j]) < merge_threshold:
                union(i, j)

    # Group by root and merge each group
    from collections import defaultdict
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(len(bboxes)):
        groups[find(i)].append(i)

    merged = []
    for indices in groups.values():
        combined = bboxes[indices[0]]
        for idx in indices[1:]:
            combined = combined.merge(bboxes[idx])
        merged.append(combined)

    return merged


# ---------------------------------------------------------------------------
# Step 4: Smart Cropping with Padding and Square Normalization
# ---------------------------------------------------------------------------

def crop_icon(
    rgba_image: "Image.Image",
    bbox: BBox,
    padding_ratio: float = DEFAULT_PADDING_RATIO,
    output_size: Optional[int] = DEFAULT_OUTPUT_SIZE,
    square: bool = True,
) -> "Image.Image":
    """
    Crop a single icon from the composite image with smart padding.

    - Expands bounding box by `padding_ratio` on each side
    - Optionally normalizes to square (centered)
    - Resizes to `output_size` if specified
    - Returns RGBA image with transparent background
    """
    from PIL import Image

    img_w, img_h = rgba_image.size

    # Compute padded region
    pad_x = int(bbox.width * padding_ratio)
    pad_y = int(bbox.height * padding_ratio)

    x_min = max(0, bbox.x_min - pad_x)
    y_min = max(0, bbox.y_min - pad_y)
    x_max = min(img_w, bbox.x_max + pad_x)
    y_max = min(img_h, bbox.y_max + pad_y)

    if square:
        # Expand to square centered on the icon's center
        cx, cy = bbox.center
        crop_w = x_max - x_min
        crop_h = y_max - y_min
        side = max(crop_w, crop_h)

        # Re-center
        x_min = max(0, int(cx - side / 2))
        y_min = max(0, int(cy - side / 2))
        x_max = min(img_w, x_min + side)
        y_max = min(img_h, y_min + side)

        # Adjust if we hit image boundary — shift to fit
        if x_max - x_min < side:
            x_min = max(0, x_max - side)
        if y_max - y_min < side:
            y_min = max(0, y_max - side)

    # Crop from source
    cropped = rgba_image.crop((x_min, y_min, x_max, y_max))

    # If crop isn't perfectly square (edge case: icon near image boundary),
    # paste onto a transparent square canvas
    if square:
        actual_w, actual_h = cropped.size
        target_side = max(actual_w, actual_h)
        if actual_w != actual_h:
            canvas = Image.new("RGBA", (target_side, target_side), (0, 0, 0, 0))
            paste_x = (target_side - actual_w) // 2
            paste_y = (target_side - actual_h) // 2
            canvas.paste(cropped, (paste_x, paste_y))
            cropped = canvas

    # Resize to target output size
    if output_size and cropped.size != (output_size, output_size):
        cropped = cropped.resize((output_size, output_size), Image.LANCZOS)

    return cropped


# ---------------------------------------------------------------------------
# Step 5: Full Pipeline
# ---------------------------------------------------------------------------

def extract_icons(
    input_path: str,
    *,
    output_dir: str = ".",
    output_prefix: str = "icon",
    rembg_model: str = DEFAULT_REMBG_MODEL,
    skip_bg_removal: bool = False,
    layout: str = "auto",
    padding_ratio: float = DEFAULT_PADDING_RATIO,
    min_icon_size: int = DEFAULT_MIN_ICON_SIZE,
    merge_distance_ratio: float = DEFAULT_MERGE_DISTANCE_RATIO,
    output_size: Optional[int] = DEFAULT_OUTPUT_SIZE,
    square: bool = True,
    keep_intermediate: bool = False,
) -> list[dict]:
    """
    Full icon extraction pipeline.

    layout: 'auto' for component analysis, 'grid-CxR' for deterministic grid split.

    Returns list of dicts with icon metadata:
      [{"path": str, "index": int, "bbox": {...}, "center": (x, y), "size": (w, h)}]
    """
    input_p = Path(input_path)
    if not input_p.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)
    print(f"Icon Extraction Pipeline")
    print(f"  Input: {input_path}")
    print(f"  Output: {output_dir}/")

    from PIL import Image

    # --- Step 1: Background Removal ---
    print("\n[1/3] Background removal...")
    if skip_bg_removal:
        print("  Skipped (--skip-bg-removal)")
        rgba = Image.open(input_path).convert("RGBA")
    else:
        rgba = remove_background(input_path, model=rembg_model)

    if keep_intermediate:
        intermediate_path = os.path.join(output_dir, f"{input_p.stem}_transparent.png")
        rgba.save(intermediate_path)
        print(f"  Saved intermediate: {intermediate_path}")

    # --- Step 2: Icon Detection (dual strategy) ---
    mode, grid_cols, grid_rows = parse_layout(layout)

    if mode == "grid":
        print(f"\n[2/3] Grid splitting ({grid_cols}×{grid_rows})...")
        t0 = time.monotonic()
        detected_bboxes = split_by_grid(rgba, grid_cols, grid_rows, min_icon_size)
        elapsed = time.monotonic() - t0
        print(f"  Found {len(detected_bboxes)} icon(s) in {grid_cols}×{grid_rows} grid ({elapsed:.2f}s)")
        discarded = (grid_cols * grid_rows) - len(detected_bboxes)
        if discarded > 0:
            print(f"  ({discarded} empty cell(s) discarded)")
    else:
        print("\n[2/3] Auto-detecting icon regions...")
        t0 = time.monotonic()
        raw_bboxes = find_components(rgba, min_size=min_icon_size)
        elapsed = time.monotonic() - t0
        print(f"  Found {len(raw_bboxes)} raw component(s) in {elapsed:.2f}s")

        if not raw_bboxes:
            print("  Warning: No icons detected. Try --layout grid-NxM for structured sheets.", file=sys.stderr)
            return []

        # Merge nearby components
        detected_bboxes = merge_nearby_components(raw_bboxes, rgba.size, merge_distance_ratio)
        print(f"  {len(raw_bboxes)} → {len(detected_bboxes)} icon(s) after proximity merge")

    if not detected_bboxes:
        print("  Warning: No icons detected.", file=sys.stderr)
        return []

    # Sort by position: top-left to bottom-right (row-major)
    detected_bboxes.sort(key=lambda b: (b.y_min // (rgba.height // max(1, len(detected_bboxes))), b.x_min))

    # --- Step 3: Crop and Export ---
    print(f"\n[3/3] Cropping {len(detected_bboxes)} icon(s)...")
    results = []
    for i, bbox in enumerate(detected_bboxes):
        icon_img = crop_icon(rgba, bbox, padding_ratio, output_size, square)
        filename = f"{output_prefix}_{i + 1:03d}.png"
        filepath = os.path.join(output_dir, filename)
        icon_img.save(filepath, "PNG")

        cx, cy = bbox.center
        meta = {
            "path": filepath,
            "index": i + 1,
            "bbox": {
                "x_min": bbox.x_min, "y_min": bbox.y_min,
                "x_max": bbox.x_max, "y_max": bbox.y_max,
            },
            "center": {"x": round(cx, 1), "y": round(cy, 1)},
            "original_size": {"w": bbox.width, "h": bbox.height},
            "output_size": {"w": icon_img.width, "h": icon_img.height},
        }
        results.append(meta)
        print(f"  [{i + 1}] {filename}  center=({cx:.0f},{cy:.0f})  "
              f"size={bbox.width}×{bbox.height}  → {icon_img.width}×{icon_img.height}")

    # Write manifest
    manifest_path = os.path.join(output_dir, f"{output_prefix}_manifest.json")
    manifest = {
        "source": str(input_p.resolve()),
        "total_icons": len(results),
        "pipeline": {
            "layout": layout,
            "bg_model": "skipped" if skip_bg_removal else rembg_model,
            "padding_ratio": padding_ratio,
            "output_size": output_size,
            "square": square,
        },
        "icons": results,
    }
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Extracted {len(results)} icon(s)")
    print(f"  Manifest: {manifest_path}")
    return results


# ---------------------------------------------------------------------------
# App Icon Multi-Size Export (iOS + Android standard sizes)
# ---------------------------------------------------------------------------

# Standard app icon sizes for platform submission
APP_ICON_SIZES = {
    "ios": [
        (1024, "ios-appstore-1024"),    # App Store
        (180,  "ios-iphone-60@3x"),     # iPhone @3x
        (120,  "ios-iphone-60@2x"),     # iPhone @2x
        (167,  "ios-ipad-pro-83.5@2x"), # iPad Pro @2x
        (152,  "ios-ipad-76@2x"),       # iPad @2x
        (80,   "ios-spotlight-40@2x"),   # Spotlight @2x
        (120,  "ios-spotlight-40@3x"),   # Spotlight @3x
        (58,   "ios-settings-29@2x"),    # Settings @2x
        (87,   "ios-settings-29@3x"),    # Settings @3x
        (40,   "ios-notification-20@2x"),# Notification @2x
        (60,   "ios-notification-20@3x"),# Notification @3x
    ],
    "android": [
        (512,  "android-playstore-512"), # Play Store
        (192,  "android-xxxhdpi-192"),   # xxxhdpi
        (144,  "android-xxhdpi-144"),    # xxhdpi
        (96,   "android-xhdpi-96"),      # xhdpi
        (72,   "android-hdpi-72"),       # hdpi
        (48,   "android-mdpi-48"),       # mdpi
    ],
    "web": [
        (512, "web-512"),      # PWA manifest
        (192, "web-192"),      # PWA manifest
        (180, "apple-touch"),  # Apple touch icon
        (32,  "favicon-32"),   # Favicon
        (16,  "favicon-16"),   # Favicon
    ],
}


def export_app_icon_sizes(
    icon_image: "Image.Image",
    output_dir: str,
    prefix: str = "app-icon",
    platforms: Optional[list] = None,
) -> list[dict]:
    """Export a single icon image to all standard app icon sizes.

    Args:
        icon_image: Source RGBA image (should be square, ideally 1024px+)
        output_dir: Output directory
        prefix: Filename prefix
        platforms: List of platforms to export for (default: all)

    Returns list of exported file metadata.
    """
    from PIL import Image

    if platforms is None:
        platforms = list(APP_ICON_SIZES.keys())

    results = []
    platform_dir = os.path.join(output_dir, f"{prefix}-sizes")
    os.makedirs(platform_dir, exist_ok=True)

    for platform in platforms:
        sizes = APP_ICON_SIZES.get(platform, [])
        for size, name in sizes:
            resized = icon_image.resize((size, size), Image.LANCZOS)
            filename = f"{prefix}_{name}.png"
            filepath = os.path.join(platform_dir, filename)
            resized.save(filepath, "PNG")
            results.append({
                "path": filepath,
                "platform": platform,
                "size": size,
                "name": name,
            })

    if results:
        manifest_path = os.path.join(platform_dir, f"{prefix}_sizes_manifest.json")
        with open(manifest_path, "w") as f:
            json.dump({"total": len(results), "icons": results}, f, indent=2)
        print(f"\n  App icon sizes exported: {len(results)} files → {platform_dir}/")
        print(f"  Manifest: {manifest_path}")

    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Extract individual icons from a composite image with transparent background",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Detection strategies (--layout):
  auto         — Component analysis + proximity merge (default, for unstructured images)
  grid-CxR     — Deterministic grid split (e.g., grid-3x3, grid-2x2, grid-3x2)
                 Best for template-generated sprite sheets

Pipeline: bg-removal → detection → smart crop → RGBA PNG + manifest

Examples:
  %(prog)s icon_sheet.png -o ./icons/
  %(prog)s sprite.png --layout grid-3x3 -o ./icons/
  %(prog)s app_icons.png --layout grid-2x2 --padding 0.15 --output-size 256
  %(prog)s transparent.png --skip-bg-removal --layout grid-3x2
  %(prog)s generated.png --model birefnet-general --keep-intermediate
        """,
    )

    parser.add_argument("image", help="Input image (composite with multiple icons)")
    parser.add_argument(
        "-o", "--output",
        default=".",
        help="Output directory for extracted icons (default: current dir)",
    )
    parser.add_argument(
        "--prefix",
        default="icon",
        help="Output filename prefix (default: icon → icon_001.png, icon_002.png, ...)",
    )
    parser.add_argument(
        "-l", "--layout",
        default="auto",
        help="Detection strategy: 'auto' (component analysis) or 'grid-CxR' (e.g., grid-3x3)",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_REMBG_MODEL,
        help=f"rembg model for background removal (default: {DEFAULT_REMBG_MODEL})",
    )
    parser.add_argument(
        "--skip-bg-removal",
        action="store_true",
        help="Skip background removal (input already has transparent background)",
    )
    parser.add_argument(
        "--padding",
        type=float,
        default=DEFAULT_PADDING_RATIO,
        help=f"Padding ratio around each icon (default: {DEFAULT_PADDING_RATIO})",
    )
    parser.add_argument(
        "--min-size",
        type=int,
        default=DEFAULT_MIN_ICON_SIZE,
        help=f"Minimum icon bounding box side in pixels (default: {DEFAULT_MIN_ICON_SIZE})",
    )
    parser.add_argument(
        "--merge-distance",
        type=float,
        default=DEFAULT_MERGE_DISTANCE_RATIO,
        help=f"Merge threshold as ratio of image diagonal (default: {DEFAULT_MERGE_DISTANCE_RATIO})",
    )
    parser.add_argument(
        "--output-size",
        type=int,
        default=DEFAULT_OUTPUT_SIZE,
        help=f"Output icon size in pixels, square (default: {DEFAULT_OUTPUT_SIZE}). Use 0 to keep original size.",
    )
    parser.add_argument(
        "--no-square",
        action="store_true",
        help="Don't normalize to square (keep original aspect ratio)",
    )
    parser.add_argument(
        "--keep-intermediate",
        action="store_true",
        help="Save the background-removed intermediate image",
    )
    parser.add_argument(
        "--app-icon-sizes",
        nargs="*",
        choices=["ios", "android", "web", "all"],
        default=None,
        metavar="PLATFORM",
        help="Export each icon to standard app icon sizes (ios/android/web/all)",
    )
    parser.add_argument(
        "--bg-only",
        action="store_true",
        help="Background removal only — output transparent RGBA PNG, skip detection/cropping",
    )

    args = parser.parse_args()

    # --- bg-only mode: pure background removal, no detection/cropping ---
    if args.bg_only:
        from PIL import Image
        input_p = Path(args.image)
        if not input_p.exists():
            print(f"Error: File not found: {args.image}", file=sys.stderr)
            sys.exit(1)
        os.makedirs(args.output, exist_ok=True)
        print(f"Background Removal (transparent PNG)")
        print(f"  Input: {args.image}")
        rgba = remove_background(args.image, model=args.model)
        out_path = os.path.join(args.output, f"{input_p.stem}_transparent.png")
        rgba.save(out_path, "PNG")
        print(f"\n✓ Saved: {out_path}  ({rgba.width}×{rgba.height} RGBA)")
        sys.exit(0)

    results = extract_icons(
        input_path=args.image,
        output_dir=args.output,
        output_prefix=args.prefix,
        rembg_model=args.model,
        skip_bg_removal=args.skip_bg_removal,
        layout=args.layout,
        padding_ratio=args.padding,
        min_icon_size=args.min_size,
        merge_distance_ratio=args.merge_distance,
        output_size=args.output_size if args.output_size > 0 else None,
        square=not args.no_square,
        keep_intermediate=args.keep_intermediate,
    )

    # App icon multi-size export
    if args.app_icon_sizes and results:
        from PIL import Image

        platforms = list(APP_ICON_SIZES.keys()) if "all" in args.app_icon_sizes else args.app_icon_sizes
        for meta in results:
            icon_img = Image.open(meta["path"]).convert("RGBA")
            export_app_icon_sizes(
                icon_img,
                args.output,
                prefix=Path(meta["path"]).stem,
                platforms=platforms,
            )


if __name__ == "__main__":
    main()
