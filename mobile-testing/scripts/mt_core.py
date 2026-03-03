#!/usr/bin/env python3
"""
mt_core — Mobile Testing core utilities.

Provides unified device discovery, platform detection, and shared helpers.
Zero dependencies — uses only Python 3 standard library.
"""

import json
import subprocess
import sys
import re
from dataclasses import dataclass, asdict
from typing import List, Optional, Tuple


@dataclass
class Device:
    platform: str  # "android" or "ios"
    name: str
    device_id: str
    status: str  # "online", "booted", "shutdown", "offline"
    details: str = ""


def run_cmd(cmd: List[str], timeout: int = 15) -> Tuple[int, str, str]:
    """Run a shell command and return (returncode, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode, result.stdout, result.stderr
    except FileNotFoundError:
        return -1, "", f"Command not found: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return -2, "", f"Command timed out after {timeout}s: {' '.join(cmd)}"


def check_tool(name: str) -> bool:
    """Check if a CLI tool is available."""
    rc, _, _ = run_cmd(["which", name])
    return rc == 0


def discover_android_devices() -> List[Device]:
    """Discover connected Android devices via adb."""
    if not check_tool("adb"):
        return []

    rc, stdout, _ = run_cmd(["adb", "devices", "-l"])
    if rc != 0:
        return []

    devices = []
    for line in stdout.strip().split("\n")[1:]:  # skip header
        line = line.strip()
        if not line or "daemon" in line.lower():
            continue

        parts = line.split()
        if len(parts) < 2:
            continue

        device_id = parts[0]
        status = parts[1]  # "device", "offline", "unauthorized"

        # Extract model name from properties
        model = "Unknown"
        for part in parts[2:]:
            if part.startswith("model:"):
                model = part.split(":", 1)[1]
                break

        mapped_status = "online" if status == "device" else status
        details = " ".join(parts[2:]) if len(parts) > 2 else ""

        devices.append(Device(
            platform="android",
            name=model,
            device_id=device_id,
            status=mapped_status,
            details=details,
        ))

    return devices


def discover_ios_devices() -> List[Device]:
    """Discover iOS simulators via xcrun simctl."""
    if not check_tool("xcrun"):
        return []

    rc, stdout, _ = run_cmd(["xcrun", "simctl", "list", "devices", "available", "-j"])
    if rc != 0:
        return []

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        return []

    devices = []
    for runtime, device_list in data.get("devices", {}).items():
        # Extract runtime version for display
        runtime_short = runtime.split(".")[-1].replace("-", " ") if "." in runtime else runtime

        for dev in device_list:
            name = dev.get("name", "Unknown")
            udid = dev.get("udid", "")
            state = dev.get("state", "unknown").lower()

            # Map states: Booted → booted, Shutdown → shutdown
            mapped_state = "booted" if state == "booted" else "shutdown"

            devices.append(Device(
                platform="ios",
                name=name,
                device_id=udid,
                status=mapped_state,
                details=runtime_short,
            ))

    return devices


def list_all_devices() -> List[Device]:
    """Discover all connected/available devices across platforms."""
    devices = []
    devices.extend(discover_android_devices())
    devices.extend(discover_ios_devices())
    return devices


def print_device_table(devices: List[Device]) -> None:
    """Print devices in a readable table format."""
    if not devices:
        print("No devices found.")
        print("\nTroubleshooting:")
        print("  Android: ensure 'adb' is installed and devices are connected")
        print("  iOS:     ensure Xcode is installed (macOS only)")
        return

    # Header
    header = f"{'Platform':<10} | {'Device':<25} | {'ID':<40} | {'Status':<12} | {'Details'}"
    separator = "-" * 10 + "-+-" + "-" * 25 + "-+-" + "-" * 40 + "-+-" + "-" * 12 + "-+-" + "-" * 20
    print(header)
    print(separator)

    for d in devices:
        name = d.name[:25] if len(d.name) > 25 else d.name
        did = d.device_id[:40] if len(d.device_id) > 40 else d.device_id
        details = d.details[:20] if len(d.details) > 20 else d.details
        print(f"{d.platform:<10} | {name:<25} | {did:<40} | {d.status:<12} | {details}")

    print(f"\nTotal: {len(devices)} device(s)")

    # Summary
    android_count = sum(1 for d in devices if d.platform == "android")
    ios_count = sum(1 for d in devices if d.platform == "ios")
    booted = sum(1 for d in devices if d.status in ("online", "booted"))
    print(f"  Android: {android_count}, iOS: {ios_count}, Active: {booted}")


def print_devices_json(devices: List[Device]) -> None:
    """Print devices as JSON."""
    print(json.dumps([asdict(d) for d in devices], indent=2, ensure_ascii=False))


def get_package_info_android(package: str) -> dict:
    """Get basic info about an installed Android package."""
    info = {"package": package}

    rc, stdout, _ = run_cmd(["adb", "shell", "dumpsys", "package", package])
    if rc == 0:
        for line in stdout.split("\n"):
            line = line.strip()
            if line.startswith("versionName="):
                info["version"] = line.split("=", 1)[1]
            elif line.startswith("versionCode="):
                info["version_code"] = line.split("=", 1)[1].split()[0]
            elif line.startswith("targetSdk="):
                info["target_sdk"] = line.split("=", 1)[1]

    return info


# --- Main ---

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Mobile Testing — Device Discovery")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--platform", choices=["android", "ios", "all"], default="all",
                        help="Filter by platform")
    args = parser.parse_args()

    devices = list_all_devices()

    if args.platform != "all":
        devices = [d for d in devices if d.platform == args.platform]

    if args.json:
        print_devices_json(devices)
    else:
        print_device_table(devices)


if __name__ == "__main__":
    main()
