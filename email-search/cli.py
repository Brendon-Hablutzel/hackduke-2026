#!/usr/bin/env python3
"""CLI for email-search: index and search commands."""

import json
import os
import sys

# Ensure project root is on path when running locally
sys.path.insert(0, os.path.dirname(__file__))

import click
from rich.console import Console
from rich.table import Table
from rich import box

console = Console()


@click.group()
def cli():
    """Essentra — CLI"""


@cli.command()
@click.option("--max", "max_emails", default=None, type=int, help="Max emails to fetch (default from .env)")
def index(max_emails):
    """Fetch and index emails from Gmail."""
    from app.config import config
    from app.indexer import run_indexing

    limit = max_emails or config.MAX_EMAILS
    console.print(f"[bold blue]Indexing up to {limit} emails…[/bold blue]")

    last_pct = [-1]

    def progress(new, skipped):
        total = new + skipped
        pct = (total // 10) * 10
        if pct != last_pct[0]:
            console.print(f"  [dim]processed {total} (new: {new}, skipped: {skipped})[/dim]")
            last_pct[0] = pct

    try:
        result = run_indexing(max_emails=limit, progress_callback=progress)
        console.print(f"\n[bold green]Done![/bold green]")
        console.print(f"  New indexed : {result['new']}")
        console.print(f"  Skipped     : {result['skipped']}")
        console.print(f"  Total       : {result['total_indexed']}")
        console.print(f"  Last sync   : {result['last_sync']}")
    except FileNotFoundError as e:
        console.print(f"[bold red]Error:[/bold red] {e}")
        sys.exit(1)
    except ConnectionError as e:
        console.print(f"[bold red]ChromaDB unreachable:[/bold red] {e}")
        sys.exit(1)
    except Exception as e:
        console.print(f"[bold red]Unexpected error:[/bold red] {e}")
        raise


@cli.command()
@click.argument("query")
@click.option("-k", default=10, type=int, show_default=True, help="Number of results to return")
@click.option("--json", "as_json", is_flag=True, help="Output raw JSON")
def search(query, k, as_json):
    """Search indexed emails with a natural language QUERY."""
    from app.search import search as do_search

    try:
        results = do_search(query, k=k)
    except ConnectionError as e:
        console.print(f"[bold red]ChromaDB unreachable:[/bold red] {e}")
        sys.exit(1)
    except Exception as e:
        console.print(f"[bold red]Search failed:[/bold red] {e}")
        sys.exit(1)

    if as_json:
        print(json.dumps(results, indent=2))
        return

    if not results:
        console.print("[yellow]No results found.[/yellow]")
        return

    table = Table(box=box.SIMPLE_HEAD, show_header=True, header_style="bold")
    table.add_column("#", style="dim", width=3)
    table.add_column("Date", width=14)
    table.add_column("From", width=28, no_wrap=True)
    table.add_column("Subject", width=38)
    table.add_column("Score", width=7, justify="right")
    table.add_column("Snippet", width=50)

    for r in results:
        score_str = f"{r['score']:.3f}"
        date_str = r.get("date", "")[:16]
        table.add_row(
            str(r["rank"]),
            date_str,
            r.get("sender", "")[:28],
            r.get("subject", "")[:38],
            score_str,
            r.get("snippet", "")[:80],
        )

    console.print(f"\n[bold]Results for:[/bold] {query}\n")
    console.print(table)


@cli.command()
def stats():
    """Show indexing stats."""
    from app.indexer import load_stats
    from app.vectordb import collection_count

    data = load_stats()
    try:
        count = collection_count()
        console.print(f"Indexed emails : [bold]{count}[/bold]")
    except ConnectionError as e:
        console.print(f"[yellow]ChromaDB unreachable (stats from file):[/yellow] {e}")
        count = data.get("indexed_count", "?")
    console.print(f"Last sync      : {data.get('last_sync', 'never')}")


if __name__ == "__main__":
    cli()
