# Jupyter

Notebook cells on the Orkestri canvas: Python code cells that run on a real Jupyter kernel, linked into pipelines (the
cells of a chain share one kernel and run in link order), with their outputs (text, results, errors, pictures) in the
card. Terminals linked to a cell create, edit, run and read the cells of its pipeline (`AGENTS.md`). A `.ipynb` can be
imported as a chain of cells and a pipeline exported as one.

The cell card is drawn by Orkestri itself; this extension unlocks it and brings the Python it runs on. While the
extension is not installed or is disabled, the cells are not in the Adicionar menus, the cells already on a canvas show
that the extension is off (with a button to the store), and `orkestri cell` says where to get it.

- **Installing it** downloads a portable CPython 3.12.16 for Windows x64 (python-build-standalone's
  `install_only_stripped` build, 21 MB, checked against its pinned sha256) into `<profile>\apps\jupyter-python\3.12.16`,
  then installs ipykernel 7.4.0 and what it needs from PyPI into that Python (about 170 MB in all, under a minute on a
  good connection). The store shows the progress. Nothing system-wide: no PATH change, no registry entry, no pip cache,
  no user site-packages; the computer needs no Python. This package holds no Python file.
- **The kernel** runs on that Python by default. A Python of the computer that already has ipykernel (a `python.exe`
  on PATH whose environment holds it) can be chosen instead: the menu of a cell's header glyph lists them and checks
  the one in use. Changing it restarts the kernels.
- **Packages:** `%pip install numpy` in a cell installs into the kernel's Python (IPython runs that Python's own pip),
  and `import numpy` works at once, no restart. For the extension's own Python they go into its folder only.
- **Lifecycle:** a kernel runs with no console window inside a job object: it ends with its cells, when the
  extension is disabled or uninstalled, on Restart, and when Orkestri ends in any way. No process is left behind.
- **Uninstalling** keeps the downloaded Python (as Orkestri does with every downloaded program); delete
  `<profile>\apps\jupyter-python` to free its space.

Licences: Python is under the [PSF License](https://docs.python.org/3/license.html); the
[python-build-standalone](https://github.com/astral-sh/python-build-standalone) builds carry the licences of what they
bundle (in the build's own files), their build scripts are MPL-2.0. ipykernel, IPython and the Jupyter libraries are
BSD-3-Clause (Project Jupyter), pip is MIT. The extension is free and distributes none of them: the computer downloads
them from their own distributions (python-build-standalone's GitHub releases, PyPI). Jupyter is a trademark of its
owners; this extension is not made or endorsed by Project Jupyter, and its icon is its own (Jupyter's logo is not
used).
