# Elden Ring Savegame Analyzer

Aplicación React de solo lectura para analizar partidas de **Elden Ring en PC** (`ER0000.sl2` y `.co2`) directamente en el navegador. Convierte el formato binario BND4 en una vista comprensible y en exportaciones estructuradas pensadas para revisión humana o para pasarlas a un modelo de lenguaje.

> El nombre del paquete solicitado se conserva como `eldenring-savegame-analyzer`. La interfaz usa “Elden Ring Savegame Analyzer” como nombre visible.

## Qué incluye

- Lectura local de las 10 ranuras y de la tabla global de perfiles.
- Validación de la firma BND4, límites de lectura y checksum MD5 de cada ranura activa.
- Nivel, clase inicial, nombre, tiempo, atributos, PV/PC/aguante, runas, runas acumuladas, muertes y mancha de sangre.
- Equipo completo: armas, armadura, talismanes, ranuras rápidas, bolsa, hechizos y mezcla del Físico Maravilloso.
- Inventario y baúl con cantidades, mejoras, tipo, estado equipado y confianza semántica. Para herramientas, consumibles y materiales puede añadir resumen funcional, rareza y límites de almacenamiento.
- Regiones, última gracia, tiempo del mundo, montura, efectos, estado de DLC y numerosos bloques internos.
- Hitos inferidos desde banderas del save: jefes, gracias, recetarios, rodamientos y hojas de afilar cuando el catálogo los conoce.
- Análisis automático de build y recomendaciones basadas en evidencias del save.
- Calculadora de coste de niveles.
- Cuatro políticas de spoilers: sin spoilers, solo zonas, recuentos sin nombres y completista.
- Exportación JSON semántica, JSON forense y Markdown listo para una IA.
- Privacidad configurable; Steam IDs, coordenadas, IDs internos y bitfield de eventos están excluidos por defecto.
- Procesado pesado dentro de un Web Worker para no bloquear la interfaz.
- Diseño responsive pensado también para Steam Deck y pantallas táctiles.

## Privacidad y seguridad

El archivo seleccionado se procesa con `File.arrayBuffer()` dentro del navegador y se transfiere a un Web Worker. No hay API, base de datos, telemetría ni subida del save. La aplicación nunca escribe en el archivo original y no contiene funciones de edición.

Para dar nombre y contexto a IDs internos, la app descarga catálogos JSON estáticos desde revisiones fijadas de proyectos comunitarios. Se combinan listas de progreso con fichas enriquecidas de herramientas, consumibles y materiales. Esas peticiones **no contienen datos del save**. Si fallan, se usa un catálogo mínimo integrado y el parser binario sigue funcionando.

La exportación predeterminada elimina:

- Steam ID global y de personaje.
- Coordenadas y orientación precisas.
- Bitfield completo de eventos.
- Handles, offsets e IDs internos de bajo nivel.
- Huellas MD5 almacenadas y calculadas.
- El archivo binario original.

El nombre visible del personaje y el nombre base del fichero sí se incluyen para que el informe sea identificable. Revisa el JSON antes de compartirlo públicamente.

## Cobertura honesta

El formato de partida no está documentado oficialmente. La aplicación interpreta las estructuras comunitariamente conocidas y muestra un índice de bloques opacos para todo lo que aún no tiene una semántica pública fiable. “Completo” significa que el producto está listo para usar y conserva la información desconocida de forma trazable; no significa inventar un significado para cada byte.

Los “logros” de la interfaz son **hitos inferidos** desde inventario y banderas. No sustituyen al historial oficial de logros de Steam.

Consulta [`docs/FORMAT_COVERAGE.md`](docs/FORMAT_COVERAGE.md) para el detalle técnico y [`docs/EXPORTS.md`](docs/EXPORTS.md) para los esquemas, spoilers y reglas de privacidad.

## Desarrollo local

Requisitos:

- Node.js 22.12 o posterior.
- npm 10 o posterior.

```bash
npm install
npm run dev
```

La aplicación quedará disponible en la URL que indique Vite, normalmente `http://localhost:5173`.

### Validación

```bash
npm run typecheck
npm test
npm run build
```

O todo seguido:

```bash
npm run check
```

## Despliegue en Vercel

1. Sube esta carpeta a un repositorio Git.
2. Importa el repositorio en Vercel.
3. Vercel detectará Vite automáticamente.
4. Mantén los valores predeterminados:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
5. Despliega.

También se puede usar la CLI:

```bash
npm install -g vercel
vercel
vercel --prod
```

El archivo [`vercel.json`](vercel.json) aporta fallback SPA y cabeceras de seguridad. No se necesitan variables de entorno. Consulta también [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md).

## Arquitectura

```text
src/
├── App.tsx                  Interfaz y flujo de usuario
├── worker/save.worker.ts    Parseo fuera del hilo principal
├── lib/save-parser.ts       Lectura BND4 y estructuras binarias
├── lib/binary-reader.ts     Lectura segura little-endian
├── lib/md5.ts               Validación de checksum sin dependencias
├── lib/catalog.ts           Catálogos semánticos fijados y caché
├── lib/semantic.ts          Resolución de IDs y progreso
├── lib/build-advisor.ts     Inferencias de build y curva de runas
├── lib/export.ts            JSON/Markdown y reglas de privacidad
├── data/fallback-catalog.ts Catálogo mínimo sin conexión
└── types.ts                 Contratos de datos
```

El parser no depende de React, por lo que se puede reutilizar en otra interfaz. La capa semántica está separada del parseo: un valor binario puede ser correcto aunque su nombre todavía no esté en el catálogo.

## Exportaciones

### JSON semántico

Es la opción recomendada para una IA. Incluye datos útiles, interpretación de build, equipo, inventario y progreso, con avisos metodológicos y de privacidad.

Esquema actual:

```text
eldenring-savegame-analyzer.semantic.v1
```

### JSON forense

Añade la estructura parseada y recuentos técnicos. Sigue respetando los interruptores de privacidad. El bitfield de eventos, los IDs de bajo nivel y las huellas MD5 solo aparecen mediante consentimiento explícito.

### Informe Markdown

Genera un prompt autocontenido con reglas anti-spoiler y un inventario legible. Resulta útil al pegarlo directamente en ChatGPT u otro modelo. En modo preciso añade solo recuentos pendientes; en modo completista puede añadir nombres y lo advierte explícitamente.

## Compatibilidad

- Partidas nativas de Elden Ring para PC con firma `BND4`.
- Extensiones `.sl2` y `.co2`.
- El archivo aportado durante el desarrollo, con versión interna 252, fue utilizado como prueba real sin incorporarlo al repositorio.
- No se admiten saves de PlayStation/Xbox ni formatos comprimidos o cifrados por herramientas externas.

## Registro de validación

La validación realizada sobre parser, privacidad, TypeScript y la partida de prueba está documentada en [`VALIDATION.md`](VALIDATION.md). El save real no está incluido.

## Limitaciones conocidas

- Los nombres y descripciones dependen de catálogos comunitarios y pueden tardar unos segundos en cargarse la primera vez. El parser y el catálogo mínimo integrado siguen disponibles sin conexión.
- Las actualizaciones futuras del juego pueden introducir campos o versiones nuevas. El parser falla de forma segura o muestra una advertencia en vez de escribir datos incorrectos.
- El análisis de build es heurístico: informa evidencias y evita presentar recomendaciones como hechos del juego.
- No calcula daño exacto, carga de equipo o resistencias porque esos valores requieren parámetros completos de regulación y reglas de escalado adicionales.
- No consulta Steamworks; por tanto, no puede certificar logros oficiales.

## Propiedad intelectual

Proyecto no oficial y no afiliado con FromSoftware ni Bandai Namco Entertainment. “Elden Ring” y sus datos pertenecen a sus respectivos titulares. El proyecto no distribuye recursos gráficos, audio ni archivos del juego.

Consulta [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) para las atribuciones de datos comunitarios.

## Licencia

Código propio bajo licencia MIT. Los datos externos mantienen sus licencias y atribuciones originales.
