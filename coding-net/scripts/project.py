#!/usr/bin/env python3
"""Coding.net Project Management — Info, Search, Members.

Usage via unified CLI:
  ./coding project list                        # List all projects
  ./coding project info --id 12345             # Get project by ID
  ./coding project find --name my-project      # Find project by name
  ./coding project members --id 12345          # List project members
  ./coding project depots --id 12345           # List project depots (shortcut)
"""

import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from coding_api import CodingClient, Log, output


def cmd_list(client: CodingClient, args):
    """List all accessible projects."""
    body = {}
    if args.page_size:
        body["PageSize"] = args.page_size
    if args.page:
        body["PageNumber"] = args.page
    result = client.call("DescribeCodingProjects", body)
    output(result)


def cmd_info(client: CodingClient, args):
    """Get project details by ID."""
    result = client.call("DescribeOneProject", {
        "ProjectId": args.id,
    })
    output(result)


def cmd_find(client: CodingClient, args):
    """Find a project by name."""
    result = client.call("DescribeProjectByName", {
        "ProjectName": args.name,
    })
    output(result)


def cmd_members(client: CodingClient, args):
    """List project members."""
    body = {
        "ProjectId": args.id,
        "PageNumber": args.page or 1,
        "PageSize": args.page_size or 100,
    }
    if args.role_id:
        body["RoleId"] = args.role_id
    result = client.call("DescribeProjectMembers", body)
    output(result)


def cmd_depots(client: CodingClient, args):
    """List depots in a project (shortcut for depot list)."""
    result = client.call("DescribeProjectDepots", {
        "ProjectId": args.id,
        "DepotType": args.type or "CODING",
    })
    output(result)


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(prog="coding project", description="Project management")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("list", help="List all projects")
    p.add_argument("--page-size", type=int, help="Page size")
    p.add_argument("--page", type=int, help="Page number")

    p = sub.add_parser("info", help="Get project by ID")
    p.add_argument("--id", required=True, type=int, help="Project ID")

    p = sub.add_parser("find", help="Find project by name")
    p.add_argument("--name", required=True, help="Project name")

    p = sub.add_parser("members", help="List project members")
    p.add_argument("--id", required=True, type=int, help="Project ID")
    p.add_argument("--role-id", type=int, help="Filter by role ID")
    p.add_argument("--page", type=int, help="Page number")
    p.add_argument("--page-size", type=int, help="Page size")

    p = sub.add_parser("depots", help="List project depots")
    p.add_argument("--id", required=True, type=int, help="Project ID")
    p.add_argument("--type", default="CODING", help="Depot type")

    args = parser.parse_args()
    client = CodingClient()

    dispatch = {
        "list": cmd_list,
        "info": cmd_info,
        "find": cmd_find,
        "members": cmd_members,
        "depots": cmd_depots,
    }

    dispatch[args.command](client, args)


if __name__ == "__main__":
    main()
