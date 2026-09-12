from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from p2rln_ref.jcs import canonicalize
from p2rln_ref.validator import validate_package


class JCSAndDistributionTests(unittest.TestCase):
    def test_jcs_number_examples_match_ecmascript_spelling(self):
        expected={
            1.0:"1",
            1e-7:"1e-7",
            1e-6:"0.000001",
            1e20:"100000000000000000000",
            1e21:"1e+21",
            333333333.33333329:"333333333.3333333",
            4.5:"4.5",
            0.002:"0.002",
            -0.0:"0",
        }
        for value,want in expected.items():
            self.assertEqual(want,canonicalize(value),repr(value))

    def test_jcs_uses_utf16_key_order(self):
        obj={"\U0001f600":1,"\ufffd":2,"a":3}
        self.assertEqual('{"a":3,"😀":1,"�":2}',canonicalize(obj))

    def test_installed_reader_validator_is_not_dependent_on_tools_tree(self):
        result=validate_package(ROOT/'examples'/'web-course.p2rln',strict_profiles=True)
        self.assertEqual('0.4.0',result['formatVersion'])

    def test_reader_capability_document_validates(self):
        from jsonschema import Draft202012Validator, FormatChecker
        schema=json.loads((ROOT/'schemas'/'capabilities.schema.json').read_text())
        doc=json.loads((ROOT/'p2rln_reader'/'capabilities.json').read_text())
        errors=list(Draft202012Validator(schema,format_checker=FormatChecker()).iter_errors(doc))
        self.assertEqual([],errors)


if __name__=='__main__': unittest.main()
