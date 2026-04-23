#!/usr/bin/env python3
"""Start llama_cpp.server after closing inherited non-stdio file descriptors."""

import os
import site
import sys

try:
    import resource
except ImportError:
    resource = None


def close_extra_fds():
    if resource is None:
        return

    try:
        _soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        if hard == resource.RLIM_INFINITY:
            max_fd = 65536
        else:
            max_fd = min(int(hard), 65536)
    except Exception:
        max_fd = 4096

    os.closerange(3, max_fd)


def main():
    usersite = site.getusersitepackages()
    if usersite not in sys.path:
        sys.path.append(usersite)

    close_extra_fds()
    from llama_cpp.server.__main__ import main as llama_main

    return llama_main()


if __name__ == "__main__":
    sys.exit(main())
