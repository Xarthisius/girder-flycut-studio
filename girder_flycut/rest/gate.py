"""Dashboard access, and the decorator that applies it to a route."""

from functools import wraps
from inspect import signature

from girder.constants import AccessType
from girder.exceptions import RestException
from girder_dashboards.models.dashboard import Dashboard

from .. import KEY


class GateMixin:
    """Supplies `gate()`, which every route in this resource goes through."""

    def gate(self):
        """The signed-in user, if this dashboard is on and readable by them."""
        user = self.getCurrentUser()
        doc = Dashboard().findOne({"key": KEY})
        if not doc or not doc.get("enabled") or not Dashboard().hasAccess(doc, user, AccessType.READ):
            raise RestException("This dashboard is disabled or inaccessible.", code=403)
        return user


def gated(method):
    """Gate a route, handing it the signed-in user if it asks for one.

    Declaring a `user` parameter is what asks for it; handlers that only need
    the check omit it. That is decided once, at import time, rather than per
    request.

    Goes *below* `@autoDescribeRoute`, which inspects the handler's signature
    through `functools.wraps` and fills only the parameters its `Description`
    declares -- so the injected `user` is never mistaken for a query
    parameter. Where a route also locks a stack, this goes *above*
    `@stack_locked`, so a request that is about to be refused never takes the
    lock.
    """
    wants_user = "user" in signature(method).parameters

    @wraps(method)
    def wrapped(self, *args, **kwargs):
        user = self.gate()
        if wants_user:
            kwargs["user"] = user
        return method(self, *args, **kwargs)

    return wrapped
