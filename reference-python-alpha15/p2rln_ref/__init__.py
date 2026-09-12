"""Reference P2RLN 0.4.0 reader primitives.

This module is deliberately small and dependency-light.  It is not a runtime for
SCORM/H5P/QTI/LTI; it validates, indexes, resolves and plans delivery while the
specialized profile runtime remains authoritative.
"""
from .reader import P2RLNReader, ReadError, CapabilitySet
from .native_component import NativeComponentError, require_runtime_contract, validate_component_instance
from .component_authoring import ComponentAuthoringError, reference_component_catalog
from .native_questionnaire import NativeQuestionnaireError, score_questionnaire, validate_questionnaire
from .range_integrity import RangeIntegrityError, validate_range_integrity_map

__all__ = [
    "P2RLNReader",
    "ReadError",
    "CapabilitySet",
    "NativeComponentError",
    "validate_component_instance",
    "require_runtime_contract",
    "ComponentAuthoringError",
    "reference_component_catalog",
    "NativeQuestionnaireError",
    "score_questionnaire",
    "validate_questionnaire",
    "RangeIntegrityError",
    "validate_range_integrity_map",
]
