#!/usr/bin/env python3
"""
perf — Performance data collection and report generation.

Collects multi-sample performance metrics (launch time, memory, CPU, frame stats)
and generates a Markdown report with statistical summary.
Zero dependencies — uses only Python 3 standard library.
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Import shared utilities
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mt_core import run_cmd, check_tool


# --- Android Performance Collection ---

def android_cold_launch(package: str, activity: Optional[str] = None) -> Optional[int]:
    """Perform a cold launch and return TotalTime in ms."""
    # Force stop first
    run_cmd(["adb", "shell", "am", "force-stop", package])
    time.sleep(1)

    if activity:
        target = f"{package}/{activity}"
    else:
        # Try to find the main activity
        rc, stdout, _ = run_cmd(["adb", "shell", "cmd", "package", "resolve-activity",
                                  "--brief", package])
        if rc == 0 and "/" in stdout:
            target = stdout.strip().split("\n")[-1].strip()
        else:
            target = f"{package}/.MainActivity"

    rc, stdout, _ = run_cmd(["adb", "shell", "am", "start", "-W", target], timeout=30)
    if rc != 0:
        return None

    for line in stdout.split("\n"):
        if "TotalTime:" in line:
            match = re.search(r"TotalTime:\s*(\d+)", line)
            if match:
                return int(match.group(1))
    return None


def android_memory(package: str) -> Optional[Dict[str, int]]:
    """Collect memory info via dumpsys meminfo. Returns dict with key metrics in KB."""
    rc, stdout, _ = run_cmd(["adb", "shell", "dumpsys", "meminfo", package])
    if rc != 0:
        return None

    result = {}
    for line in stdout.split("\n"):
        line = line.strip()
        if line.startswith("TOTAL PSS:"):
            match = re.search(r"TOTAL PSS:\s*(\d+)", line)
            if match:
                result["total_pss_kb"] = int(match.group(1))
        elif line.startswith("TOTAL"):
            parts = line.split()
            if len(parts) >= 2:
                try:
                    result.setdefault("total_pss_kb", int(parts[1]))
                except ValueError:
                    pass
        elif "Java Heap:" in line:
            match = re.search(r"(\d+)", line)
            if match:
                result["java_heap_kb"] = int(match.group(1))
        elif "Native Heap:" in line:
            match = re.search(r"(\d+)", line)
            if match:
                result["native_heap_kb"] = int(match.group(1))

    return result if result else None


def android_cpu(package: str) -> Optional[float]:
    """Get CPU usage percentage for a package."""
    rc, stdout, _ = run_cmd(["adb", "shell", "top", "-n", "1", "-b"])
    if rc != 0:
        return None

    for line in stdout.split("\n"):
        if package in line:
            parts = line.split()
            # top output format varies; CPU% is typically column 9 or 5
            for part in parts:
                part = part.rstrip("%")
                try:
                    val = float(part)
                    if 0 <= val <= 100:
                        return val
                except ValueError:
                    continue
    return None


def android_frame_stats(package: str) -> Optional[Dict[str, int]]:
    """Get frame rendering stats via gfxinfo."""
    # Reset stats first
    run_cmd(["adb", "shell", "dumpsys", "gfxinfo", package, "reset"])
    time.sleep(3)  # Wait for some frames to render

    rc, stdout, _ = run_cmd(["adb", "shell", "dumpsys", "gfxinfo", package])
    if rc != 0:
        return None

    result = {}
    for line in stdout.split("\n"):
        line = line.strip()
        if "Total frames rendered:" in line:
            match = re.search(r"(\d+)", line)
            if match:
                result["total_frames"] = int(match.group(1))
        elif "Janky frames:" in line:
            match = re.search(r"(\d+)", line)
            if match:
                result["janky_frames"] = int(match.group(1))

    return result if result else None


def collect_android_sample(package: str, activity: Optional[str] = None) -> Dict:
    """Collect one full sample of Android performance metrics."""
    sample = {"timestamp": datetime.now().isoformat()}

    launch_time = android_cold_launch(package, activity)
    if launch_time is not None:
        sample["launch_time_ms"] = launch_time

    time.sleep(2)  # Let the app stabilize

    mem = android_memory(package)
    if mem:
        sample["memory"] = mem

    cpu = android_cpu(package)
    if cpu is not None:
        sample["cpu_percent"] = cpu

    frames = android_frame_stats(package)
    if frames:
        sample["frames"] = frames

    return sample


# --- iOS Performance Collection ---

def ios_launch(bundle_id: str) -> Optional[float]:
    """Launch an iOS app and estimate launch time."""
    run_cmd(["xcrun", "simctl", "terminate", "booted", bundle_id])
    time.sleep(1)

    start = time.time()
    rc, stdout, _ = run_cmd(["xcrun", "simctl", "launch", "booted", bundle_id], timeout=30)
    elapsed = time.time() - start

    if rc != 0:
        return None

    # simctl launch doesn't report TotalTime like adb; we estimate
    return round(elapsed * 1000)


def collect_ios_sample(bundle_id: str) -> Dict:
    """Collect one sample of iOS performance metrics."""
    sample = {"timestamp": datetime.now().isoformat()}

    launch_time = ios_launch(bundle_id)
    if launch_time is not None:
        sample["launch_time_ms"] = launch_time

    # iOS simulator doesn't expose memory/CPU as easily as Android
    # Agent can supplement with Instruments if needed
    sample["note"] = "iOS simulator has limited real-time perf APIs. Use Instruments for memory/CPU."

    return sample


# --- Statistics ---

def calc_stats(values: List[float]) -> Dict:
    """Calculate mean, stddev, min, max for a list of values."""
    if not values:
        return {}
    n = len(values)
    mean = sum(values) / n
    if n > 1:
        variance = sum((x - mean) ** 2 for x in values) / (n - 1)
        stddev = math.sqrt(variance)
    else:
        stddev = 0.0
    return {
        "mean": round(mean, 2),
        "stddev": round(stddev, 2),
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        "samples": n,
    }


# --- Report Generation ---

def generate_report(
    package: str,
    platform: str,
    samples: List[Dict],
    output_path: Optional[str] = None,
) -> str:
    """Generate a Markdown performance report from collected samples."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = [
        f"# Performance Report — `{package}`",
        "",
        f"| Item | Value |",
        f"|------|-------|",
        f"| Platform | {platform} |",
        f"| Samples | {len(samples)} |",
        f"| Collected | {now} |",
        "",
    ]

    # Launch Time
    launch_times = [s["launch_time_ms"] for s in samples if "launch_time_ms" in s]
    if launch_times:
        stats = calc_stats(launch_times)
        lines.extend([
            "## Cold Launch Time",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| Mean | {stats['mean']} ms |",
            f"| Std Dev | {stats['stddev']} ms |",
            f"| Min | {stats['min']} ms |",
            f"| Max | {stats['max']} ms |",
            "",
        ])
        # Health assessment
        if stats["mean"] < 1000:
            lines.append("> ✅ Launch time is excellent (< 1s)")
        elif stats["mean"] < 2000:
            lines.append("> ⚠️ Launch time is acceptable (1-2s)")
        else:
            lines.append("> ❌ Launch time is slow (> 2s) — investigate cold start bottlenecks")
        lines.append("")

    # Memory (Android only)
    mem_samples = [s["memory"] for s in samples if "memory" in s]
    if mem_samples:
        pss_values = [m["total_pss_kb"] for m in mem_samples if "total_pss_kb" in m]
        if pss_values:
            stats = calc_stats(pss_values)
            lines.extend([
                "## Memory Usage (PSS)",
                "",
                "| Metric | Value |",
                "|--------|-------|",
                f"| Mean | {stats['mean']:.0f} KB ({stats['mean']/1024:.1f} MB) |",
                f"| Std Dev | {stats['stddev']:.0f} KB |",
                f"| Min | {stats['min']:.0f} KB |",
                f"| Max | {stats['max']:.0f} KB |",
                "",
            ])
            if stats["mean"] / 1024 < 100:
                lines.append("> ✅ Memory usage is low (< 100 MB)")
            elif stats["mean"] / 1024 < 256:
                lines.append("> ⚠️ Memory usage is moderate (100-256 MB)")
            else:
                lines.append("> ❌ Memory usage is high (> 256 MB) — check for leaks")
            lines.append("")

    # CPU (Android only)
    cpu_values = [s["cpu_percent"] for s in samples if "cpu_percent" in s]
    if cpu_values:
        stats = calc_stats(cpu_values)
        lines.extend([
            "## CPU Usage",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| Mean | {stats['mean']}% |",
            f"| Std Dev | {stats['stddev']}% |",
            f"| Min | {stats['min']}% |",
            f"| Max | {stats['max']}% |",
            "",
        ])

    # Frame Stats (Android only)
    frame_samples = [s["frames"] for s in samples if "frames" in s]
    if frame_samples:
        total_frames = sum(f.get("total_frames", 0) for f in frame_samples)
        janky_frames = sum(f.get("janky_frames", 0) for f in frame_samples)
        jank_rate = (janky_frames / total_frames * 100) if total_frames > 0 else 0

        lines.extend([
            "## Frame Rendering",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| Total Frames | {total_frames} |",
            f"| Janky Frames | {janky_frames} ({jank_rate:.1f}%) |",
            "",
        ])
        if jank_rate < 5:
            lines.append("> ✅ Frame jank rate is acceptable (< 5%)")
        else:
            lines.append("> ❌ High jank rate — investigate UI thread bottlenecks")
        lines.append("")

    # Raw data
    lines.extend([
        "## Raw Samples",
        "",
        "```json",
        json.dumps(samples, indent=2, ensure_ascii=False),
        "```",
    ])

    report = "\n".join(lines)

    if output_path:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
        with open(output_path, "w") as f:
            f.write(report)
        print(f"Report saved to: {output_path}")

    return report


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Mobile Testing — Performance Profiler")
    parser.add_argument("--package", required=True, help="App package/bundle ID")
    parser.add_argument("--platform", choices=["android", "ios"], required=True,
                        help="Target platform")
    parser.add_argument("--activity", help="Android launch activity (auto-detected if omitted)")
    parser.add_argument("--samples", type=int, default=3, help="Number of samples (default: 3)")
    parser.add_argument("--output", help="Output file path for Markdown report")
    parser.add_argument("--json", action="store_true", help="Output raw data as JSON")
    args = parser.parse_args()

    # Validate tools
    if args.platform == "android" and not check_tool("adb"):
        print("Error: adb not found. Install Android SDK Platform-Tools.", file=sys.stderr)
        sys.exit(1)
    if args.platform == "ios" and not check_tool("xcrun"):
        print("Error: xcrun not found. Install Xcode (macOS only).", file=sys.stderr)
        sys.exit(1)

    print(f"Collecting {args.samples} performance samples for {args.package}...")
    samples = []

    for i in range(args.samples):
        print(f"  Sample {i + 1}/{args.samples}...", end=" ", flush=True)
        if args.platform == "android":
            sample = collect_android_sample(args.package, args.activity)
        else:
            sample = collect_ios_sample(args.package)
        samples.append(sample)
        launch = sample.get("launch_time_ms", "N/A")
        print(f"launch={launch}ms")
        if i < args.samples - 1:
            time.sleep(2)

    if args.json:
        print(json.dumps(samples, indent=2, ensure_ascii=False))
    else:
        report = generate_report(args.package, args.platform, samples, args.output)
        if not args.output:
            print("\n" + report)


if __name__ == "__main__":
    main()
