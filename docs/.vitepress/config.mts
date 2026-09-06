import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "LocalSWMM",
  description: "1D hydraulic modeling and simulation in the browser",
  base: "/docs/",
  outDir: "../public/docs",
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Tutorials', link: '/tutorials/' },
      { text: 'How-to', link: '/how-to/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'Explanation', link: '/explanation/' }
    ],
    sidebar: [
      {
        text: 'Tutorials',
        collapsed: false,
        items: [
          { text: 'Getting started', link: '/tutorials/01-getting-started' },
          { text: 'Your first network', link: '/tutorials/02-your-first-network' }
        ]
      },
      {
        text: 'How-to guides',
        collapsed: false,
        items: [
          { text: 'Run locally', link: '/how-to/01-run-locally' },
          { text: 'Configure', link: '/how-to/02-configure' },
          { text: 'Build from source', link: '/how-to/03-build-from-source' },
          { text: 'Scripts & benchmarks', link: '/how-to/04-scripts-and-benchmarks' },
          { text: 'Deploy', link: '/how-to/05-deploy' },
          { text: 'Contribute', link: '/how-to/06-contribute' },
          { text: 'Troubleshoot', link: '/how-to/07-troubleshoot' }
        ]
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Engine options', link: '/reference/01-engine-options' },
          { text: 'Repository layout', link: '/reference/02-repository-layout' },
          { text: 'Technology stack', link: '/reference/03-technology-stack' },
          { text: 'Network data model', link: '/reference/04-network-data-model' },
          { text: 'Data formats', link: '/reference/05-data-formats' },
          { text: 'API endpoints', link: '/reference/06-api-endpoints' },
          { text: 'Scripts & benchmarks', link: '/reference/07-scripts-and-benchmarks' },
          { text: 'Glossary', link: '/reference/08-glossary' }
        ]
      },
      {
        text: 'Explanation',
        collapsed: false,
        items: [
          { text: 'Architecture', link: '/explanation/01-architecture' },
          { text: 'Simulation pipeline', link: '/explanation/02-simulation-pipeline' },
          { text: 'Map & rendering', link: '/explanation/03-map-and-rendering' },
          {
            text: '1D Hydraulics',
            collapsed: false,
            items: [
              { text: 'Conceptual model', link: '/explanation/hydraulics/01-conceptual-model' },
              { text: 'Model components', link: '/explanation/hydraulics/02-model-components' },
              { text: 'Simulation orchestration', link: '/explanation/hydraulics/03-simulation-orchestration' },
              { text: 'Cross-section geometry', link: '/explanation/hydraulics/04-cross-section-geometry' },
              { text: 'Routing formulations', link: '/explanation/hydraulics/05-routing-formulations' },
              { text: 'Dynamic wave solver', link: '/explanation/hydraulics/06-dynamic-wave-solver' },
              { text: 'Link momentum kernel', link: '/explanation/hydraulics/07-link-momentum-kernel' },
              { text: 'Node continuity', link: '/explanation/hydraulics/08-node-continuity' },
              { text: 'Surcharge methods', link: '/explanation/hydraulics/09-surcharge-methods' },
              { text: 'Structures & boundaries', link: '/explanation/hydraulics/10-structures-and-boundaries' },
              { text: 'Stability & time stepping', link: '/explanation/hydraulics/11-stability-and-time-stepping' },
              { text: 'Options & defaults', link: '/explanation/hydraulics/12-options-and-defaults' }
            ]
          },
          {
            text: 'Engine modifications',
            collapsed: false,
            items: [
              { text: 'Anderson acceleration', link: '/explanation/engine-modifications/03-anderson-acceleration' },
              { text: 'Dynamic Preissmann slot', link: '/explanation/engine-modifications/04-dynamic-preissmann-slot' },
              { text: 'Virtual junctions', link: '/explanation/engine-modifications/05-virtual-junctions' },
              { text: 'Finite-volume routing', link: '/explanation/engine-modifications/06-finite-volume-routing' },
              { text: 'RDII decay', link: '/explanation/engine-modifications/08-rdii-decay' },
              { text: 'Behavior changes', link: '/explanation/engine-modifications/09-behavior-changes' }
            ]
          },
          {
            text: 'Technical notes',
            collapsed: false,
            items: [
              { text: '1D engine process', link: '/explanation/notes/01-1d-engine-process' },
              { text: 'Node continuity formulations', link: '/explanation/notes/02-node-continuity-formulations' },
              { text: 'Semi-implicit update math', link: '/explanation/notes/03-semi-implicit-update-math' },
              { text: 'Anderson acceleration', link: '/explanation/notes/04-anderson-acceleration' }
            ]
          }
        ]
      }
    ]
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US'
    },
    es: {
      label: 'Español',
      lang: 'es-CL',
      link: '/es/',
      themeConfig: {
        nav: [
          { text: 'Inicio', link: '/es/' },
          { text: 'Tutoriales', link: '/es/tutorials/' },
          { text: 'Cómo hacer', link: '/es/how-to/' },
          { text: 'Referencia', link: '/es/reference/' },
          { text: 'Explicación', link: '/es/explanation/' }
        ],
        sidebar: [
          {
            text: 'Tutoriales',
            collapsed: false,
            items: [
              { text: 'Inicio rápido', link: '/es/tutorials/01-inicio-rapido' },
              { text: 'Tu primera red', link: '/es/tutorials/02-tu-primera-red' }
            ]
          },
          {
            text: 'Guías de cómo hacer',
            collapsed: false,
            items: [
              { text: 'Ejecutar localmente', link: '/es/how-to/01-ejecutar-localmente' },
              { text: 'Configurar', link: '/es/how-to/02-configurar' },
              { text: 'Compilar desde fuente', link: '/es/how-to/03-compilar-desde-fuente' },
              { text: 'Scripts y benchmarks', link: '/es/how-to/04-scripts-y-benchmarks' },
              { text: 'Desplegar', link: '/es/how-to/05-desplegar' },
              { text: 'Contribuir', link: '/es/how-to/06-contribuir' },
              { text: 'Solucionar problemas', link: '/es/how-to/07-solucionar-problemas' }
            ]
          },
          {
            text: 'Referencia',
            collapsed: false,
            items: [
              { text: 'Opciones del motor', link: '/es/reference/01-opciones-del-motor' },
              { text: 'Estructura del repositorio', link: '/es/reference/02-estructura-del-repositorio' },
              { text: 'Pila tecnológica', link: '/es/reference/03-pila-tecnologica' },
              { text: 'Modelo de datos de red', link: '/es/reference/04-modelo-de-datos-de-red' },
              { text: 'Formatos de datos', link: '/es/reference/05-formatos-de-datos' },
              { text: 'Endpoints de API', link: '/es/reference/06-endpoints-de-api' },
              { text: 'Scripts y benchmarks', link: '/es/reference/07-scripts-y-benchmarks' },
              { text: 'Glosario', link: '/es/reference/08-glosario' }
            ]
          },
          {
            text: 'Explicación',
            collapsed: false,
            items: [
              { text: 'Arquitectura', link: '/es/explanation/01-arquitectura' },
              { text: 'Pipeline de simulación', link: '/es/explanation/02-pipeline-de-simulacion' },
              { text: 'Mapa y renderizado', link: '/es/explanation/03-mapa-y-renderizado' },
              {
                text: 'Hidráulica 1D',
                collapsed: false,
                items: [
                  { text: 'Modelo conceptual', link: '/es/explanation/hidraulica/01-modelo-conceptual' },
                  { text: 'Componentes del modelo', link: '/es/explanation/hidraulica/02-componentes-del-modelo' },
                  { text: 'Orquestación de la simulación', link: '/es/explanation/hidraulica/03-orquestacion-de-la-simulacion' },
                  { text: 'Geometría de secciones', link: '/es/explanation/hidraulica/04-geometria-de-secciones' },
                  { text: 'Formulaciones de tránsito', link: '/es/explanation/hidraulica/05-formulaciones-de-transito' },
                  { text: 'Solver de onda dinámica', link: '/es/explanation/hidraulica/06-solver-de-onda-dinamica' },
                  { text: 'Kernel de momentum de enlaces', link: '/es/explanation/hidraulica/07-kernel-de-momentum-de-enlaces' },
                  { text: 'Continuidad de nodo', link: '/es/explanation/hidraulica/08-continuidad-de-nodo' },
                  { text: 'Métodos de sobrenivel', link: '/es/explanation/hidraulica/09-metodos-de-sobrenivel' },
                  { text: 'Estructuras y condiciones de borde', link: '/es/explanation/hidraulica/10-estructuras-y-condiciones-de-borde' },
                  { text: 'Estabilidad y paso de tiempo', link: '/es/explanation/hidraulica/11-estabilidad-y-paso-de-tiempo' },
                  { text: 'Opciones y valores por defecto', link: '/es/explanation/hidraulica/12-opciones-y-valores-por-defecto' }
                ]
              },
              {
                text: 'Modificaciones del motor',
                collapsed: false,
                items: [
                  { text: 'Aceleración de Anderson', link: '/es/explanation/modificaciones-motor/03-aceleracion-de-anderson' },
                  { text: 'Ranura de Preissmann dinámica', link: '/es/explanation/modificaciones-motor/04-ranura-de-preissmann-dinamica' },
                  { text: 'Uniones virtuales', link: '/es/explanation/modificaciones-motor/05-uniones-virtuales' },
                  { text: 'Tránsito por volúmenes finitos', link: '/es/explanation/modificaciones-motor/06-transito-por-volumenes-finitos' },
                  { text: 'RDII decay', link: '/es/explanation/modificaciones-motor/08-rdii-decay' },
                  { text: 'Cambios de comportamiento', link: '/es/explanation/modificaciones-motor/09-cambios-de-comportamiento' }
                ]
              },
              {
                text: 'Notas técnicas',
                collapsed: false,
                items: [
                  { text: 'Proceso 1D por paso', link: '/es/explanation/notas/01-proceso-1d-por-paso' },
                  { text: 'Formulaciones de continuidad de nodo', link: '/es/explanation/notas/02-formulaciones-de-continuidad-de-nodo' },
                  { text: 'Matemática de la actualización semi-implícita', link: '/es/explanation/notas/03-matematica-de-la-actualizacion-semi-implicita' },
                  { text: 'Aceleración de Anderson', link: '/es/explanation/notas/04-aceleracion-de-anderson' }
                ]
              }
            ]
          }
        ]
      }
    }
  }
})
