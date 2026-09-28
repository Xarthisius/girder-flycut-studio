"""The per-stack mutex decorator, shared by the routes that move a stack."""

from functools import wraps

from ..artifacts import configuration
from ..models import StackLock
from ..schema import unpack


def stack_locked(method):
    """Hold this stack's mutex for the length of the call.

    Two shapes of route use this. `save_config` is handed a builder
    configuration and only locks when it is being submitted, since a draft
    save claims no stack. The three lifecycle transitions are handed the
    configuration itself, by `modelParam`, so the stack ID comes from a
    document this decorator no longer has to load a second time.

    Sits *below* `@gated`, so the dashboard check has already run and a
    request about to be refused never takes the lock.
    """

    @wraps(method)
    def wrapped(self, *args, **kwargs):
        if method.__name__ == "save_config":
            if not kwargs.get("submit", False):
                return method(self, *args, **kwargs)
            raw = kwargs.get("config", args[0] if args else {})
        else:
            raw = configuration(kwargs["item"])
        stack = str(unpack(raw).get("run_params", {}).get("stackid", "")).strip().upper()
        with StackLock().hold(stack):
            return method(self, *args, **kwargs)

    return wrapped
