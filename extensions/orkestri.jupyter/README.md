# Jupyter

Notebook cells on the Orkestri canvas: Python code cells that run on a real Jupyter kernel, linked into pipelines (the
cells of a chain share one kernel and run in link order), with their outputs (text, results, errors, pictures) in the
card. Terminals linked to a cell create, edit, run and read the cells of its pipeline (`AGENTS.md`). A `.ipynb` can be
imported as a chain of cells and a pipeline exported as one.

The cell card is drawn by Orkestri itself; this extension unlocks it and brings the Python it runs on. While the
extension is not installed or is disabled, the cells are not in the Adicionar menus, the cells already on a canvas show
that the extension is off (with a button to the store), and `orkestri cell` says where to get it.

- **Growing a pipeline:** the "+" on a cell's bottom edge (while the pointer is over it), "Adicionar célula abaixo" in
  the menu of its header's glyph, or Alt+Enter in its code (which runs it first) adds the next cell under it, linked
  after it; in the middle of a pipeline the new cell goes between it and the next one. The new cell takes the keyboard.
- **The Python comes inside the package:** `python/` is a portable CPython 3.12.16 for Windows x64
  (python-build-standalone's `install_only_stripped` build, pinned by sha256) with ipykernel 7.4.0 and what it needs
  installed from the wheels pinned in `python-requirements.txt` (sha256 each). Installing the extension only unpacks
  it: no download, no setup step, no Python needed on the computer, nothing system-wide (no PATH change, no registry
  entry). It is built by `tools/jupyter-python.py` of the Orkestri repository, which also strips what a kernel never
  uses: bytecode caches (Python writes them again), Tk and IDLE, C headers, test suites. jedi (IPython's completion)
  and debugpy (the Jupyter debugger) are left out, as the cells use neither: `%pip install jedi debugpy` brings them
  back.
- **The kernel** runs on that Python by default. A Python of the computer that already has ipykernel (a `python.exe`
  on PATH whose environment holds it) can be chosen instead in the same header menu, which checks the one in use.
  Changing it restarts the kernels.
- **The controller** (`kernel.py`, the manifest's `controller`): Orkestri draws the cells; everything that talks to
  the kernel is this script, run by the package's Python with jupyter_client, one per pipeline. It starts the kernel
  (its environment: the folders of `%pip install` below), runs each cell and sends the kernel's messages back as they
  come, interrupts it and stops it, over JSON lines on its stdin and stdout.
- **Packages:** `%pip install numpy` in a cell installs it for the kernel's Python and `import numpy` works at once, no
  restart. For the extension's own Python the packages go into `<profile>\extensions-data\orkestri.jupyter\python-packages`
  (kept across updates of the extension), never into the person's own Python folders.
- **Lifecycle:** a kernel runs with no console window inside a job object: it ends with its cells, when the
  extension is disabled or uninstalled, on Restart, and when Orkestri ends in any way. No process is left behind.

Licences: Python is under the [PSF License](https://docs.python.org/3/license.html) (`python/LICENSE.txt`, which also
holds the licences of what CPython bundles: OpenSSL, SQLite, libffi, zlib, bzip2, xz and others); the
[python-build-standalone](https://github.com/astral-sh/python-build-standalone) build scripts are MPL-2.0. ipykernel,
IPython and the Jupyter libraries are BSD-3-Clause (Project Jupyter), pip MIT, and every package keeps its own licence
in its `*.dist-info` folder under `python/Lib/site-packages`. They are redistributed unchanged as those licences allow.
Jupyter is a trademark of its owners; this extension is not made or endorsed by Project Jupyter, and its icon is its
own (Jupyter's logo is not used).
