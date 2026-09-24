from setuptools import find_packages, setup

setup(
    name="girder-flycut", version="1.0.0",
    description="Flyer Studio configuration, generation, and IGSN registration for Girder",
    packages=find_packages(include=["girder_flycut"]),
    package_data={"girder_flycut": ["catalog.json", "presets.json", "web_client/*.js", "inputs/templates/*.json", "inputs/templates/*.lbrn2"]},
    python_requires=">=3.10",
    install_requires=["girder-dashboards>=0.2.0", "girder-jsonforms>=2.1.1"],
    entry_points={"girder.plugin": ["flycut = girder_flycut:FlycutPlugin"]},
)
