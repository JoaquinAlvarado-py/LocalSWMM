# LocalSWMM Documentation

LocalSWMM is a web application for 1D hydraulic modeling and simulation of stormwater and wastewater networks. The core of this project is based on the [HydroCouple OpenSWMM engine](https://www.hydrocouple.org/openswmm.engine/), which was compiled to WebAssembly and runs entirely in the browser.

The following documentation has been redacted by the author based on [Diátaxis](https://diataxis.fr/), which divides documentation by the user needs into four quadrants:

| Quadrant | Answers | Read it when |
|---|---|---|
| [Tutorials](tutorials/) | learning | You want to learn how to build and simulate networks, step by step, from scratch. |
| [How-to guides](how-to/) | doing | You want to accomplish a concrete task: run the app, configure it, build from source, deploy, fix a problem. |
| [Reference](reference/) | knowing | You need an exact fact, such as data formats, engine options, glossary terms. |
| [Explanation](explanation/) | understanding | You want to understand *how and why* the engine computes what it computes: architecture, 1D hydraulics, engine modifications. |

## Orientation

If this is your first time using SWMM based products, the author heavily suggests diving into the [official SWMM documentation](https://www.epa.gov/water-research/storm-water-management-model-swmm) before even considering using this app, mainly because some of the legacy methods that the OpenSWMM engine uses have already been documented by the [OpenSWMM community](https://www.openswmm.org/Code/Home), this project is focused on the newer methods that have been discussed and implemented by the OpenSWMM community since 2023. 

- **New to LocalSWMM?** Start with the [tutorials](tutorials/) — they teach by doing.
- **Have a specific task?** Go straight to the [how-to guides](how-to/).
- **Need a fact?** Look it up in the [reference](reference/).
- **Want to understand the math or the architecture?** Read the [explanation](explanation/).

## Languages

- [English](/) (primary)
- [Español](/es/)

## Related

- [Repository README](https://github.com/JoaquinAlvarado-py/LocalSWMM) . Where you can find the project overview and quick start
- [CONTEXT.md](https://github.com/JoaquinAlvarado-py/LocalSWMM/blob/experimental/CONTEXT.md) . Domain glossary and terminology (Español)
