from setuptools import find_packages, setup

setup(
    name="girder-flycut", version="1.0.0",
    description="Flyer Studio configuration, generation, and IGSN registration for Girder",
    packages=find_packages(include=["girder_flycut"]),
    package_data={"girder_flycut": ["catalog.json", "presets.json", "web_client/*.js", "inputs/templates/*.json", "inputs/templates/*.lbrn2"]},
    python_requires=">=3.10",
    install_requires=[
        "girder-dashboards>=0.2.0",
        # Flyer Studio registers each stack as a child deposition, which needs
        # create_batch()'s relation_type / inverse_relation_type / child_titles
        # arguments. That work lives on the `igsn` branch and has never been
        # released to PyPI, so this is a direct git reference rather than a
        # version range. See docs/JSONFORMS_COMPATIBILITY.md.
        "girder-jsonforms @ git+https://github.com/Xarthisius/girder-jsonforms.git@igsn",
    ],
    entry_points={"girder.plugin": ["flycut = girder_flycut:FlycutPlugin"]},
)
