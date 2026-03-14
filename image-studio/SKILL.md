---
name: image-studio
metadata:
  version: 0.1.3
description: 'AI image generation and editing: e-commerce templates (hero/banner/detail/lifestyle),

  image refinement (background replace/remove, enhance, retouch, style transfer),

  icon extraction (bg-removal + detect + smart crop with transparent output).

  '
---

# Nano Banana — AI Image Generation & Editing

> Unified CLI: `./nanobanana <module> [options]`
> Full API reference: `references/api_reference.md`

## First-Use Detection

Before executing any command, verify credentials:

### Path 1: Environment Variable (Agent preferred, zero setup)

If any of `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `NANOBANANA_API_KEY` is set, **no init needed** — the client resolves automatically.

### Path 2: Non-Interactive Init (Agent usable)

Ask user for their Google API key, then run:
```bash
./nanobanana auth init --api-key "<their-gemini-api-key>"
```
This verifies connectivity and persists credentials to `~/.nanobanana/credentials.json` (chmod 600).

### How to get an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create API key
3. Copy (the key typically starts with `AIza`)

After init succeeds, credentials auto-persist. No further user action needed.

## Available Models

| Gemini Model ID                    | Alias           | Max Res | Best For                    |
|------------------------------------|-----------------|---------|-----------------------------|
| `gemini-2.5-flash-image`           | Nano Banana     | 1024px  | Speed + efficiency          |
| **`gemini-3.1-flash-image-preview`**| **Nano Banana 2**| **2K**  | **Default. Speed + quality**|
| `gemini-3-pro-image-preview`       | Nano Banana Pro | 4K      | Studio quality, 4K, Thinking|

Shortcut aliases: `nano-banana-2` (default), `nano-banana-pro`, `nano-banana`, `flash`, `pro`, `fast`.

Users can override the model with `--model <name>`. Default is `nano-banana-2` (Gemini 3.1 Flash Image).

## Workflow 1: E-commerce Image Generation

```bash
./nanobanana generate "<product description>" [options]
```

### Templates

Templates auto-enhance prompts with professional photography directives:

| Template    | Ratio | Size | Use Case                               |
|-------------|-------|------|----------------------------------------|
| `hero`      | 1:1   | 2K   | Product hero shot on white background  |
| `banner`    | 16:9  | 2K   | Promotional marketing banner           |
| `detail`    | 3:4   | 2K   | Close-up material/texture shot         |
| `lifestyle` | 4:3   | 2K   | Product in aspirational scene          |
| `grid`      | 1:1   | 2K   | Four-panel detail page showcase        |
| `social`    | 4:5   | 1K   | Social media / Instagram post          |

#### Icon Templates (extraction-optimized)

Icon templates use the **surrounding prompt pattern** — the user's description is wrapped between
a layout-constraining prefix and a style-constraining suffix. This forces the model to produce
structured, grid-aligned output that the extraction pipeline can reliably split.

| Template       | Grid  | Ratio | Size | Use Case                              |
|----------------|-------|-------|------|---------------------------------------|
| `icon`         | 1×1   | 1:1   | 1K   | Single icon, centered, 80% fill       |
| `icon-set`     | 3×3   | 1:1   | 2K   | 9 related icons in uniform grid       |
| `icon-set-6`   | 3×2   | 3:2   | 2K   | 6 related icons in landscape grid     |
| `icon-set-4`   | 2×2   | 1:1   | 2K   | 4 related icons in grid               |
| `icon-variants`| 2×2   | 1:1   | 2K   | Same icon in 4 visual styles          |

### Examples

```bash
# Product hero shot with white studio background
./nanobanana generate "luxury leather handbag, brown Italian calfskin" --template hero

# Marketing banner for a campaign
./nanobanana generate "summer skincare collection" --template banner --model nano-banana-pro

# Lifestyle scene
./nanobanana generate "minimalist desk setup with mechanical keyboard" --template lifestyle

# Custom prompt with explicit parameters
./nanobanana generate "organic tea packaging in zen garden setting" --ratio 16:9 --size 2K

# With reference images (automatically switches to image-to-image)
./nanobanana generate "same style but in blue colorway" --ref-image product_red.jpg

# Save with specific name and directory
./nanobanana generate "wireless earbuds" --template hero -o ./output -n earbuds_hero

# --- Icon Templates ---
# Single icon: centered, white bg, 80% canvas fill
./nanobanana generate "settings gear" --template icon

# 9-icon set in 3×3 grid (then split with icon-extract)
./nanobanana generate "social media: like, comment, share, save, follow, message, search, notification, profile" --template icon-set

# 4-icon set in 2×2 grid
./nanobanana generate "e-commerce: cart, payment, delivery, return" --template icon-set-4

# Same icon in 4 styles (flat, line-art, filled, 3D)
./nanobanana generate "cloud computing" --template icon-variants
```

### Key Options

| Option          | Description                                           |
|-----------------|-------------------------------------------------------|
| `--template`    | E-commerce template (auto-sets ratio/size/prompt)     |
| `--model`       | Model override (default: `nano-banana-2`)             |
| `--ratio`       | Aspect ratio override                                  |
| `--size`        | Resolution override (`1K`/`2K`/`4K`)                  |
| `--format`      | Output format (`png`/`jpeg`/`webp`)                   |
| `--ref-image`   | Reference image file (repeatable, up to 14 for Gemini 3+)|
| `--raw`         | Use prompt as-is, skip template enhancement            |
| `-o`/`--output` | Output directory                                       |
| `-n`/`--name`   | Output filename (without extension)                    |

## Workflow 2: Image Refinement

```bash
./nanobanana refine <input-image> [prompt] [options]
```

### Templates

| Template         | Needs Prompt | Use Case                              |
|------------------|-------------|---------------------------------------|
| `bg-replace`     | ✓           | Replace background with specified scene |
| `bg-white`       | ✗           | White e-commerce background            |
| `bg-remove`      | ✗           | Chromakey green for compositing        |
| `enhance`        | ✗           | Quality boost (sharp, color, noise)    |
| `retouch`        | ✗           | Natural portrait retouching            |
| `object-swap`    | ✓           | Replace specific object in scene       |
| `style-transfer` | ✓           | Apply artistic style                   |
| `color-grade`    | ✓           | Professional color grading             |
| `extend`         | ✓           | Extend/outpaint canvas                 |

### Examples

```bash
# White background for e-commerce
./nanobanana refine product.jpg --template bg-white

# Replace background
./nanobanana refine product.jpg "modern kitchen counter with marble surface" --template bg-replace

# General quality enhancement
./nanobanana refine photo.jpg --template enhance --size 4K --model nano-banana-pro

# Portrait retouching
./nanobanana refine portrait.jpg --template retouch

# Object swap
./nanobanana refine room.jpg "the wooden table with a glass coffee table" --template object-swap

# Style transfer
./nanobanana refine photo.jpg "Japanese woodblock print" --template style-transfer

# Free-form editing without template
./nanobanana refine photo.jpg "make the lighting warmer and add golden hour glow"
```

## Workflow 3: Icon Extraction

```bash
./nanobanana icon-extract <input-image> [options]
```

Full pipeline: **background removal → detection (grid or auto) → smart crop → individual RGBA PNGs + manifest**.

### Detection Strategies (`--layout`)

| Strategy    | Syntax            | Best For                                        |
|-------------|-------------------|-------------------------------------------------|
| **auto**    | `--layout auto`   | Unstructured images, unknown layout (default)   |
| **grid**    | `--layout grid-CxR` | Template-generated sprite sheets (reliable!)  |

**Why grid mode is critical**: When using `icon-set` / `icon-set-4` / `icon-set-6` templates, the model
is prompted to produce a grid layout. Grid splitting (`--layout grid-3x3`) is deterministic and far more
reliable than component analysis — it divides the image into N×M equal cells, then refines each cell's
bounding box by scanning the alpha channel for actual content. Empty cells are discarded.

### Key Options

| Option              | Default              | Description                                              |
|---------------------|----------------------|----------------------------------------------------------|
| `-o` / `--output`   | `.`                  | Output directory                                         |
| `--prefix`          | `icon`               | Filename prefix (→ icon_001.png, icon_002.png, ...)      |
| `-l` / `--layout`   | `auto`               | Detection: `auto` or `grid-CxR` (e.g., `grid-3x3`)      |
| `--model`           | `birefnet-general-lite` | rembg model for bg removal                            |
| `--skip-bg-removal` | off                  | Skip bg removal (input already transparent)              |
| `--padding`         | `0.10`               | Padding ratio around each icon (0.10 = 10%)              |
| `--min-size`        | `24`                 | Minimum bounding box side (px) to qualify as icon        |
| `--merge-distance`  | `0.05`               | Merge threshold for auto mode (ratio of image diagonal)  |
| `--output-size`     | `512`                | Export size (square px). Use `0` to keep original size   |
| `--no-square`       | off                  | Keep original aspect ratio instead of squaring           |
| `--keep-intermediate` | off                | Save the background-removed intermediate image           |

### Examples

```bash
# Grid split — for template-generated sprite sheets (most reliable)
./nanobanana icon-extract sprite_3x3.png --layout grid-3x3 -o ./icons/
./nanobanana icon-extract quad.png --layout grid-2x2 --output-size 256

# Auto detect — for unstructured images
./nanobanana icon-extract icon_sheet.png -o ./icons/

# Skip bg removal (already transparent)
./nanobanana icon-extract transparent.png --skip-bg-removal --layout grid-3x2

# Debug: keep intermediate bg-removed image
./nanobanana icon-extract app_icons.png --model birefnet-general --keep-intermediate
```

### End-to-End Chaining: Generate → Extract

The most reliable icon workflow chains generation with extraction:

```bash
# Step 1: Generate 9-icon sprite sheet
./nanobanana generate "navigation: home, search, favorites, cart, profile, settings, notifications, messages, help" --template icon-set

# Step 2: Extract with matching grid
./nanobanana icon-extract generated_image.png --layout grid-3x3 -o ./icons/
```

The `generate` output prints a layout hint (e.g., `Layout: 3x3 grid`) — the Agent should
automatically chain to `icon-extract` with the matching `--layout grid-CxR`.

### Agent Decision Guide

The icon pipeline is a **default tool** — the Agent decides autonomously:

| Scenario | Agent Action |
|----------|-------------|
| "生成9个App图标" | `generate --template icon-set` → `icon-extract --layout grid-3x3` |
| "生成4个图标" | `generate --template icon-set-4` → `icon-extract --layout grid-2x2` |
| "生成单个图标" | `generate --template icon` (no extraction needed) |
| User provides icon sheet with known grid | `icon-extract --layout grid-CxR` directly |
| User provides unstructured image | `icon-extract` (auto mode) |
| "图标风格对比" | `generate --template icon-variants` → `icon-extract --layout grid-2x2` |

## Intent → Command Mapping

### E-commerce Generation

| User Intent                     | Command                                                         |
|---------------------------------|-----------------------------------------------------------------|
| "生成商品主图"                  | `generate "<描述>" --template hero`                             |
| "做一个促销 Banner"             | `generate "<描述>" --template banner`                           |
| "产品细节图"                    | `generate "<描述>" --template detail`                           |
| "生活场景图"                    | `generate "<描述>" --template lifestyle`                        |
| "详情页四宫格"                  | `generate "<描述>" --template grid`                             |
| "社交媒体图片"                  | `generate "<描述>" --template social`                           |
| "高清4K产品图"                  | `generate "<描述>" --template hero --size 4K --model nano-banana-pro` |
| "AI图片" (generic)              | `generate "<描述>"` (no template)                               |

### Icon Generation + Extraction

| User Intent                     | Command                                                         |
|---------------------------------|-----------------------------------------------------------------|
| "生成单个图标"                  | `generate "<描述>" --template icon`                             |
| "生成9个图标集"                 | `generate --template icon-set` → `icon-extract --layout grid-3x3` |
| "生成6个图标"                   | `generate --template icon-set-6` → `icon-extract --layout grid-3x2` |
| "生成4个图标"                   | `generate --template icon-set-4` → `icon-extract --layout grid-2x2` |
| "图标风格对比"                  | `generate --template icon-variants` → `icon-extract --layout grid-2x2` |
| "提取图标"                      | `icon-extract <img> -o ./icons/`                                |
| "切割图标/icon sheet"           | `icon-extract <img> --layout grid-NxM`                          |
| "去背景+裁切"                   | `icon-extract <img>`                                            |
| "小图标256px"                   | `icon-extract <img> --output-size 256`                          |
| "保持原比例"                    | `icon-extract <img> --no-square`                                |

### Image Refinement

| User Intent                     | Command                                                         |
|---------------------------------|-----------------------------------------------------------------|
| "换白色背景"                    | `refine <img> --template bg-white`                              |
| "换背景/抠图"                   | `refine <img> "<new bg>" --template bg-replace`                 |
| "去背景"                        | `refine <img> --template bg-remove`                             |
| "图片增强/精修"                 | `refine <img> --template enhance`                               |
| "人像修图"                      | `refine <img> --template retouch`                               |
| "替换物品"                      | `refine <img> "<swap>" --template object-swap`                  |
| "风格迁移"                      | `refine <img> "<style>" --template style-transfer`              |
| "调色"                          | `refine <img> "<mood>" --template color-grade`                  |
| "扩展画面"                      | `refine <img> "<direction>" --template extend`                  |

## Auth Management

| Command                                       | Action                             |
|-----------------------------------------------|-------------------------------------|
| `auth init --api-key <KEY>`                   | Store and verify API key            |
| `auth init --api-key <KEY> --no-verify`       | Store without verification          |
| `auth status`                                 | Show current auth configuration     |
| `auth clean`                                  | Remove stored credentials           |

## Error Recovery

| Situation                | Agent Action                                              |
|--------------------------|-----------------------------------------------------------|
| No API key               | Trigger First-Use Detection flow                          |
| 401 Invalid key          | `auth status`, guide to https://aistudio.google.com/apikey|
| 403 Permission denied    | Check API key restrictions / project settings             |
| 429 Rate limited         | Wait and retry                                            |
| File not found           | Verify path, suggest alternatives                         |
| File too large (>20MB)   | Suggest resizing before upload                            |
| IMAGE_SAFETY block       | Rephrase prompt, avoid safety-filtered content            |
| No image in response     | Check finishReason, may need prompt adjustment            |

## Structure

```
image-studio/
├── nanobanana             ← Unified CLI entry point (bash)
├── SKILL.md               ← This file (Agent instruction)
├── scripts/
│   ├── nanobanana_api.py  ← Core engine (Google Gemini API client)
│   ├── auth.py            ← Credential management (init / status / clean)
│   ├── generate.py        ← E-commerce image generation (6 templates)
│   ├── refine.py          ← Image refinement and editing (9 templates)
│   └── icon_extract.py   ← Icon extraction pipeline (bg-removal + detect + crop)
├── evals/
│   └── evals.json         ← Test cases for skill evaluation
└── references/
    └── api_reference.md   ← Full API parameter reference
```
