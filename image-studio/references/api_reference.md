# Nano Banana API Reference

> Complete parameter reference for nanobananapro.cloud API.
> Read this file when you need exact parameter names, valid values, or response formats.

## Table of Contents

- [Authentication](#authentication)
- [Image Generation Endpoint](#image-generation-endpoint)
- [Result Polling Endpoint](#result-polling-endpoint)
- [Models](#models)
- [Parameters](#parameters)
- [Response Formats](#response-formats)
- [E-commerce Templates](#e-commerce-templates)
- [Refinement Templates](#refinement-templates)
- [Error Codes](#error-codes)
- [Best Practices](#best-practices)

## Authentication

All requests require `Authorization: Bearer <API_KEY>` header.

API keys are obtained from the nanobananapro.cloud dashboard.

Resolution priority:
1. `NANOBANANA_API_KEY` environment variable
2. `~/.nanobanana/credentials.json` → `api_key` field

## Image Generation Endpoint

```
POST https://nanobananapro.cloud/api/v1/image/nano-banana
Content-Type: application/json (text-to-image)
             OR multipart/form-data (with file uploads)
```

## Result Polling Endpoint

```
POST https://nanobananapro.cloud/api/v1/image/nano-banana/result
Content-Type: application/json
Body: {"taskId": "<task-id-from-generation>"}
```

## Models

| Model                  | Credits | Engine                    | Max Resolution | Best For                         |
|------------------------|---------|---------------------------|----------------|----------------------------------|
| `nano-banana-fast`     | 5       | Fast                      | 1K             | Previews, drafts                 |
| `nano-banana`          | 10      | Gemini 3.1 Flash Image    | 2K             | **Default.** Speed + quality     |
| `nano-banana-pro`      | 20      | Gemini 3 Pro Image        | 4K             | Studio quality, complex scenes   |
| `nano-banana-vip`      | 30      | VIP                       | 2K             | Priority queue                   |
| `nano-banana-pro-vip`  | 40/50   | Pro VIP                   | 4K             | Priority + 4K (50 credits at 4K) |

**Default model**: `nano-banana` (Nano Banana 2 = Gemini 3.1 Flash Image)

## Parameters

### Required

| Parameter | Type   | Description                            |
|-----------|--------|----------------------------------------|
| `prompt`  | string | Image description or editing instruction |

### Optional

| Parameter      | Type           | Default     | Valid Values                                                    |
|----------------|----------------|-------------|-----------------------------------------------------------------|
| `model`        | string         | `nano-banana` | See Models table above                                         |
| `mode`         | string         | `text-to-image` | `text-to-image`, `image-to-image`                           |
| `aspectRatio`  | string         | `auto`      | `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `3:2`, `2:3`, `5:4`, `4:5`, `21:9` |
| `imageSize`    | string         | `1K`        | `1K`, `2K`, `4K` (must be uppercase)                           |
| `outputFormat` | string         | `png`       | `png`, `jpeg`, `webp`                                          |
| `isPublic`     | boolean        | `true`      | `true`, `false`                                                |
| `imageFile`    | FormData       | —           | Up to 8 files, each ≤10 MB (for image-to-image)               |
| `imageUrl`     | string/array   | —           | Image URL(s), counts toward 8-image cap                        |

### Important Notes

- `aspectRatio: auto` → square (1:1) for text-to-image; preserves original ratio for image-to-image
- `imageSize` must use uppercase letters: `4K` not `4k`
- Total reference images (files + URLs) cannot exceed 8
- `image-to-image` mode requires at least 1 reference image

## Response Formats

### Synchronous (direct result)

```json
{
  "data": {
    "imageUrl": ["https://...image1.png", "https://...image2.png"]
  }
}
```

### Asynchronous (polling required)

Initial response:
```json
{
  "data": {
    "taskId": "abc123..."
  }
}
```

Poll result response:
```json
{
  "data": {
    "status": "completed",
    "imageUrl": ["https://...image.png"]
  }
}
```

Status values: `processing`, `completed`, `failed`

## E-commerce Templates

Templates available via `generate.py --template <name>`:

| Template    | Aspect Ratio | Resolution | Use Case                            |
|-------------|-------------|------------|--------------------------------------|
| `hero`      | 1:1         | 2K         | Product hero shot, white background  |
| `banner`    | 16:9        | 2K         | Promotional banner                   |
| `detail`    | 3:4         | 2K         | Close-up material/texture detail     |
| `lifestyle` | 4:3         | 2K         | Product in lifestyle scene           |
| `grid`      | 1:1         | 2K         | Four-panel detail page showcase      |
| `social`    | 4:5         | 1K         | Instagram/social media post          |

Templates auto-enhance prompts with professional photography directives.
Use `--raw` flag to bypass prompt enhancement.

## Refinement Templates

Templates available via `refine.py --template <name>`:

| Template         | Requires Prompt | Use Case                              |
|------------------|-----------------|---------------------------------------|
| `bg-replace`     | ✓ (new bg)      | Replace background with specified scene |
| `bg-white`       | ✗               | Convert to white e-commerce background |
| `bg-remove`      | ✗               | Chromakey green background for compositing |
| `enhance`        | ✗               | Quality enhancement (sharp, color, noise) |
| `retouch`        | ✗               | Portrait retouching (natural)          |
| `object-swap`    | ✓ (what to swap) | Replace object in scene               |
| `style-transfer` | ✓ (target style) | Apply artistic style                  |
| `color-grade`    | ✓ (mood/tone)   | Professional color grading             |
| `extend`         | ✓ (direction)   | Extend/outpaint canvas                 |

## Error Codes

| HTTP Code | Meaning                      | Recovery                          |
|-----------|------------------------------|-----------------------------------|
| 401       | Invalid API key              | Check/refresh API key             |
| 403       | Insufficient permissions     | Check account tier                |
| 429       | Rate limit exceeded          | Wait and retry (auto-handled)     |
| 400       | Bad request / invalid params | Check parameter values            |
| 5xx       | Server error                 | Retry (auto-handled, max 3)       |

## Best Practices

### Prompt Engineering for E-commerce

1. **Be specific about materials**: "brushed stainless steel" > "metal"
2. **Specify lighting**: "soft diffused studio lighting" > "well lit"
3. **Mention background**: "pure white background" or "gradient background"
4. **Scale reference**: Include size context when relevant
5. **Commercial keywords**: "product photography", "catalog style", "hero shot"

### Prompt Engineering for Image Refinement

1. **Be precise about what to change**: "replace the blue sky with sunset clouds" > "change background"
2. **Mention what to preserve**: "keep the person's expression and pose exactly"
3. **Specify style references**: "in the style of Wes Anderson cinematography"
4. **Quality markers**: "high-end retouching", "magazine quality", "4K detail"

### Performance Optimization

1. Use `nano-banana-fast` (5 credits) for quick previews before finalizing
2. Use `nano-banana` (default, 10 credits) for production-quality at speed
3. Reserve `nano-banana-pro` (20 credits) for complex scenes needing 4K or precise text rendering
4. Start with `1K` resolution for iteration, upgrade to `2K`/`4K` for final output
