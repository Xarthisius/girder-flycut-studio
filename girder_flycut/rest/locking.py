"""The per-stack mutex decorator, shared by the routes that move a stack."""

from functools import wraps

from ..artifacts import configuration
from ..models import FlycutConfig, StackLock
from ..schema import unpack


def stack_locked(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        if method.__name__ == "save_config":
            if not kwargs.get("submit", False):
                return method(self, *args, **kwargs)
            raw = kwargs.get("config", args[0] if args else {})
        else:
            identifier = kwargs.get("id", args[0] if args else "")
            raw = configuration(FlycutConfig().load(identifier, user=self.gate()))
        stack = str(unpack(raw).get("run_params", {}).get("stackid", "")).strip().upper()
        with StackLock().hold(stack):
            return method(self, *args, **kwargs)

    return wrapped
