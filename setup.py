from pathlib import Path

from setuptools import find_packages, setup

# The README is the long description rather than a second one kept in step by
# hand; F4 is the standing lesson about two files naming the same thing.
README = (Path(__file__).parent / "README.md").read_text(encoding="utf-8")

setup(
    name="girder-flycut",
    version="1.0.0",
    description="Flyer Studio configuration, generation, and IGSN registration for Girder",
    long_description=README,
    long_description_content_type="text/markdown",
    author="Max Berner",
    author_email="bernermaximus@gmail.com",
    maintainer="Kacper Kowalik",
    maintainer_email="xarthisius.kk@gmail.com",
    url="https://github.com/htmdec/girder-flycut-studio",
    project_urls={
        "Source": "https://github.com/htmdec/girder-flycut-studio",
        "Issues": "https://github.com/htmdec/girder-flycut-studio/issues",
    },
    license="BSD-3-Clause",
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Environment :: Web Environment",
        "Framework :: Girder",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: BSD License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Scientific/Engineering",
    ],
    packages=find_packages(include=["girder_flycut", "girder_flycut.*"]),
    package_data={
        "girder_flycut": [
            "catalog.json",
            "presets.json",
            "web_client/dist/girder-plugin-flycut.umd.cjs",
            "web_client/dist/style.css",
            "inputs/templates/*.json",
            "inputs/templates/*.lbrn2",
        ]
    },
    python_requires=">=3.10",
    install_requires=[
        "girder-dashboards>=0.2.0",
        # 2.1.1 is the first release carrying create_batch()'s relation_type /
        # inverse_relation_type / child_titles arguments, which registering a
        # stack as a child deposition needs. See docs/JSONFORMS_COMPATIBILITY.md.
        "girder-jsonforms>=2.1.1",
        # The per-stack mutex is redis-py's own lock. Girder core already
        # depends on this and imports it at module scope, so it is always
        # installed; declared here because `rest/locking.py` imports it
        # directly rather than inheriting it.
        "redis",
    ],
    entry_points={"girder.plugin": ["flycut = girder_flycut:FlycutPlugin"]},
)
