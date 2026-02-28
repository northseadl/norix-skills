---
name: image-studio
version: 0.1.0
description: |
  AI-powered image generation and editing via Nano Banana API (nanobananapro.cloud).
  Zero-dependency Python scripts for e-commerce product image creation and photo refinement.
  Uses Google Gemini API directly (generativelanguage.googleapis.com).

  Two core workflows:
  1. E-commerce Image Generation: product hero shots, marketing banners, detail page grids,
     lifestyle scenes, social media posts — with 6 professional prompt templates
  2. Image Refinement: background replacement/removal, quality enhancement, portrait retouching,
     object swap, style transfer, color grading, canvas extension

  Default model: Nano Banana 2 (Gemini 3.1 Flash Image) — best speed/quality balance.
  Supports 3 Gemini image models from fast previews to studio-quality 4K via Nano Banana Pro.

  Use this skill whenever the user mentions any of these, even without saying "Nano Banana":
  AI image generation, product photo generation, e-commerce image creation,
  marketing banner creation, product photography AI, hero shot generation,
  detail page images, product mockups, image editing API, background removal,
  background replacement, photo retouching, image enhancement, style transfer,
  object replacement in photos, image upscaling, color grading, canvas extension,
  AI product photos, batch image generation, commercial photography AI.

  Also trigger on Chinese: "AI生图", "电商图片", "商品图", "产品图", "主图生成",
  "详情页图片", "营销图片", "海报设计", "背景替换", "图片精修", "抠图",
  "去背景", "图片增强", "风格迁移", "人像修图", "产品摄影", "电商摄影",
  "Banner生成", "社交媒体图片", "Nano Banana", "AI修图", "商品主图".
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
| `social`    | 4:5   | 1K   | Instagram/social media post            |

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
nano-banana/
├── nanobanana             ← Unified CLI entry point (bash)
├── SKILL.md               ← This file (Agent instruction)
├── scripts/
│   ├── nanobanana_api.py  ← Core engine (Google Gemini API client)
│   ├── auth.py            ← Credential management (init / status / clean)
│   ├── generate.py        ← E-commerce image generation (6 templates)
│   └── refine.py          ← Image refinement and editing (9 templates)
├── evals/
│   └── evals.json         ← Test cases for skill evaluation
└── references/
    └── api_reference.md   ← Full API parameter reference
```
