"""Structural R4 (4.0.1) validation of exported bundles.

Usage:
    pip install "fhir.resources==6.4.0" "pydantic<2"
    python scripts/validate_fhir.py fhir-examples/*.json

fhir.resources 6.4.0 is the last release built on FHIR 4.0.1. It rejects unknown
elements, wrong types and missing required elements. It does not check terminology
bindings or FHIRPath invariants; run the official HL7 validator for those.
"""
import json
import sys

import fhir.resources
from fhir.resources.bundle import Bundle

assert fhir.resources.__fhir_version__ == "4.0.1", fhir.resources.__fhir_version__

failed = 0
for path in sys.argv[1:]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    try:
        bundle = Bundle.parse_obj(raw)
        # Round trip: anything the model silently dropped would be an invented element.
        back = json.loads(bundle.json())
        lost = [e["resource"]["resourceType"] for e, b in zip(raw["entry"], back["entry"]) if len(json.dumps(e)) != len(json.dumps(b))]
        kinds = sorted({e["resource"]["resourceType"] for e in raw["entry"]})
        print(f"OK   {path}: {len(raw['entry'])} resources ({', '.join(kinds)})" + (f"  round-trip differs: {lost}" if lost else ""))
    except Exception as exc:  # noqa: BLE001 - report every failure, keep going
        failed += 1
        print(f"FAIL {path}\n{exc}\n")

sys.exit(1 if failed else 0)
