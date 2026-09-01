from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from .config import SRC

LOCALES = ("en", "es", "tg")


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf8"))


def _flatten(value, prefix=""):
    if isinstance(value, dict):
        for key, child in value.items():
            name = f"{prefix}.{key}" if prefix else str(key)
            yield from _flatten(child, name)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            name = f"{prefix}[{index}]"
            yield from _flatten(child, name)
    else:
        yield prefix, value


def _locale_groups():
    """Return directories containing one or more standard locale files."""
    groups = {}
    for path in (SRC / "data").rglob("*.json"):
        lang = path.stem.lower()
        if lang in LOCALES:
            groups.setdefault(path.parent, {})[lang] = path
    return groups


def _list_identity(items):
    """Use stable record identifiers when a list is a collection, not prose."""
    if not items or not all(isinstance(item, dict) for item in items):
        return None
    for key in ("id", "slug", "key", "code"):
        values = [item.get(key) for item in items]
        if all(isinstance(value, (str, int)) and str(value).strip() for value in values):
            if len({str(value) for value in values}) == len(values):
                return key
    return None


def _missing_paths(reference, candidate, prefix=""):
    """Find only definite omissions, avoiding noisy type/order heuristics."""
    missing = []

    if isinstance(reference, dict):
        if not isinstance(candidate, dict):
            return [prefix or "root"]
        for key, value in reference.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if key not in candidate:
                missing.append(path)
            else:
                missing.extend(_missing_paths(value, candidate[key], path))
        return missing

    if isinstance(reference, list):
        if not isinstance(candidate, list):
            return [prefix or "root"]
        identity = _list_identity(reference)
        if identity:
            ref_items = {str(item[identity]): item for item in reference}
            cand_items = {
                str(item[identity]): item
                for item in candidate
                if isinstance(item, dict) and identity in item
            }
            for item_id, item in ref_items.items():
                path = f"{prefix}[{identity}={item_id}]"
                if item_id not in cand_items:
                    missing.append(path)
                else:
                    missing.extend(_missing_paths(item, cand_items[item_id], path))
        # Positional lists often contain content whose order may legitimately vary.
        # Only compare common positions; never infer that extra/reordered entries are errors.
        else:
            for index, value in enumerate(reference[: len(candidate)]):
                missing.extend(_missing_paths(value, candidate[index], f"{prefix}[{index}]"))
            if len(candidate) < len(reference):
                missing.append(f"{prefix}[{len(candidate)}..{len(reference) - 1}]")
        return missing

    return missing


def localization_completeness():
    """Check EN/ES/TG coverage without treating optional locale data as a false error.

    English is used as the canonical reference when available. The check reports missing
    locale files and missing English keys, while allowing extra locale-specific metadata.
    Results are informational WARNs rather than hard failures because a project may
    intentionally publish incomplete translations during ongoing localization.
    """
    groups = _locale_groups()
    problems = []
    checked = 0
    complete = 0

    for parent, by_lang in sorted(groups.items(), key=lambda item: str(item[0])):
        checked += 1
        rel = parent.relative_to(SRC)
        group_problems = []

        for lang in LOCALES:
            if lang not in by_lang:
                group_problems.append(f"{rel}: missing locale file {lang}.json")

        if "en" in by_lang:
            try:
                reference = _load(by_lang["en"])
            except Exception as exc:
                group_problems.append(f"{rel}/en.json: unreadable ({exc})")
                reference = None

            if reference is not None:
                for lang in ("es", "tg"):
                    path = by_lang.get(lang)
                    if not path:
                        continue
                    try:
                        candidate = _load(path)
                    except Exception as exc:
                        group_problems.append(f"{path.relative_to(SRC)}: unreadable ({exc})")
                        continue
                    missing = _missing_paths(reference, candidate)
                    if missing:
                        preview = ", ".join(missing[:6])
                        suffix = " …" if len(missing) > 6 else ""
                        group_problems.append(
                            f"{path.relative_to(SRC)}: missing {len(missing)} English reference path(s): {preview}{suffix}"
                        )
        else:
            group_problems.append(f"{rel}: cannot verify key coverage because en.json is missing")

        if group_problems:
            problems.extend(group_problems)
        else:
            complete += 1

    status = "PASS" if not problems else "WARN"
    return (
        status,
        f"{complete}/{checked} locale group(s) complete for EN/ES/TG · {len(problems)} coverage issue(s)",
        problems,
        checked,
    )


# Backward-compatible name for callers that still use the old check label.
def translation_parity():
    return localization_completeness()


def _iter_records(value, path="root"):
    if isinstance(value, list):
        for i, item in enumerate(value):
            yield from _iter_records(item, f"{path}[{i}]")
    elif isinstance(value, dict):
        yield path, value
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                yield from _iter_records(item, f"{path}.{key}")


def schema_health():
    files = list((SRC / "data").rglob("*.json")); problems = []; checked = 0
    for path in files:
        try:
            data = _load(path)
        except Exception:
            continue
        checked += 1
        # Group ids by the top-level collection they belong to (the first path
        # segment, e.g. "root.categories[3]" -> "categories"). Different
        # collections in the same file legitimately reuse ids as foreign keys
        # (e.g. help.json's `categories` link to `sections` by matching id),
        # so only flag ids repeated *within* the same collection.
        ids_by_collection = {}
        for location, record in _iter_records(data):
            if not isinstance(record, dict):
                continue
            if "id" in record:
                value = record["id"]
                if not isinstance(value, (str, int)) or (isinstance(value, str) and not value.strip()):
                    problems.append(f"{path.relative_to(SRC)} {location}: invalid id")
                else:
                    collection = location.split(".")[1].split("[")[0] if "." in location else location
                    ids_by_collection.setdefault(collection, []).append(str(value))
            for key in ("title", "name"):
                if key in record and isinstance(record[key], str) and not record[key].strip():
                    problems.append(f"{path.relative_to(SRC)} {location}: empty {key}")
        for collection, ids in ids_by_collection.items():
            dup = [v for v, c in Counter(ids).items() if c > 1]
            if dup:
                problems.append(f"{path.relative_to(SRC)} duplicate IDs in {collection}: {', '.join(dup[:8])}")
    status = "PASS" if not problems else "WARN"
    return status, f"{checked} JSON file(s) inspected · {len(problems)} schema/data issue(s)", problems, checked


def duplicate_content():
    problems = []; checked = 0
    for path in (SRC / "data").rglob("*.json"):
        try:
            data = _load(path)
        except Exception:
            continue
        checked += 1
        values = {"id": [], "slug": [], "url": []}
        for _, record in _iter_records(data):
            if isinstance(record, dict):
                for key in values:
                    v = record.get(key)
                    if isinstance(v, str) and v.strip():
                        values[key].append(v.strip())
        for key, items in values.items():
            dup = [v for v, c in Counter(items).items() if c > 1]
            if dup:
                problems.append(f"{path.relative_to(SRC)} duplicate {key}: {', '.join(dup[:8])}")
    status = "PASS" if not problems else "WARN"
    return status, f"{checked} JSON file(s) scanned · {len(problems)} duplicate group(s)", problems, checked
