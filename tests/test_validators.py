"""The custom-field rule, which was a triple negative inside an `any()`.

Backend review item 7. The condition read
`not (submitted and v is None) and (not isinstance(...) or not str(v).strip())`,
nested inside an `any()` that was itself negated -- and the one case that
matters, a null value on a submission, was invisible in it.
"""

import pytest

from girder_flycut.validation import _custom_field_is_valid, _validate_custom_fields


@pytest.mark.parametrize(
    ("value", "draft", "submitted"),
    [
        ("7.5", True, True),
        (7.5, True, True),
        (0, True, True),
        (False, True, True),
        # Submitting renders every declared field, including the empty ones;
        # `None` is what that renders from. A draft has no such rendering.
        (None, False, True),
        # A blank string is blank either way -- it is not the rendered null.
        ("", False, False),
        ("   ", False, False),
        ([], False, False),
        ({}, False, False),
    ],
)
def test_a_value_is_acceptable_when(value, draft, submitted):
    assert _custom_field_is_valid("glass_tl_mm", value, submitted=False) is draft
    assert _custom_field_is_valid("glass_tl_mm", value, submitted=True) is submitted


@pytest.mark.parametrize("name", ["", "   ", "\t"])
def test_a_name_is_always_required(name):
    assert _custom_field_is_valid(name, "7.5", submitted=False) is False
    assert _custom_field_is_valid(name, "7.5", submitted=True) is False


def test_validate_custom_fields_accepts_and_refuses_the_whole_mapping():
    _validate_custom_fields({}, submitted=False)
    _validate_custom_fields({"a": "1", "b": 2}, submitted=False)
    _validate_custom_fields({"a": None}, submitted=True)
    with pytest.raises(ValueError):
        _validate_custom_fields({"a": None}, submitted=False)
    with pytest.raises(ValueError):
        _validate_custom_fields({"a": "1", "": "2"}, submitted=True)
    with pytest.raises(ValueError):
        _validate_custom_fields([("a", "1")], submitted=True)
