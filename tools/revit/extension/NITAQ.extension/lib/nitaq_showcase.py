# -*- coding: utf-8 -*-
"""Settings and helpers for the NITAQ Showcase button (portable: works on any engineer's PC).

The installer puts the export and publish scripts in <extension>/tools, writes the engineer's
key to %APPDATA%/NITAQ/showcase.json and nothing here points at a particular PC.
"""
import io
import json
import os

EXT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(EXT, 'tools')
CONFIG = os.path.join(os.environ.get('APPDATA', EXT), 'NITAQ', 'showcase.json')
WORK = os.path.join(os.environ.get('LOCALAPPDATA', os.environ.get('TEMP', EXT)), 'NITAQ', 'showcase')
NODE = r'C:\Program Files\nodejs\node.exe'


def node():
    """Path of node.exe: the standard install, else whatever is on PATH."""
    return NODE if os.path.isfile(NODE) else 'node'


def config():
    """The engineer's publishing settings, or None when this PC was not set up."""
    try:
        with io.open(CONFIG, encoding='utf-8-sig') as f:
            cfg = json.load(f)
        return cfg if cfg.get('endpoint') and cfg.get('key') else None
    except Exception:
        return None


def run_export(doc, name, inputs):
    """Run one of the read-only Revit export scripts and return its `result`."""
    path = os.path.join(TOOLS, name)
    src = io.open(path, encoding='utf-8').read()
    scope = {'doc': doc, 'inputs': inputs, '__name__': '__nitaq_showcase__'}
    exec(compile(src, path, 'exec'), scope)
    return scope.get('result')
