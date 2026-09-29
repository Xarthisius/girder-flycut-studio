"""Girder models for Flyer Studio.

A configuration is an ``Item`` carrying a ``meta.flycut`` blob rather than a
document in a collection of its own, so :py:class:`FlycutConfig` subclasses
``Item`` instead of standing beside it. That keeps item ACL semantics -- an
item inherits its folder's permissions -- while giving the lifecycle and
workspace-containment rules one home.
"""

from .config import FlycutConfig

__all__ = ["FlycutConfig"]
